import type { Fournisseur, ModeleInfo } from "@/lib/types";
import { erreurDepuisReponse, erreurDepuisReseau, ErreurAtelier } from "@/lib/erreurs";
import { lireFluxSse } from "@/lib/sse";
import { lireSecret } from "@/lib/trousseau";
import { prereglage } from "./prereglages";
import type { Adaptateur, EvenementGeneration, OptionsGeneration } from "./types";
import { racineV1 } from "./types";

/**
 * Adaptateur compatible OpenAI — `POST /v1/chat/completions`.
 *
 * Il couvre OpenRouter, OpenAI, Groq, DeepSeek, Mistral, Ollama et tout point
 * de terminaison qui parle la même grammaire. C'est ce qui permet au PRD de
 * promettre qu'un nouveau fournisseur ne demande qu'une entrée de configuration.
 */

interface ModeleOpenRouter {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  architecture?: { input_modalities?: unknown };
}

/** OpenRouter publie ses tarifs en dollars par jeton ; l'app raisonne par million. */
function prixParMillion(valeur: unknown): number | null {
  if (typeof valeur !== "string" && typeof valeur !== "number") return null;
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre) || nombre < 0) return null;
  return nombre * 1_000_000;
}

export function creerAdaptateurOpenAi(fournisseur: Fournisseur): Adaptateur {
  const racine = racineV1(fournisseur.baseUrl);
  const reglage = prereglage(fournisseur.presetId);

  async function entetes(): Promise<Record<string, string>> {
    const cle = await lireSecret(fournisseur.cleRef);
    const base: Record<string, string> = {
      "content-type": "application/json",
      ...(reglage?.entetes ?? {}),
    };
    // Ollama en local n'attend aucune clé : on n'envoie pas d'en-tête vide.
    if (cle) base.authorization = `Bearer ${cle}`;
    return base;
  }

  async function appeler(chemin: string, init: RequestInit): Promise<Response> {
    let reponse: Response;
    try {
      reponse = await fetch(`${racine}${chemin}`, { ...init, headers: await entetes() });
    } catch (cause) {
      throw erreurDepuisReseau(cause, {
        nomFournisseur: fournisseur.nom,
        baseUrl: fournisseur.baseUrl,
      });
    }
    if (!reponse.ok) {
      const corps = await reponse.text().catch(() => "");
      throw erreurDepuisReponse(reponse.status, corps, { nomFournisseur: fournisseur.nom });
    }
    return reponse;
  }

  async function listerModeles(signal?: AbortSignal): Promise<ModeleInfo[]> {
    const reponse = await appeler("/models", { method: "GET", signal });
    const charge = (await reponse.json()) as { data?: unknown[]; models?: unknown[] };
    const brut = charge.data ?? charge.models ?? [];

    return brut
      .map((entree) => {
        const m = entree as ModeleOpenRouter;
        const id = typeof m.id === "string" ? m.id : null;
        if (!id) return null;
        const modalites = Array.isArray(m.architecture?.input_modalities)
          ? (m.architecture.input_modalities as unknown[]).filter(
              (x): x is string => typeof x === "string",
            )
          : ["text"];
        return {
          id,
          nom: typeof m.name === "string" ? m.name : id,
          contexte: typeof m.context_length === "number" ? m.context_length : null,
          prixEntree: prixParMillion(m.pricing?.prompt),
          prixSortie: prixParMillion(m.pricing?.completion),
          modalites: modalites.map((x) => (x === "text" ? "texte" : x)),
        } satisfies ModeleInfo;
      })
      .filter((m): m is ModeleInfo => m !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  return {
    fournisseur,

    async verifierCle(signal) {
      // `GET /models` valide l'authentification sans consommer un seul jeton.
      // Certains points de terminaison ne l'exposent pas : on retombe alors sur
      // une complétion d'un jeton, comme le prévoit le PRD.
      try {
        await listerModeles(signal);
        return;
      } catch (cause) {
        if (cause instanceof ErreurAtelier && cause.categorie !== "configuration") throw cause;
      }

      const modele = fournisseur.modeleParDefaut ?? fournisseur.modeles?.[0]?.id;
      if (!modele) {
        throw new ErreurAtelier(
          "configuration",
          `${fournisseur.nom} n'expose pas de liste de modèles.`,
          {
            conseil:
              "Indiquez un identifiant de modèle par défaut dans la fiche du fournisseur pour " +
              "qu'Atelier puisse tester la clé.",
          },
        );
      }
      await appeler("/chat/completions", {
        method: "POST",
        signal,
        body: JSON.stringify({
          model: modele,
          max_tokens: 1,
          messages: [{ role: "user", content: "." }],
        }),
      });
    },

    listerModeles,

    async *generer(options: OptionsGeneration): AsyncGenerator<EvenementGeneration> {
      const corps: Record<string, unknown> = {
        model: options.modele,
        stream: true,
        max_tokens: options.maxJetons,
        messages: [
          { role: "system", content: options.systeme },
          ...options.messages.map((m) => ({
            role: m.role === "utilisateur" ? "user" : "assistant",
            content: m.contenu,
          })),
        ],
      };
      // `stream_options` fait remonter l'usage en fin de flux. Les serveurs qui
      // ne connaissent pas ce champ le rejettent parfois : il reste optionnel.
      if (reglage?.usageEnFlux !== false) corps.stream_options = { include_usage: true };

      const reponse = await appeler("/chat/completions", {
        method: "POST",
        signal: options.signal,
        body: JSON.stringify(corps),
      });
      if (!reponse.body) {
        throw new ErreurAtelier("serveur", `${fournisseur.nom} a renvoyé une réponse vide.`);
      }

      let entree = 0;
      let sortie = 0;
      let raison: string | null = null;
      let caracteres = 0;

      try {
        for await (const evenement of lireFluxSse(reponse.body, options.signal)) {
          if (evenement.donnees.trim() === "[DONE]") break;
          let charge: Record<string, unknown>;
          try {
            charge = JSON.parse(evenement.donnees) as Record<string, unknown>;
          } catch {
            continue;
          }

          const erreur = charge.error as { message?: string } | undefined;
          if (erreur) {
            throw new ErreurAtelier(
              "serveur",
              erreur.message ?? `${fournisseur.nom} a interrompu le flux.`,
            );
          }

          const choix = (charge.choices as Array<Record<string, unknown>> | undefined)?.[0];
          const delta = choix?.delta as
            | { content?: unknown; reasoning?: unknown; reasoning_content?: unknown }
            | undefined;

          if (typeof delta?.content === "string" && delta.content) {
            caracteres += delta.content.length;
            yield { type: "texte", delta: delta.content };
          }
          const reflexion = delta?.reasoning ?? delta?.reasoning_content;
          if (typeof reflexion === "string" && reflexion) {
            yield { type: "reflexion", delta: reflexion };
          }
          if (typeof choix?.finish_reason === "string") raison = choix.finish_reason;

          const usage = charge.usage as
            | { prompt_tokens?: number; completion_tokens?: number }
            | undefined;
          if (usage) {
            entree = usage.prompt_tokens ?? entree;
            sortie = usage.completion_tokens ?? sortie;
            yield { type: "usage", entree, sortie };
          }
        }
      } catch (cause) {
        throw erreurDepuisReseau(cause, {
          nomFournisseur: fournisseur.nom,
          baseUrl: fournisseur.baseUrl,
        });
      }

      // Sans `stream_options`, aucun décompte n'est renvoyé : on estime la
      // sortie à partir du texte reçu (~4 caractères par jeton) pour que le
      // compteur de coût reste informatif plutôt que vide.
      if (sortie === 0 && caracteres > 0) sortie = Math.round(caracteres / 4);

      yield { type: "usage", entree, sortie };
      yield { type: "fin", raison };
    },
  };
}

import type { Fournisseur, ModeleInfo } from "@/lib/types";
import { erreurDepuisReponse, erreurDepuisReseau, ErreurAtelier } from "@/lib/erreurs";
import { lireFluxSse } from "@/lib/sse";
import { lireSecret } from "@/lib/trousseau";
import type { Adaptateur, EvenementGeneration, OptionsGeneration } from "./types";
import { racineV1 } from "./types";

/**
 * Adaptateur Anthropic — `POST /v1/messages`.
 *
 * Appel direct depuis le navigateur : l'API l'autorise à condition d'envoyer
 * l'en-tête `anthropic-dangerous-direct-browser-access`. C'est exactement le
 * modèle d'Atelier — la clé appartient à l'utilisateur et ne transite par aucun
 * serveur intermédiaire — donc l'avertissement porté par le nom de cet en-tête
 * (« votre clé est exposée au client ») est ici une propriété recherchée, pas
 * un risque subi.
 */

const VERSION_API = "2023-06-01";

/**
 * Catalogue de repli, utilisé si `GET /v1/models` n'est pas joignable.
 * Tarifs en dollars par million de jetons.
 */
const CATALOGUE: Array<ModeleInfo & { maxSortie: number; reflexionAdaptative: boolean }> = [
  { id: "claude-opus-5", nom: "Claude Opus 5", contexte: 1_000_000, prixEntree: 5, prixSortie: 25, modalites: ["texte", "image"], maxSortie: 128_000, reflexionAdaptative: true },
  { id: "claude-fable-5", nom: "Claude Fable 5", contexte: 1_000_000, prixEntree: 10, prixSortie: 50, modalites: ["texte", "image"], maxSortie: 128_000, reflexionAdaptative: true },
  { id: "claude-sonnet-5", nom: "Claude Sonnet 5", contexte: 1_000_000, prixEntree: 2, prixSortie: 10, modalites: ["texte", "image"], maxSortie: 128_000, reflexionAdaptative: true },
  { id: "claude-opus-4-8", nom: "Claude Opus 4.8", contexte: 1_000_000, prixEntree: 5, prixSortie: 25, modalites: ["texte", "image"], maxSortie: 128_000, reflexionAdaptative: true },
  { id: "claude-opus-4-7", nom: "Claude Opus 4.7", contexte: 1_000_000, prixEntree: 5, prixSortie: 25, modalites: ["texte", "image"], maxSortie: 128_000, reflexionAdaptative: true },
  { id: "claude-opus-4-6", nom: "Claude Opus 4.6", contexte: 1_000_000, prixEntree: 5, prixSortie: 25, modalites: ["texte", "image"], maxSortie: 128_000, reflexionAdaptative: true },
  { id: "claude-sonnet-4-6", nom: "Claude Sonnet 4.6", contexte: 1_000_000, prixEntree: 3, prixSortie: 15, modalites: ["texte", "image"], maxSortie: 128_000, reflexionAdaptative: true },
  { id: "claude-haiku-4-5", nom: "Claude Haiku 4.5", contexte: 200_000, prixEntree: 1, prixSortie: 5, modalites: ["texte", "image"], maxSortie: 64_000, reflexionAdaptative: false },
];

export const MODELE_ANTHROPIC_PAR_DEFAUT = "claude-opus-5";

function tarifConnu(id: string) {
  return CATALOGUE.find((m) => m.id === id || id.startsWith(`${m.id}-`));
}

export function limiteSortieAnthropic(id: string): number {
  return tarifConnu(id)?.maxSortie ?? 32_000;
}

export function supporteReflexionAnthropic(id: string): boolean {
  return tarifConnu(id)?.reflexionAdaptative ?? false;
}

export function creerAdaptateurAnthropic(fournisseur: Fournisseur): Adaptateur {
  const racine = racineV1(fournisseur.baseUrl);

  async function entetes(): Promise<Record<string, string>> {
    const cle = await lireSecret(fournisseur.cleRef);
    if (!cle) {
      throw new ErreurAtelier(
        "cle-invalide",
        `La clé de ${fournisseur.nom} est introuvable dans le trousseau.`,
        { conseil: "Supprimez ce fournisseur et ajoutez-le à nouveau avec votre clé." },
      );
    }
    return {
      "content-type": "application/json",
      "x-api-key": cle,
      "anthropic-version": VERSION_API,
      "anthropic-dangerous-direct-browser-access": "true",
    };
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

  return {
    fournisseur,

    async verifierCle(signal) {
      // Appel minimal : un seul jeton demandé, sur le modèle le moins cher.
      await appeler("/messages", {
        method: "POST",
        signal,
        body: JSON.stringify({
          model: MODELE_ANTHROPIC_PAR_DEFAUT,
          max_tokens: 1,
          messages: [{ role: "user", content: "." }],
        }),
      });
    },

    async listerModeles(signal) {
      try {
        const reponse = await appeler("/models?limit=100", { method: "GET", signal });
        const charge = (await reponse.json()) as { data?: unknown[] };
        const distants = (charge.data ?? [])
          .map((brut) => {
            const m = brut as Record<string, unknown>;
            const id = typeof m.id === "string" ? m.id : null;
            if (!id) return null;
            const tarif = tarifConnu(id);
            const capacites = m.capabilities as Record<string, Record<string, unknown>> | undefined;
            const image = capacites?.image_input?.supported === true;
            return {
              id,
              nom: typeof m.display_name === "string" ? m.display_name : id,
              contexte:
                typeof m.max_input_tokens === "number" ? m.max_input_tokens : (tarif?.contexte ?? null),
              // Anthropic ne publie pas ses tarifs dans l'API : ils viennent du catalogue local.
              prixEntree: tarif?.prixEntree ?? null,
              prixSortie: tarif?.prixSortie ?? null,
              modalites: image ? ["texte", "image"] : ["texte"],
            } satisfies ModeleInfo;
          })
          .filter((m): m is ModeleInfo => m !== null);
        if (distants.length > 0) return distants;
      } catch (cause) {
        // Une clé refusée doit remonter ; le reste bascule sur le catalogue local.
        if (cause instanceof ErreurAtelier && cause.categorie === "cle-invalide") throw cause;
      }
      return CATALOGUE.map((entree) => ({
        id: entree.id,
        nom: entree.nom,
        contexte: entree.contexte,
        prixEntree: entree.prixEntree,
        prixSortie: entree.prixSortie,
        modalites: entree.modalites,
      }));
    },

    async *generer(options: OptionsGeneration): AsyncGenerator<EvenementGeneration> {
      const corps: Record<string, unknown> = {
        model: options.modele,
        max_tokens: Math.min(options.maxJetons, limiteSortieAnthropic(options.modele)),
        system: options.systeme,
        stream: true,
        messages: options.messages.map((m) => ({
          role: m.role === "utilisateur" ? "user" : "assistant",
          content: m.contenu,
        })),
      };

      if (options.reflexion && supporteReflexionAnthropic(options.modele)) {
        // `display: summarized` évite un long silence avant le premier caractère :
        // le résumé du raisonnement s'affiche pendant que le modèle travaille.
        corps.thinking = { type: "adaptive", display: "summarized" };
      }

      const reponse = await appeler("/messages", {
        method: "POST",
        signal: options.signal,
        body: JSON.stringify(corps),
      });
      if (!reponse.body) {
        throw new ErreurAtelier("serveur", `${fournisseur.nom} a renvoyé une réponse vide.`);
      }

      let entree = 0;
      let sortie = 0;

      try {
        for await (const evenement of lireFluxSse(reponse.body, options.signal)) {
          if (evenement.donnees === "[DONE]") break;
          let charge: Record<string, unknown>;
          try {
            charge = JSON.parse(evenement.donnees) as Record<string, unknown>;
          } catch {
            continue; // trame partielle ou commentaire : on l'ignore
          }

          const type = charge.type;
          if (type === "message_start") {
            const message = charge.message as { usage?: { input_tokens?: number } } | undefined;
            entree = message?.usage?.input_tokens ?? 0;
            yield { type: "usage", entree, sortie };
          } else if (type === "content_block_delta") {
            const delta = charge.delta as { type?: string; text?: string; thinking?: string };
            if (delta?.type === "text_delta" && delta.text) {
              yield { type: "texte", delta: delta.text };
            } else if (delta?.type === "thinking_delta" && delta.thinking) {
              yield { type: "reflexion", delta: delta.thinking };
            }
          } else if (type === "message_delta") {
            const usage = charge.usage as { output_tokens?: number } | undefined;
            if (typeof usage?.output_tokens === "number") {
              sortie = usage.output_tokens;
              yield { type: "usage", entree, sortie };
            }
          } else if (type === "error") {
            const erreur = charge.error as { message?: string } | undefined;
            throw new ErreurAtelier(
              "serveur",
              erreur?.message ?? `${fournisseur.nom} a interrompu le flux.`,
            );
          } else if (type === "message_stop") {
            break;
          }
        }
      } catch (cause) {
        throw erreurDepuisReseau(cause, {
          nomFournisseur: fournisseur.nom,
          baseUrl: fournisseur.baseUrl,
        });
      }

      yield { type: "usage", entree, sortie };
      yield { type: "fin", raison: null };
    },
  };
}

import { ErreurAtelier, erreurDepuisReponse, erreurDepuisReseau } from "@/lib/erreurs";
import type { Connecteur, ParametresPublication, ResultatPublication } from "./types";
import { cheminAbsolu, empreinteSha1, nomSite } from "./types";

/**
 * Publication sur Netlify, en trois appels documentés :
 *
 *   1. créer le site (seulement à la première publication du projet) ;
 *   2. annoncer un déploiement sous la forme d'un condensat SHA-1 par fichier ;
 *      Netlify répond avec la liste de ce qu'il ne possède pas encore ;
 *   3. téléverser uniquement ces fichiers-là.
 *
 * Le jeton appartient à l'utilisateur et suit le même chemin qu'une clé API :
 * trousseau chiffré, jamais journalisé, effacé avec le connecteur.
 */

const RACINE = "https://api.netlify.com/api/v1";

async function appeler(
  chemin: string,
  jeton: string,
  init: RequestInit & { corpsBrut?: BodyInit } = {},
): Promise<Response> {
  const entetes: Record<string, string> = { authorization: `Bearer ${jeton}` };
  if (!init.corpsBrut) entetes["content-type"] = "application/json";

  let reponse: Response;
  try {
    reponse = await fetch(`${RACINE}${chemin}`, {
      ...init,
      body: init.corpsBrut ?? init.body,
      headers: { ...entetes, ...(init.headers as Record<string, string> | undefined) },
    });
  } catch (cause) {
    throw erreurDepuisReseau(cause, { nomFournisseur: "Netlify", baseUrl: RACINE });
  }
  if (!reponse.ok) {
    const corps = await reponse.text().catch(() => "");
    throw erreurDepuisReponse(reponse.status, corps, { nomFournisseur: "Netlify" });
  }
  return reponse;
}

async function publier(parametres: ParametresPublication): Promise<ResultatPublication> {
  const { jeton, fichiers, nomProjet, identifiantSite, signal, surEtape } = parametres;
  if (fichiers.length === 0) {
    throw new ErreurAtelier("configuration", "Le projet ne contient aucun fichier à publier.");
  }

  let siteId = identifiantSite;
  let urlSite: string | null = null;

  if (!siteId) {
    surEtape?.("Création du site…");
    const reponse = await appeler("/sites", jeton, {
      method: "POST",
      signal,
      body: JSON.stringify({ name: nomSite(nomProjet) }),
    });
    const site = (await reponse.json()) as { id: string; ssl_url?: string; url?: string };
    siteId = site.id;
    urlSite = site.ssl_url ?? site.url ?? null;
  }

  surEtape?.("Préparation du déploiement…");
  const empreintes: Record<string, string> = {};
  const parEmpreinte = new Map<string, string>();
  for (const fichier of fichiers) {
    const empreinte = await empreinteSha1(fichier.contenu);
    empreintes[cheminAbsolu(fichier.chemin)] = empreinte;
    parEmpreinte.set(empreinte, fichier.contenu);
  }

  const reponseDeploiement = await appeler(`/sites/${siteId}/deploys`, jeton, {
    method: "POST",
    signal,
    body: JSON.stringify({ files: empreintes, async: false }),
  });
  const deploiement = (await reponseDeploiement.json()) as {
    id: string;
    required?: string[];
    ssl_url?: string;
    deploy_ssl_url?: string;
  };

  const manquants = deploiement.required ?? [];
  const cheminsParEmpreinte = new Map<string, string>();
  for (const [chemin, empreinte] of Object.entries(empreintes)) {
    if (!cheminsParEmpreinte.has(empreinte)) cheminsParEmpreinte.set(empreinte, chemin);
  }

  let envoyes = 0;
  for (const empreinte of manquants) {
    const chemin = cheminsParEmpreinte.get(empreinte);
    const contenu = parEmpreinte.get(empreinte);
    if (!chemin || contenu === undefined) continue;
    envoyes++;
    surEtape?.(`Envoi ${envoyes}/${manquants.length} — ${chemin.slice(1)}`);
    await appeler(`/deploys/${deploiement.id}/files${chemin}`, jeton, {
      method: "PUT",
      signal,
      corpsBrut: contenu,
      headers: { "content-type": "application/octet-stream" },
    });
  }

  surEtape?.("Finalisation…");
  const final = await appeler(`/sites/${siteId}`, jeton, { method: "GET", signal });
  const site = (await final.json()) as { ssl_url?: string; url?: string };

  const url = site.ssl_url ?? site.url ?? urlSite ?? deploiement.ssl_url ?? null;
  if (!url) {
    throw new ErreurAtelier("serveur", "Netlify n'a pas renvoyé l'adresse du site publié.");
  }

  return {
    url,
    identifiantSite: siteId,
    detail:
      manquants.length === 0
        ? "Aucun fichier modifié : le site était déjà à jour."
        : `${manquants.length} fichier${manquants.length > 1 ? "s" : ""} envoyé${manquants.length > 1 ? "s" : ""}.`,
  };
}

export const CONNECTEUR_NETLIFY: Connecteur = {
  id: "netlify",
  nom: "Netlify",
  mode: "automatique",
  urlJeton: "https://app.netlify.com/user/applications#personal-access-tokens",
  description: "Publication en une action, avec votre propre jeton personnel.",
  note: null,
  publier,
};

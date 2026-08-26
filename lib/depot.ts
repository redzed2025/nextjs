import {
  MAGASINS,
  ecrire,
  ecrireLot,
  ecrireMulti,
  identifiant,
  lire,
  lireParIndex,
  lireTout,
  supprimer,
  supprimerParIndex,
} from "./idb";
import { supprimerSecret } from "./trousseau";
import type {
  Deploiement,
  FichierProjet,
  Fournisseur,
  MessageProjet,
  Projet,
  Reglages,
  TypeCible,
  VersionProjet,
} from "./types";
import { REGLAGES_PAR_DEFAUT } from "./types";
import type { FichierAnalyse } from "./generation/analyse";

/**
 * Dépôt : tout ce que l'application lit et écrit passe par ici. Les pages ne
 * connaissent jamais IndexedDB directement.
 */

/* ---------------------------------------------------------------- réglages */

export async function lireReglages(): Promise<Reglages> {
  const stockes = await lire<Partial<Reglages>>(MAGASINS.reglages, "global");
  return { ...REGLAGES_PAR_DEFAUT, ...(stockes ?? {}) };
}

export async function ecrireReglages(reglages: Reglages): Promise<void> {
  await ecrire(MAGASINS.reglages, reglages, "global");
}

/* ------------------------------------------------------------ fournisseurs */

export async function listerFournisseurs(): Promise<Fournisseur[]> {
  const tous = await lireTout<Fournisseur>(MAGASINS.fournisseurs);
  return tous.sort((a, b) => a.creeLe - b.creeLe);
}

export async function enregistrerFournisseur(fournisseur: Fournisseur): Promise<void> {
  await ecrire(MAGASINS.fournisseurs, fournisseur);
}

/** Supprime le fournisseur *et* efface immédiatement sa clé du trousseau. */
export async function supprimerFournisseur(fournisseur: Fournisseur): Promise<void> {
  await supprimerSecret(fournisseur.cleRef);
  await supprimer(MAGASINS.fournisseurs, fournisseur.id);
}

/* ------------------------------------------------------------------ projets */

export async function listerProjets(): Promise<Projet[]> {
  const tous = await lireTout<Projet>(MAGASINS.projets);
  return tous.sort((a, b) => b.modifieLe - a.modifieLe);
}

export async function lireProjet(id: string): Promise<Projet | undefined> {
  return lire<Projet>(MAGASINS.projets, id);
}

export async function creerProjet(donnees: {
  nom: string;
  typeCible: TypeCible;
  fournisseurId: string | null;
  modele: string | null;
}): Promise<Projet> {
  const maintenant = Date.now();
  const projet: Projet = {
    id: identifiant(),
    nom: donnees.nom.trim() || "Projet sans nom",
    typeCible: donnees.typeCible,
    fournisseurId: donnees.fournisseurId,
    modele: donnees.modele,
    versionCourante: 0,
    plafond: null,
    maxJetons: null,
    reflexion: false,
    creeLe: maintenant,
    modifieLe: maintenant,
  };
  await ecrire(MAGASINS.projets, projet);
  return projet;
}

export async function majProjet(projet: Projet): Promise<Projet> {
  const suivant = { ...projet, modifieLe: Date.now() };
  await ecrire(MAGASINS.projets, suivant);
  return suivant;
}

export async function supprimerProjet(id: string): Promise<void> {
  await Promise.all([
    supprimerParIndex(MAGASINS.fichiers, "projet", id),
    supprimerParIndex(MAGASINS.messages, "projet", id),
    supprimerParIndex(MAGASINS.versions, "projet", id),
    supprimerParIndex(MAGASINS.deploiements, "projet", id),
  ]);
  await supprimer(MAGASINS.projets, id);
}

export async function dupliquerProjet(projet: Projet): Promise<Projet> {
  const maintenant = Date.now();
  const copie: Projet = {
    ...projet,
    id: identifiant(),
    nom: `${projet.nom} (copie)`,
    creeLe: maintenant,
    modifieLe: maintenant,
  };

  const fichiers = await fichiersDeVersion(projet.id, projet.versionCourante);
  const versions = await listerVersions(projet.id);
  const versionSource = versions.find((v) => v.numero === projet.versionCourante);

  await ecrireMulti([
    { magasin: MAGASINS.projets, valeurs: [copie] },
    {
      magasin: MAGASINS.fichiers,
      valeurs: fichiers.map((f) => ({ ...f, id: identifiant(), projetId: copie.id })),
    },
    {
      magasin: MAGASINS.versions,
      valeurs: versionSource
        ? [
            {
              ...versionSource,
              id: identifiant(),
              projetId: copie.id,
              resume: `Copie de « ${projet.nom} »`,
              creeLe: maintenant,
            } satisfies VersionProjet,
          ]
        : [],
    },
  ]);
  return copie;
}

/* ----------------------------------------------------------------- fichiers */

export async function fichiersDeVersion(
  projetId: string,
  version: number,
): Promise<FichierProjet[]> {
  const fichiers = await lireParIndex<FichierProjet>(MAGASINS.fichiers, "projet-version", [
    projetId,
    version,
  ]);
  return fichiers.sort((a, b) => a.chemin.localeCompare(b.chemin));
}

export async function tousLesFichiers(projetId: string): Promise<FichierProjet[]> {
  return lireParIndex<FichierProjet>(MAGASINS.fichiers, "projet", projetId);
}

/** Édition manuelle : elle reste dans la version courante, sans en créer une nouvelle. */
export async function ecrireFichier(fichier: FichierProjet): Promise<void> {
  await ecrire(MAGASINS.fichiers, fichier);
}

export async function supprimerFichier(id: string): Promise<void> {
  await supprimer(MAGASINS.fichiers, id);
}

export function nouveauFichier(
  projetId: string,
  version: number,
  chemin: string,
  contenu = "",
): FichierProjet {
  return { id: identifiant(), projetId, version, chemin, contenu };
}

/* ----------------------------------------------------------------- messages */

export async function listerMessages(projetId: string): Promise<MessageProjet[]> {
  const messages = await lireParIndex<MessageProjet>(MAGASINS.messages, "projet", projetId);
  return messages.sort((a, b) => a.creeLe - b.creeLe);
}

export async function tousLesMessages(): Promise<MessageProjet[]> {
  return lireTout<MessageProjet>(MAGASINS.messages);
}

/* ----------------------------------------------------------------- versions */

export async function listerVersions(projetId: string): Promise<VersionProjet[]> {
  const versions = await lireParIndex<VersionProjet>(MAGASINS.versions, "projet", projetId);
  return versions.sort((a, b) => b.numero - a.numero);
}

/**
 * Enregistre un tour complet : la demande, la réponse, les fichiers produits et
 * la version correspondante — en une transaction, pour qu'un projet ne se
 * retrouve jamais avec une version dont les fichiers manquent.
 */
export async function enregistrerTour(parametres: {
  projet: Projet;
  demande: string;
  reponse: string;
  fichiersProduits: FichierAnalyse[];
  fichiersExistants: FichierProjet[];
  tokensEntree: number;
  tokensSortie: number;
  cout: number;
  incomplet: boolean;
  resume: string;
}): Promise<{ projet: Projet; version: number }> {
  const {
    projet,
    demande,
    reponse,
    fichiersProduits,
    fichiersExistants,
    tokensEntree,
    tokensSortie,
    cout,
    incomplet,
    resume,
  } = parametres;

  const maintenant = Date.now();
  const creeUneVersion = fichiersProduits.length > 0;
  const version = creeUneVersion ? projet.versionCourante + 1 : projet.versionCourante;

  const messageUtilisateur: MessageProjet = {
    id: identifiant(),
    projetId: projet.id,
    role: "utilisateur",
    contenu: demande,
    tokensEntree: 0,
    tokensSortie: 0,
    cout: 0,
    fournisseurId: projet.fournisseurId,
    modele: projet.modele,
    version: null,
    incomplet: false,
    creeLe: maintenant,
  };

  const messageAssistant: MessageProjet = {
    id: identifiant(),
    projetId: projet.id,
    role: "assistant",
    contenu: reponse,
    tokensEntree,
    tokensSortie,
    cout,
    fournisseurId: projet.fournisseurId,
    modele: projet.modele,
    version: creeUneVersion ? version : null,
    incomplet,
    creeLe: maintenant + 1,
  };

  const operations: Array<{ magasin: (typeof MAGASINS)[keyof typeof MAGASINS]; valeurs: unknown[] }> =
    [{ magasin: MAGASINS.messages, valeurs: [messageUtilisateur, messageAssistant] }];

  if (creeUneVersion) {
    // Une version est un instantané complet : les fichiers non touchés sont
    // recopiés, ce qui rend le retour arrière trivial et sans effet de bord.
    const parChemin = new Map(fichiersExistants.map((f) => [f.chemin, f.contenu]));
    for (const produit of fichiersProduits) parChemin.set(produit.chemin, produit.contenu);

    operations.push({
      magasin: MAGASINS.fichiers,
      valeurs: [...parChemin].map(([chemin, contenu]) =>
        nouveauFichier(projet.id, version, chemin, contenu),
      ),
    });
    operations.push({
      magasin: MAGASINS.versions,
      valeurs: [
        {
          id: identifiant(),
          projetId: projet.id,
          numero: version,
          resume,
          creeLe: maintenant,
        } satisfies VersionProjet,
      ],
    });
  }

  const projetMaj: Projet = { ...projet, versionCourante: version, modifieLe: maintenant };
  operations.push({ magasin: MAGASINS.projets, valeurs: [projetMaj] });

  await ecrireMulti(operations);
  return { projet: projetMaj, version };
}

/** Le retour arrière crée une nouvelle version : l'historique reste linéaire. */
export async function restaurerVersion(
  projet: Projet,
  numero: number,
): Promise<{ projet: Projet; version: number }> {
  const source = await fichiersDeVersion(projet.id, numero);
  if (source.length === 0) {
    throw new Error(`La version ${numero} ne contient aucun fichier.`);
  }
  const maintenant = Date.now();
  const version = projet.versionCourante + 1;

  const projetMaj: Projet = { ...projet, versionCourante: version, modifieLe: maintenant };
  await ecrireMulti([
    {
      magasin: MAGASINS.fichiers,
      valeurs: source.map((f) => nouveauFichier(projet.id, version, f.chemin, f.contenu)),
    },
    {
      magasin: MAGASINS.versions,
      valeurs: [
        {
          id: identifiant(),
          projetId: projet.id,
          numero: version,
          resume: `Retour à la version ${numero}`,
          creeLe: maintenant,
        } satisfies VersionProjet,
      ],
    },
    { magasin: MAGASINS.projets, valeurs: [projetMaj] },
  ]);
  return { projet: projetMaj, version };
}

/** Première version d'un projet créé autrement que par génération (import, modèle vierge). */
export async function initialiserVersion(
  projet: Projet,
  fichiers: Array<{ chemin: string; contenu: string }>,
  resume: string,
): Promise<Projet> {
  const version = projet.versionCourante + 1;
  const maintenant = Date.now();
  const projetMaj: Projet = { ...projet, versionCourante: version, modifieLe: maintenant };
  await ecrireMulti([
    {
      magasin: MAGASINS.fichiers,
      valeurs: fichiers.map((f) => nouveauFichier(projet.id, version, f.chemin, f.contenu)),
    },
    {
      magasin: MAGASINS.versions,
      valeurs: [
        {
          id: identifiant(),
          projetId: projet.id,
          numero: version,
          resume,
          creeLe: maintenant,
        } satisfies VersionProjet,
      ],
    },
    { magasin: MAGASINS.projets, valeurs: [projetMaj] },
  ]);
  return projetMaj;
}

/* ------------------------------------------------------------- déploiements */

export async function listerDeploiements(projetId: string): Promise<Deploiement[]> {
  const deploiements = await lireParIndex<Deploiement>(MAGASINS.deploiements, "projet", projetId);
  return deploiements.sort((a, b) => b.creeLe - a.creeLe);
}

export async function enregistrerDeploiement(deploiement: Deploiement): Promise<void> {
  await ecrire(MAGASINS.deploiements, deploiement);
}

export function nouveauDeploiement(projetId: string, plateforme: string): Deploiement {
  return {
    id: identifiant(),
    projetId,
    plateforme,
    url: null,
    identifiantSite: null,
    statut: "en-cours",
    detail: null,
    creeLe: Date.now(),
  };
}

export { ecrireLot, identifiant };

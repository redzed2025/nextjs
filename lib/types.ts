/** Types du domaine Atelier. Ils suivent le modèle de données du PRD. */

/** Forme d'API parlée par un fournisseur. */
export type TypeApi = "anthropic" | "openai";

/** Ce que l'utilisateur demande à générer. */
export type TypeCible = "site-statique" | "pwa";

export interface ModeleInfo {
  id: string;
  nom: string;
  /** Fenêtre de contexte en jetons, quand le fournisseur l'expose. */
  contexte: number | null;
  /** Prix en dollars par million de jetons. */
  prixEntree: number | null;
  prixSortie: number | null;
  /** Modalités acceptées en entrée : « texte », « image »… */
  modalites: string[];
}

export interface Fournisseur {
  id: string;
  nom: string;
  /** Identifiant du préréglage d'origine, ou « personnalise ». */
  presetId: string;
  baseUrl: string;
  typeApi: TypeApi;
  /**
   * Référence vers le trousseau chiffré (lib/trousseau.ts).
   * Ce n'est jamais la clé elle-même : celle-ci ne quitte pas le trousseau.
   */
  cleRef: string;
  /** Masque d'affichage : 4 premiers et 4 derniers caractères. */
  masque: string;
  modeles: ModeleInfo[] | null;
  modelesMajLe: number | null;
  modeleParDefaut: string | null;
  creeLe: number;
}

export interface Projet {
  id: string;
  nom: string;
  typeCible: TypeCible;
  fournisseurId: string | null;
  modele: string | null;
  /** Version affichée dans l'atelier ; les versions antérieures sont conservées. */
  versionCourante: number;
  /** Plafond de dépense cumulée pour ce projet, en dollars. */
  plafond: number | null;
  /** Longueur maximale d'une réponse, en jetons. `null` = valeur adaptée au fournisseur. */
  maxJetons: number | null;
  /** Demander au modèle de raisonner avant de répondre, quand il le sait faire. */
  reflexion: boolean;
  creeLe: number;
  modifieLe: number;
}

export interface FichierProjet {
  id: string;
  projetId: string;
  chemin: string;
  contenu: string;
  version: number;
}

export type RoleMessage = "utilisateur" | "assistant";

export interface MessageProjet {
  id: string;
  projetId: string;
  role: RoleMessage;
  contenu: string;
  tokensEntree: number;
  tokensSortie: number;
  /** Coût estimé de l'échange, en dollars. */
  cout: number;
  fournisseurId: string | null;
  modele: string | null;
  /** Version produite par ce message, pour les réponses de l'assistant. */
  version: number | null;
  /** Message interrompu ou en erreur : conservé mais signalé. */
  incomplet: boolean;
  creeLe: number;
}

export interface VersionProjet {
  id: string;
  projetId: string;
  numero: number;
  resume: string;
  creeLe: number;
}

export type StatutDeploiement = "en-cours" | "reussi" | "echoue";

export interface Deploiement {
  id: string;
  projetId: string;
  plateforme: string;
  url: string | null;
  /** Identifiant du site chez l'hébergeur, pour republier au même endroit. */
  identifiantSite: string | null;
  statut: StatutDeploiement;
  detail: string | null;
  creeLe: number;
}

/** Réglages globaux, stockés localement. */
export interface Reglages {
  /** L'utilisateur a vu l'onboarding et accepté l'avertissement fournisseur. */
  onboardingFait: boolean;
  /** Autoriser le code généré à joindre le réseau depuis l'aperçu. */
  reseauApercu: boolean;
  /** Plafond de dépense mensuel global, en dollars. */
  plafondMensuel: number | null;
  langueSysteme: "auto" | "fr" | "en";
}

export const REGLAGES_PAR_DEFAUT: Reglages = {
  onboardingFait: false,
  reseauApercu: false,
  plafondMensuel: null,
  langueSysteme: "auto",
};

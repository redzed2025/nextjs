import type { Fournisseur, ModeleInfo } from "@/lib/types";

/**
 * Contrat d'abstraction fournisseur (PRD §6.4).
 *
 * Chaque adaptateur expose la même interface. Ajouter un fournisseur compatible
 * OpenAI ne demande alors qu'une entrée dans `prereglages.ts`, sans code.
 */

export interface MessageChat {
  role: "utilisateur" | "assistant";
  contenu: string;
}

export interface OptionsGeneration {
  modele: string;
  systeme: string;
  messages: MessageChat[];
  maxJetons: number;
  /** Demande au modèle de raisonner avant de répondre, quand il le sait faire. */
  reflexion: boolean;
  signal?: AbortSignal;
}

export type EvenementGeneration =
  | { type: "texte"; delta: string }
  | { type: "reflexion"; delta: string }
  | { type: "usage"; entree: number; sortie: number }
  | { type: "fin"; raison: string | null };

export interface Adaptateur {
  readonly fournisseur: Fournisseur;
  /** Appel minimal validant la clé. Lève une ErreurAtelier si elle est refusée. */
  verifierCle(signal?: AbortSignal): Promise<void>;
  /** Catalogue de modèles, récupéré dynamiquement quand le fournisseur l'expose. */
  listerModeles(signal?: AbortSignal): Promise<ModeleInfo[]>;
  generer(options: OptionsGeneration): AsyncGenerator<EvenementGeneration>;
}

/** Coût en dollars, à partir des tarifs par million de jetons. */
export function estimerCout(
  modele: ModeleInfo | null | undefined,
  entree: number,
  sortie: number,
): number {
  if (!modele || modele.prixEntree === null || modele.prixSortie === null) return 0;
  return (entree / 1_000_000) * modele.prixEntree + (sortie / 1_000_000) * modele.prixSortie;
}

/** `https://api.exemple.com/` ou `https://api.exemple.com/v1` → `https://api.exemple.com/v1`. */
export function racineV1(baseUrl: string): string {
  const propre = baseUrl.trim().replace(/\/+$/, "");
  return /\/v\d+$/.test(propre) ? propre : `${propre}/v1`;
}

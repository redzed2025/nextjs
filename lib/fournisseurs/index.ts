import type { Fournisseur } from "@/lib/types";
import { creerAdaptateurAnthropic } from "./anthropic";
import { creerAdaptateurOpenAi } from "./openai";
import type { Adaptateur } from "./types";

export * from "./types";
export * from "./prereglages";
export { MODELE_ANTHROPIC_PAR_DEFAUT, supporteReflexionAnthropic } from "./anthropic";

/** Fabrique : c'est le seul endroit qui connaît les deux formes d'API. */
export function creerAdaptateur(fournisseur: Fournisseur): Adaptateur {
  return fournisseur.typeApi === "anthropic"
    ? creerAdaptateurAnthropic(fournisseur)
    : creerAdaptateurOpenAi(fournisseur);
}

/** Un modèle sait-il raisonner avant de répondre ? */
export function supporteReflexion(fournisseur: Fournisseur, modele: string): boolean {
  if (fournisseur.typeApi === "anthropic") {
    // Import direct pour éviter une dépendance circulaire à l'exécution.
    return /claude-(opus|sonnet|fable)-(4-6|4-7|4-8|5)/.test(modele);
  }
  return /(reason|thinking|-r1|o[1-4]\b)/i.test(modele);
}

import type { FichierProjet } from "@/lib/types";

/**
 * Envoi ciblé (PRD US-04).
 *
 * Réinjecter tout le projet à chaque tour coûte cher et sature vite la fenêtre
 * de contexte. On envoie donc systématiquement la carte du projet — tous les
 * chemins, avec leur taille — mais seulement le contenu des fichiers utiles au
 * tour en cours. Le modèle sait ainsi ce qui existe et peut demander le reste.
 */

export interface SelectionContexte {
  retenus: FichierProjet[];
  omis: FichierProjet[];
  caracteres: number;
}

/** ~4 caractères par jeton : 60 000 caractères ≈ 15 000 jetons de contexte. */
const BUDGET_PAR_DEFAUT = 60_000;

function pertinence(fichier: FichierProjet, demande: string): number {
  const nom = fichier.chemin.toLowerCase();
  const base = nom.split("/").pop() ?? nom;
  let score = 0;

  if (demande.includes(base)) score += 1000;
  else if (demande.includes(nom)) score += 900;

  if (nom === "index.html") score += 500;
  else if (nom.endsWith("index.html")) score += 400;
  else if (nom.endsWith(".html")) score += 300;
  else if (nom.endsWith(".css")) score += 250;
  else if (nom.endsWith(".js")) score += 240;
  else if (nom.endsWith(".webmanifest") || nom.endsWith(".json")) score += 120;
  else if (nom.endsWith(".svg")) score += 60;

  // À pertinence égale, un petit fichier passe avant un gros.
  score -= Math.min(fichier.contenu.length / 400, 200);
  return score;
}

export function choisirContexte(
  fichiers: FichierProjet[],
  demande: string,
  budget: number = BUDGET_PAR_DEFAUT,
): SelectionContexte {
  const total = fichiers.reduce((somme, f) => somme + f.contenu.length, 0);
  if (total <= budget) {
    return { retenus: [...fichiers], omis: [], caracteres: total };
  }

  const demandeMinuscule = demande.toLowerCase();
  const classes = [...fichiers].sort(
    (a, b) => pertinence(b, demandeMinuscule) - pertinence(a, demandeMinuscule),
  );

  const retenus: FichierProjet[] = [];
  const omis: FichierProjet[] = [];
  let caracteres = 0;

  for (const fichier of classes) {
    // Le premier fichier passe même s'il dépasse à lui seul le budget : mieux
    // vaut une requête lourde qu'une requête sans le fichier concerné.
    if (retenus.length === 0 || caracteres + fichier.contenu.length <= budget) {
      retenus.push(fichier);
      caracteres += fichier.contenu.length;
    } else {
      omis.push(fichier);
    }
  }

  retenus.sort((a, b) => a.chemin.localeCompare(b.chemin));
  omis.sort((a, b) => a.chemin.localeCompare(b.chemin));
  return { retenus, omis, caracteres };
}

/** Carte du projet : tout ce qui existe, même ce dont le contenu est omis. */
export function carteProjet(fichiers: FichierProjet[]): string {
  if (fichiers.length === 0) return "Le projet est vide.";
  return [...fichiers]
    .sort((a, b) => a.chemin.localeCompare(b.chemin))
    .map((f) => `- ${f.chemin} (${f.contenu.length} caractères)`)
    .join("\n");
}

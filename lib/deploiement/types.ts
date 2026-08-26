import type { FichierProjet } from "@/lib/types";

/** Un connecteur de publication : même contrat BYOK que les fournisseurs IA. */
export interface Connecteur {
  id: string;
  nom: string;
  /** `automatique` : publication en une action depuis l'app. */
  mode: "automatique" | "manuel";
  urlJeton: string | null;
  description: string;
  /** Pourquoi ce connecteur est manuel, le cas échéant. */
  note: string | null;
  publier?: (parametres: ParametresPublication) => Promise<ResultatPublication>;
  /** Marche à suivre affichée pour les cibles manuelles. */
  etapes?: string[];
}

export interface ParametresPublication {
  jeton: string;
  fichiers: FichierProjet[];
  nomProjet: string;
  /** Identifiant du site déjà créé, pour republier au même endroit. */
  identifiantSite: string | null;
  signal?: AbortSignal;
  surEtape?: (message: string) => void;
}

export interface ResultatPublication {
  url: string;
  identifiantSite: string;
  detail: string;
}

/** Empreinte SHA-1 en hexadécimal, telle que l'attendent les API de déploiement. */
export async function empreinteSha1(contenu: string): Promise<string> {
  const octets = new TextEncoder().encode(contenu);
  const condensat = await crypto.subtle.digest("SHA-1", octets);
  return [...new Uint8Array(condensat)].map((o) => o.toString(16).padStart(2, "0")).join("");
}

/** `index.html` → `/index.html`, comme l'exigent les manifestes de déploiement. */
export function cheminAbsolu(chemin: string): string {
  return chemin.startsWith("/") ? chemin : `/${chemin}`;
}

/** Nom de site valide : minuscules, chiffres et tirets. */
export function nomSite(nomProjet: string): string {
  const base =
    nomProjet
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "atelier";
  const suffixe = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffixe}`;
}

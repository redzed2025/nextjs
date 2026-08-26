import type { Connecteur } from "./types";
import { CONNECTEUR_NETLIFY } from "./netlify";

export * from "./types";

/**
 * Cibles de publication.
 *
 * Cloudflare Pages et Vercel figurent au PRD ; ils restent manuels dans cette
 * version PWA pour une raison technique, pas par arbitrage produit :
 *
 *   - Cloudflare Pages : le téléversement direct identifie chaque fichier par
 *     une empreinte BLAKE3, que WebCrypto n'expose pas. La calculer demanderait
 *     d'embarquer une implémentation complète pour un seul appel ;
 *   - Vercel : l'API de déploiement n'annonce pas d'en-têtes CORS permettant
 *     l'appel depuis une origine tierce.
 *
 * Dans les deux cas la solution honnête est la même : Atelier produit l'archive
 * du projet et indique la marche à suivre, plutôt que de proposer un bouton qui
 * échouerait. Sur l'application native prévue au PRD, où aucune de ces deux
 * limites ne s'applique, ces connecteurs deviennent automatiques sans changer
 * le contrat `Connecteur`.
 */
export const CONNECTEURS: Connecteur[] = [
  CONNECTEUR_NETLIFY,
  {
    id: "cloudflare-pages",
    nom: "Cloudflare Pages",
    mode: "manuel",
    urlJeton: "https://dash.cloudflare.com/?to=/:account/pages",
    description: "Hébergement gratuit et rapide, dépôt d'archive depuis le navigateur.",
    note:
      "Le téléversement direct de Cloudflare identifie les fichiers par une empreinte BLAKE3, " +
      "que le navigateur ne sait pas calculer sans bibliothèque supplémentaire.",
    etapes: [
      "Exportez le projet : Atelier prépare une archive ZIP.",
      "Ouvrez le tableau de bord Cloudflare, puis Workers & Pages.",
      "Créez une application, onglet « Pages », puis « Téléverser des ressources ».",
      "Déposez l'archive et validez : l'adresse en .pages.dev s'affiche aussitôt.",
    ],
  },
  {
    id: "vercel",
    nom: "Vercel",
    mode: "manuel",
    urlJeton: "https://vercel.com/new",
    description: "Déploiement par dépôt d'archive ou depuis un dépôt Git.",
    note: "L'API de déploiement de Vercel n'accepte pas les appels directs depuis un navigateur.",
    etapes: [
      "Exportez le projet en archive ZIP.",
      "Ouvrez vercel.com/new et choisissez de déposer un dossier.",
      "Décompressez l'archive et déposez son contenu.",
      "Validez : l'adresse en .vercel.app s'affiche à la fin de la construction.",
    ],
  },
];

export function connecteur(id: string): Connecteur | undefined {
  return CONNECTEURS.find((c) => c.id === id);
}

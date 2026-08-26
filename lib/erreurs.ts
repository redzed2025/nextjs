/**
 * Traduction des échecs réseau et API en messages actionnables, en français.
 *
 * Un principe : le message affiché dit ce qui s'est passé *et* ce que
 * l'utilisateur peut faire. « Erreur 429 » ne dit rien à un artisan qui veut
 * une vitrine ; « Vous envoyez trop de requêtes, attendez une minute » si.
 */

export type CategorieErreur =
  | "cle-invalide"
  | "credit"
  | "cadence"
  | "contexte"
  | "reseau"
  | "cors"
  | "serveur"
  | "annule"
  | "configuration"
  | "inconnue";

export class ErreurAtelier extends Error {
  readonly categorie: CategorieErreur;
  readonly conseil: string | null;
  readonly statut: number | null;

  constructor(
    categorie: CategorieErreur,
    message: string,
    options: { conseil?: string | null; statut?: number | null } = {},
  ) {
    super(message);
    this.name = "ErreurAtelier";
    this.categorie = categorie;
    this.conseil = options.conseil ?? null;
    this.statut = options.statut ?? null;
  }
}

/**
 * Retire d'un texte toute sous-chaîne ressemblant à une clé API avant qu'il
 * n'atteigne l'interface. Les corps d'erreur des fournisseurs renvoient parfois
 * la clé envoyée ; elle ne doit jamais s'afficher ni être conservée.
 */
export function expurger(texte: string): string {
  return texte
    .replace(/\b(sk|rk|pk|xai|gsk|or)[-_][A-Za-z0-9_-]{12,}/g, "«clé masquée»")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, (bloc) =>
      /^[0-9a-f]+$/i.test(bloc) && bloc.length <= 40 ? bloc : "«valeur masquée»",
    );
}

function extraireMessage(corps: string): string | null {
  if (!corps) return null;
  try {
    const donnees = JSON.parse(corps) as Record<string, unknown>;
    const erreur = (donnees.error ?? donnees) as Record<string, unknown>;
    const message = erreur?.message ?? donnees.message ?? donnees.detail;
    if (typeof message === "string" && message.trim()) return expurger(message.trim());
  } catch {
    /* corps non JSON */
  }
  const brut = corps.trim();
  if (!brut) return null;
  return expurger(brut.slice(0, 300));
}

/** Traduit une réponse HTTP en échec en erreur affichable. */
export function erreurDepuisReponse(
  statut: number,
  corps: string,
  contexte: { nomFournisseur: string },
): ErreurAtelier {
  const detail = extraireMessage(corps);
  const suffixe = detail ? ` (${detail})` : "";
  const f = contexte.nomFournisseur;

  if (statut === 401 || statut === 403) {
    return new ErreurAtelier(
      "cle-invalide",
      `${f} refuse la clé API${suffixe}.`,
      {
        statut,
        conseil:
          "Vérifiez que la clé est complète, active, et qu'elle correspond bien à l'URL de base " +
          "enregistrée pour ce fournisseur.",
      },
    );
  }
  if (statut === 402) {
    return new ErreurAtelier("credit", `Le compte ${f} n'a plus de crédit${suffixe}.`, {
      statut,
      conseil: "Rechargez votre compte chez le fournisseur, puis relancez la génération.",
    });
  }
  if (statut === 429) {
    return new ErreurAtelier("cadence", `${f} limite le rythme des requêtes${suffixe}.`, {
      statut,
      conseil:
        "Attendez une minute avant de réessayer, ou choisissez un modèle moins sollicité. " +
        "Un quota mensuel épuisé donne aussi cette réponse.",
    });
  }
  if (statut === 413 || statut === 422) {
    return new ErreurAtelier("contexte", `La requête a été refusée par ${f}${suffixe}.`, {
      statut,
      conseil:
        "Le projet est probablement trop volumineux pour la fenêtre de contexte du modèle. " +
        "Repartez d'une version antérieure, supprimez des fichiers, ou passez à un modèle " +
        "à plus grand contexte.",
    });
  }
  if (statut === 400) {
    return new ErreurAtelier("configuration", `${f} a rejeté la requête${suffixe}.`, {
      statut,
      conseil:
        "Le modèle sélectionné n'existe peut-être pas chez ce fournisseur. Rafraîchissez la " +
        "liste des modèles depuis la fiche du fournisseur.",
    });
  }
  if (statut === 404) {
    return new ErreurAtelier("configuration", `Adresse introuvable chez ${f}${suffixe}.`, {
      statut,
      conseil:
        "L'URL de base est probablement incorrecte. Elle doit pointer sur la racine de l'API, " +
        "sans « /v1 » ni chemin de méthode.",
    });
  }
  if (statut >= 500) {
    return new ErreurAtelier("serveur", `${f} rencontre un incident${suffixe}.`, {
      statut,
      conseil: "Réessayez dans quelques minutes ; le problème vient du fournisseur.",
    });
  }
  return new ErreurAtelier("inconnue", `${f} a répondu ${statut}${suffixe}.`, { statut });
}

/**
 * Traduit un échec de `fetch`. En PWA, l'échec le plus courant n'est pas la
 * panne réseau mais le refus CORS : le navigateur bloque la réponse d'un
 * fournisseur qui n'autorise pas les appels directs depuis une page web.
 */
export function erreurDepuisReseau(
  cause: unknown,
  contexte: { nomFournisseur: string; baseUrl: string },
): ErreurAtelier {
  if (cause instanceof ErreurAtelier) return cause;
  if (cause instanceof DOMException && cause.name === "AbortError") {
    return new ErreurAtelier("annule", "Génération interrompue.");
  }

  const horsLigne = typeof navigator !== "undefined" && navigator.onLine === false;
  if (horsLigne) {
    return new ErreurAtelier("reseau", "Vous êtes hors ligne.", {
      conseil:
        "Atelier fonctionne hors ligne pour consulter et modifier vos projets, mais la " +
        "génération demande une connexion vers votre fournisseur.",
    });
  }

  const locale = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.)/.test(
    contexte.baseUrl,
  );
  return new ErreurAtelier(
    "cors",
    `Impossible de joindre ${contexte.nomFournisseur}.`,
    {
      conseil: locale
        ? "Un serveur local doit autoriser explicitement l'origine de cette page. Pour Ollama, " +
          "lancez-le avec OLLAMA_ORIGINS=\"*\". En HTTPS, un point de terminaison en HTTP simple " +
          "est également bloqué par le navigateur."
        : "Soit le réseau a coupé, soit ce fournisseur n'autorise pas les appels directs depuis " +
          "un navigateur (règle CORS). Anthropic et OpenRouter les acceptent ; d'autres non. " +
          "Essayez un autre fournisseur, ou utilisez un point de terminaison compatible que vous " +
          "contrôlez.",
    },
  );
}

/** Message court pour les journaux d'interface, sans secret ni pile d'appels. */
export function messageLisible(cause: unknown): string {
  if (cause instanceof ErreurAtelier) return cause.message;
  if (cause instanceof Error) return expurger(cause.message);
  return "Une erreur inattendue est survenue.";
}

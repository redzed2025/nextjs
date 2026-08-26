import type { FichierProjet } from "./types";
import { fichierEntree } from "./generation/analyse";

/**
 * Construction du document d'aperçu.
 *
 * L'aperçu s'exécute dans une iframe `sandbox="allow-scripts"` sans
 * `allow-same-origin` : le document obtient une origine opaque et ne peut donc
 * atteindre ni le stockage d'Atelier, ni ses clés, ni son service worker.
 * Comme il n'a pas non plus d'origine réelle, les chemins relatifs ne se
 * résolvent pas : les feuilles de style, scripts et images locales sont donc
 * intégrés au document avant affichage.
 *
 * Une politique de sécurité de contenu est ajoutée dans le document lui-même :
 * par défaut le code généré ne peut joindre aucun serveur, ce qui répond à
 * l'exigence du PRD (« sans accès aux données de l'app ni au réseau externe »)
 * sans empêcher l'utilisateur de lever la restriction s'il en a besoin.
 */

export const MESSAGE_NAVIGATION = "atelier:naviguer";

const TYPES_MIME: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  webmanifest: "application/manifest+json",
  html: "text/html",
  txt: "text/plain",
};

function typeMime(chemin: string): string {
  const extension = chemin.split(".").pop()?.toLowerCase() ?? "";
  return TYPES_MIME[extension] ?? "application/octet-stream";
}

function dataUri(chemin: string, contenu: string): string {
  return `data:${typeMime(chemin)};charset=utf-8,${encodeURIComponent(contenu)}`;
}

/** Résout `../assets/x.css` relativement au fichier qui le référence. */
function resoudre(base: string, reference: string): string {
  const segments = base.split("/").slice(0, -1);
  for (const partie of reference.split("/")) {
    if (partie === "" || partie === ".") continue;
    if (partie === "..") segments.pop();
    else segments.push(partie);
  }
  return segments.join("/");
}

function estExterne(reference: string): boolean {
  return /^(https?:|data:|blob:|mailto:|tel:|#|\/\/)/i.test(reference.trim());
}

function echapperFin(contenu: string, balise: string): string {
  // Un `</script>` littéral à l'intérieur d'un script intégré fermerait la balise.
  return contenu.replace(new RegExp(`</(${balise})`, "gi"), "<\\/$1");
}

const SCRIPT_NAVIGATION = `
<script>
// Navigation interne de l'aperçu : l'iframe n'a pas d'origine, les liens vers
// les autres pages du projet sont donc relayés à Atelier, qui recompose le
// document demandé.
document.addEventListener('click', function (evenement) {
  var lien = evenement.target && evenement.target.closest ? evenement.target.closest('a[href]') : null;
  if (!lien) return;
  var cible = lien.getAttribute('href') || '';
  if (/^(https?:|mailto:|tel:|data:|blob:|\\/\\/)/i.test(cible)) {
    evenement.preventDefault();
    return;
  }
  if (cible.charAt(0) === '#' || !/\\.html?($|[?#])/i.test(cible)) return;
  evenement.preventDefault();
  parent.postMessage({ type: 'MESSAGE_NAVIGATION', chemin: cible.split(/[?#]/)[0] }, '*');
});
</script>
`.replace("MESSAGE_NAVIGATION", MESSAGE_NAVIGATION);

export interface OptionsApercu {
  /** Autoriser le code généré à joindre le réseau depuis l'aperçu. */
  reseau: boolean;
  /** Page du projet à afficher ; par défaut, le fichier d'entrée. */
  page?: string | null;
}

export interface ResultatApercu {
  html: string;
  page: string | null;
  /** Aucun fichier affichable : l'appelant montre un état vide. */
  vide: boolean;
}

export function construireApercu(
  fichiers: FichierProjet[],
  options: OptionsApercu,
): ResultatApercu {
  const parChemin = new Map(fichiers.map((f) => [f.chemin, f.contenu]));
  const page =
    (options.page && parChemin.has(options.page) ? options.page : null) ??
    fichierEntree(fichiers.map((f) => f.chemin));

  if (!page) {
    return { html: "", page: null, vide: true };
  }

  let html = parChemin.get(page) ?? "";

  // Feuilles de style locales → <style> intégré.
  html = html.replace(
    /<link\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>/gi,
    (balise, reference: string) => {
      if (!/stylesheet/i.test(balise) || estExterne(reference)) return balise;
      const contenu = parChemin.get(resoudre(page, reference));
      return contenu === undefined ? balise : `<style>\n${contenu}\n</style>`;
    },
  );

  // Scripts locaux → <script> intégré, en conservant le type éventuel.
  html = html.replace(
    /<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (balise, avant: string, reference: string, apres: string) => {
      if (estExterne(reference)) return balise;
      const contenu = parChemin.get(resoudre(page, reference));
      if (contenu === undefined) return balise;
      const attributs = `${avant} ${apres}`.replace(/\s+/g, " ").trim();
      return `<script ${attributs}>\n${echapperFin(contenu, "script")}\n</script>`;
    },
  );

  // Images, manifestes et autres ressources locales → data: URI.
  html = html.replace(
    /\b(src|href)\s*=\s*["']([^"']+)["']/gi,
    (attribut, nom: string, reference: string) => {
      if (estExterne(reference) || /\.html?($|[?#])/i.test(reference)) return attribut;
      const chemin = resoudre(page, reference);
      const contenu = parChemin.get(chemin);
      return contenu === undefined ? attribut : `${nom}="${dataUri(chemin, contenu)}"`;
    },
  );

  const csp = options.reseau
    ? "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors *; form-action 'none'"
    : "default-src 'none'; img-src data: blob:; media-src data: blob:; " +
      "style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; " +
      "font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

  const entete = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${entete}`);
  } else {
    html = `${entete}\n${html}`;
  }

  return { html: `${html}\n${SCRIPT_NAVIGATION}`, page, vide: false };
}

/** Tailles d'écran proposées dans la barre d'aperçu. */
export const TAILLES_APERCU = [
  { id: "mobile", nom: "Mobile", largeur: 390, hauteur: 844, icone: "▯" },
  { id: "tablette", nom: "Tablette", largeur: 820, hauteur: 1180, icone: "▭" },
  { id: "bureau", nom: "Bureau", largeur: 1280, hauteur: 800, icone: "▬" },
] as const;

export type IdTailleApercu = (typeof TAILLES_APERCU)[number]["id"];

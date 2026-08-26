/**
 * Coloration syntaxique légère pour l'éditeur.
 *
 * Un analyseur complet serait hors de proportion : l'utilisateur relit et
 * corrige du HTML, du CSS et du JavaScript sur un écran de téléphone. Ce
 * découpage par jetons suffit à faire ressortir la structure, tient en quelques
 * kilo-octets et n'ajoute aucune dépendance.
 *
 * Toute la sortie est échappée : le contenu d'un fichier généré ne doit jamais
 * pouvoir s'exécuter dans l'interface d'Atelier.
 */

export type Langage = "html" | "css" | "js" | "json" | "texte";

export function langageDepuisChemin(chemin: string): Langage {
  const extension = chemin.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "html" || extension === "htm" || extension === "svg" || extension === "xml") {
    return "html";
  }
  if (extension === "css") return "css";
  if (extension === "js" || extension === "mjs" || extension === "ts") return "js";
  if (extension === "json" || extension === "webmanifest") return "json";
  return "texte";
}

export function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Regle {
  motif: RegExp;
  classe: string | ((correspondance: RegExpExecArray) => string);
}

const MOTS_CLES_JS =
  /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|await|async|try|catch|finally|throw|typeof|instanceof|delete|in|of|this|null|undefined|true|false)\b/;

const REGLES: Record<Exclude<Langage, "texte">, Regle[]> = {
  html: [
    { motif: /<!--[\s\S]*?-->/, classe: "jeton-commentaire" },
    { motif: /<!DOCTYPE[^>]*>/i, classe: "jeton-motcle" },
    { motif: /"[^"]*"|'[^']*'/, classe: "jeton-chaine" },
    { motif: /<\/?[a-zA-Z][\w:-]*/, classe: "jeton-balise" },
    { motif: /\/?>/, classe: "jeton-balise" },
    { motif: /[a-zA-Z-]+(?==)/, classe: "jeton-attribut" },
  ],
  css: [
    { motif: /\/\*[\s\S]*?\*\//, classe: "jeton-commentaire" },
    { motif: /"[^"]*"|'[^']*'/, classe: "jeton-chaine" },
    { motif: /@[\w-]+/, classe: "jeton-motcle" },
    { motif: /[a-zA-Z-]+(?=\s*:)/, classe: "jeton-attribut" },
    { motif: /#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg|fr)?\b/, classe: "jeton-nombre" },
  ],
  js: [
    { motif: /\/\/[^\n]*|\/\*[\s\S]*?\*\//, classe: "jeton-commentaire" },
    { motif: /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/, classe: "jeton-chaine" },
    { motif: MOTS_CLES_JS, classe: "jeton-motcle" },
    { motif: /\b[A-Za-z_$][\w$]*(?=\s*\()/, classe: "jeton-fonction" },
    { motif: /\b\d+(?:\.\d+)?\b/, classe: "jeton-nombre" },
  ],
  json: [
    { motif: /"(?:\\.|[^"\\])*"(?=\s*:)/, classe: "jeton-attribut" },
    { motif: /"(?:\\.|[^"\\])*"/, classe: "jeton-chaine" },
    { motif: /\b(?:true|false|null)\b/, classe: "jeton-motcle" },
    { motif: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/, classe: "jeton-nombre" },
  ],
};

/** Renvoie du HTML échappé, où chaque jeton reconnu est enveloppé dans un span. */
export function colorer(code: string, langage: Langage): string {
  if (langage === "texte") return echapper(code);
  const regles = REGLES[langage];

  let position = 0;
  let sortie = "";
  let ordinaire = "";

  while (position < code.length) {
    let trouve: { longueur: number; classe: string; texte: string } | null = null;

    for (const regle of regles) {
      const motif = new RegExp(regle.motif.source, regle.motif.flags.replace("g", "") + "y");
      motif.lastIndex = position;
      const correspondance = motif.exec(code);
      if (correspondance && correspondance[0].length > 0) {
        trouve = {
          longueur: correspondance[0].length,
          classe: typeof regle.classe === "function" ? regle.classe(correspondance) : regle.classe,
          texte: correspondance[0],
        };
        break;
      }
    }

    if (trouve) {
      if (ordinaire) {
        sortie += echapper(ordinaire);
        ordinaire = "";
      }
      sortie += `<span class="${trouve.classe}">${echapper(trouve.texte)}</span>`;
      position += trouve.longueur;
    } else {
      ordinaire += code[position];
      position++;
    }
  }

  if (ordinaire) sortie += echapper(ordinaire);
  return sortie;
}

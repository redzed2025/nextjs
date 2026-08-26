/**
 * Analyse des réponses du modèle.
 *
 * Le format demandé est délibérément plus rare que les clôtures Markdown : un
 * site généré contient souvent des accents graves, et une réponse tronquée en
 * plein bloc ne doit pas faire perdre le fichier commencé.
 *
 *   <<<fichier: index.html>>>
 *   …contenu…
 *   <<<fin>>>
 *
 * L'analyseur est appelé à chaque fragment reçu pendant le flux : il doit donc
 * accepter une entrée incomplète et signaler les fichiers encore en cours.
 */

export interface FichierAnalyse {
  chemin: string;
  contenu: string;
  /** Le bloc n'a pas été refermé : réponse tronquée ou encore en cours. */
  incomplet: boolean;
}

export interface ResultatAnalyse {
  fichiers: FichierAnalyse[];
  /** Texte hors blocs : l'explication que le modèle donne de son travail. */
  commentaire: string;
}

const OUVERTURE = /<<<\s*fichier\s*:\s*([^\n>]+?)\s*>>>/gi;
const FERMETURE = "<<<fin>>>";

export function analyserReponse(texte: string): ResultatAnalyse {
  const ouvertures = [...texte.matchAll(OUVERTURE)].map((m) => ({
    debut: m.index,
    longueur: m[0].length,
    chemin: m[1],
  }));

  if (ouvertures.length === 0) {
    return { fichiers: [], commentaire: texte.trim() };
  }

  const fichiers: FichierAnalyse[] = [];
  const commentaires: string[] = [texte.slice(0, ouvertures[0].debut)];

  ouvertures.forEach((ouverture, rang) => {
    const debutContenu = ouverture.debut + ouverture.longueur;
    const limite = ouvertures[rang + 1]?.debut ?? texte.length;
    const fermeture = texte.indexOf(FERMETURE, debutContenu);
    const refermee = fermeture !== -1 && fermeture < limite;

    // Un bloc sans clôture n'est incomplet que s'il est le dernier : sinon
    // c'est l'ouverture suivante qui le termine, et le contenu est bien là.
    const finContenu = refermee ? fermeture : limite;
    const incomplet = !refermee && rang === ouvertures.length - 1;

    commentaires.push(texte.slice(refermee ? fermeture + FERMETURE.length : finContenu, limite));

    const chemin = normaliserChemin(ouverture.chemin);
    if (!chemin) return;

    const fichier: FichierAnalyse = {
      chemin,
      contenu: degarnir(texte.slice(debutContenu, finContenu)),
      incomplet,
    };
    // Un même chemin réécrit dans la même réponse : la dernière version gagne.
    const existant = fichiers.findIndex((f) => f.chemin === chemin);
    if (existant === -1) fichiers.push(fichier);
    else fichiers[existant] = fichier;
  });

  return { fichiers, commentaire: commentaires.join("\n").trim() };
}

/**
 * Retire les clôtures Markdown que les modèles ajoutent parfois autour du
 * contenu, et le saut de ligne qui suit l'ouverture du bloc.
 */
function degarnir(contenu: string): string {
  let texte = contenu.replace(/^\r?\n/, "").replace(/\r?\n[ \t]*$/, "");
  const cloture = /^[ \t]*```[a-zA-Z0-9+-]*[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*$/;
  const correspondance = texte.match(cloture);
  if (correspondance) texte = correspondance[1];
  return texte;
}

/** Chemin relatif sûr : ni absolu, ni remontant, ni vide. */
export function normaliserChemin(brut: string): string | null {
  const propre = brut
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
  if (!propre) return null;
  const segments = propre.split("/").filter((s) => s && s !== ".");
  if (segments.some((s) => s === "..")) return null;
  if (segments.length === 0) return null;
  return segments.join("/");
}

/** Le fichier servi en premier par l'aperçu et par l'hébergeur. */
export function fichierEntree(chemins: string[]): string | null {
  return (
    chemins.find((c) => c === "index.html") ??
    chemins.find((c) => c.endsWith("/index.html")) ??
    chemins.find((c) => c.endsWith(".html")) ??
    null
  );
}

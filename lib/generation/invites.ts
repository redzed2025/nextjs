import type { TypeCible } from "@/lib/types";

/**
 * Invites système.
 *
 * Choix de langue (question ouverte §12.4 du PRD) : l'invite est rédigée en
 * français, avec une règle explicite de miroir linguistique. Le public visé est
 * francophone, l'interface l'est aussi, et une invite dans la langue du produit
 * évite qu'un modèle réponde en anglais à un utilisateur qui écrit en français.
 * La règle de miroir couvre le cas inverse sans détection automatique fragile.
 *
 * Ces textes sont embarqués dans l'application plutôt que téléchargés
 * (question §12.1) : un téléchargement introduirait un serveur, donc une trace
 * réseau liée à l'usage, ce que la promesse de confidentialité exclut. Ils
 * restent visibles et modifiables par l'utilisateur dans les réglages.
 */

const COMMUN = `Tu es le moteur de génération d'Atelier, une application mobile qui crée des sites web.

FORMAT DE RÉPONSE — impératif
Chaque fichier est renvoyé dans un bloc délimité, exactement sous cette forme :

<<<fichier: chemin/du/fichier.ext>>>
contenu intégral du fichier
<<<fin>>>

Règles de format :
- Ne mets jamais de clôture Markdown (\`\`\`) autour du contenu d'un bloc.
- Écris toujours le fichier en entier, jamais un extrait ni un « … reste inchangé ».
- N'inclus que les fichiers que tu crées ou modifies.
- Les chemins sont relatifs, sans « ../ » ni barre oblique initiale.
- Avant les blocs, deux ou trois phrases maximum expliquant ce que tu as fait.
  Après le dernier bloc, rien.

QUALITÉ ATTENDUE
- Le code doit fonctionner tel quel, sans étape de construction ni dépendance à installer.
- Aucune ressource externe : pas de CDN, pas de police distante, pas d'image distante.
  Les images sont des SVG en ligne ou des dégradés CSS. L'aperçu s'exécute hors ligne.
- Conception mobile d'abord : la page doit être lisible et utilisable sur un écran de
  360 px de large avant de l'être sur un grand écran.
- HTML sémantique, contrastes suffisants, cibles tactiles d'au moins 44 px,
  attributs alt renseignés, navigation au clavier possible.
- Respecte le thème sombre ou clair du système via prefers-color-scheme.
- Pas de code mort, pas de section « à compléter ».

LANGUE
Réponds et rédige le contenu du site dans la langue employée par l'utilisateur.
S'il écrit en français, tout est en français, y compris les textes du site.`;

const CIBLES: Record<TypeCible, string> = {
  "site-statique": `CIBLE : site statique.
Produis index.html, et si le projet le justifie styles.css et script.js. Le CSS et le JS
peuvent aussi être intégrés à la page quand le site tient en un seul fichier — préfère
cette solution pour les sites d'une page.
Pas de framework, pas d'étape de compilation.`,

  pwa: `CIBLE : application web installable (PWA).
Produis au minimum :
- index.html, avec <link rel="manifest" href="manifest.webmanifest"> et l'enregistrement
  du service worker ;
- manifest.webmanifest complet (name, short_name, start_url ".", display "standalone",
  background_color, theme_color, icons) ;
- sw.js qui met en cache la coquille de l'application et la sert hors ligne ;
- icone.svg, référencée par le manifeste.
L'application doit rester utilisable sans réseau après la première visite.
Si elle conserve des données, utilise localStorage et protège chaque accès par un try/catch.`,
};

export function inviteSysteme(cible: TypeCible, personnalisee?: string | null): string {
  const base = `${COMMUN}\n\n${CIBLES[cible]}`;
  const ajout = personnalisee?.trim();
  return ajout ? `${base}\n\nCONSIGNES SUPPLÉMENTAIRES DE L'UTILISATEUR\n${ajout}` : base;
}

/** Suggestions affichées sur un projet vide. */
export const SUGGESTIONS: Array<{ titre: string; texte: string }> = [
  {
    titre: "Vitrine d'artisan",
    texte:
      "Un site d'une page pour une boulangerie artisanale : bandeau avec le nom et une " +
      "photo d'ambiance en dégradé, présentation, liste des produits avec les prix, " +
      "horaires, adresse et bouton d'appel.",
  },
  {
    titre: "Portfolio",
    texte:
      "Un portfolio sombre et élégant pour une photographe : galerie en grille, page de " +
      "présentation, formulaire de contact qui ouvre l'application de messagerie.",
  },
  {
    titre: "Page d'attente",
    texte:
      "Une page « bientôt disponible » pour une application mobile, avec un compte à " +
      "rebours, un champ d'inscription à la liste d'attente et des liens vers les réseaux.",
  },
  {
    titre: "Menu de restaurant",
    texte:
      "Un menu de restaurant consultable au téléphone : catégories repliables, prix, " +
      "signalement des allergènes, et un bouton pour appeler et réserver.",
  },
  {
    titre: "Bloc-notes hors ligne",
    texte:
      "Une application installable de prise de notes qui fonctionne sans réseau, avec " +
      "recherche, épinglage et sauvegarde automatique.",
  },
  {
    titre: "Suivi d'habitudes",
    texte:
      "Une application installable pour suivre des habitudes quotidiennes : grille du " +
      "mois, séries en cours, statistiques simples.",
  },
];

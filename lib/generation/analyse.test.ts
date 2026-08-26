import { test } from "node:test";
import assert from "node:assert/strict";
import { analyserReponse, fichierEntree, normaliserChemin } from "./analyse.ts";

test("extrait plusieurs fichiers et le commentaire autour", () => {
  const resultat = analyserReponse(
    "Voici votre site.\n<<<fichier: index.html>>>\n<h1>Bonjour</h1>\n<<<fin>>>\n" +
      "Et le style :\n<<<fichier: style.css>>>\nbody{color:red}\n<<<fin>>>\nVoilà.",
  );
  assert.deepEqual(
    resultat.fichiers.map((f) => f.chemin),
    ["index.html", "style.css"],
  );
  assert.equal(resultat.fichiers[0].contenu, "<h1>Bonjour</h1>");
  assert.equal(resultat.fichiers[1].contenu, "body{color:red}");
  assert.match(resultat.commentaire, /Voici votre site/);
  assert.match(resultat.commentaire, /Voilà/);
});

test("signale un bloc coupé par une réponse tronquée", () => {
  const resultat = analyserReponse("<<<fichier: index.html>>>\n<h1>Coup");
  assert.equal(resultat.fichiers.length, 1);
  assert.equal(resultat.fichiers[0].incomplet, true);
  assert.equal(resultat.fichiers[0].contenu, "<h1>Coup");
});

test("ferme un bloc oublié sur l'ouverture du suivant", () => {
  const resultat = analyserReponse(
    "<<<fichier: a.html>>>\nA\n<<<fichier: b.html>>>\nB\n<<<fin>>>",
  );
  assert.equal(resultat.fichiers.length, 2);
  assert.equal(resultat.fichiers[0].incomplet, false);
  assert.equal(resultat.fichiers[0].contenu, "A");
  assert.equal(resultat.fichiers[1].contenu, "B");
});

test("retire une clôture Markdown ajoutée par le modèle", () => {
  const resultat = analyserReponse(
    "<<<fichier: app.js>>>\n```js\nconsole.log(`ok`)\n```\n<<<fin>>>",
  );
  assert.equal(resultat.fichiers[0].contenu, "console.log(`ok`)");
});

test("laisse passer les chevrons présents dans le contenu", () => {
  const resultat = analyserReponse("<<<fichier: index.html>>>\n<div><<a>></div>\n<<<fin>>>");
  assert.equal(resultat.fichiers[0].contenu, "<div><<a>></div>");
});

test("garde la dernière écriture d'un même chemin", () => {
  const resultat = analyserReponse(
    "<<<fichier: index.html>>>\nun\n<<<fin>>>\n<<<fichier: index.html>>>\ndeux\n<<<fin>>>",
  );
  assert.equal(resultat.fichiers.length, 1);
  assert.equal(resultat.fichiers[0].contenu, "deux");
});

test("rejette les chemins qui sortent du projet", () => {
  assert.equal(normaliserChemin("../../etc/passwd"), null);
  assert.equal(normaliserChemin("/etc/passwd"), "etc/passwd");
  assert.equal(normaliserChemin("./assets/app.css"), "assets/app.css");
  assert.equal(normaliserChemin("   "), null);
  assert.equal(analyserReponse("<<<fichier: ../secret>>>\nx\n<<<fin>>>").fichiers.length, 0);
});

test("une réponse sans bloc est entièrement du commentaire", () => {
  const resultat = analyserReponse("Je ne comprends pas la demande.");
  assert.deepEqual(resultat.fichiers, []);
  assert.equal(resultat.commentaire, "Je ne comprends pas la demande.");
});

test("choisit le fichier d'entrée le plus plausible", () => {
  assert.equal(fichierEntree(["style.css", "pages/index.html"]), "pages/index.html");
  assert.equal(fichierEntree(["a.html", "index.html"]), "index.html");
  assert.equal(fichierEntree(["style.css"]), null);
});

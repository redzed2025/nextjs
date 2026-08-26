import { test } from "node:test";
import assert from "node:assert/strict";
import { colorer, echapper, langageDepuisChemin } from "./coloration.ts";

test("déduit le langage de l'extension", () => {
  assert.equal(langageDepuisChemin("index.html"), "html");
  assert.equal(langageDepuisChemin("a/b/style.css"), "css");
  assert.equal(langageDepuisChemin("sw.js"), "js");
  assert.equal(langageDepuisChemin("manifest.webmanifest"), "json");
  assert.equal(langageDepuisChemin("LISEZMOI"), "texte");
});

test("échappe tout le contenu, y compris hors des jetons", () => {
  const colore = colorer('<img src="x" onerror="alert(1)">', "html");
  assert.doesNotMatch(colore.replace(/<\/?span[^>]*>/g, ""), /[<>]/);
  assert.match(colore, /jeton-balise/);
  assert.match(colore, /jeton-attribut/);
});

test("n'altère jamais le texte une fois les balises retirées", () => {
  const sources: Array<[string, Parameters<typeof colorer>[1]]> = [
    ["const a = `gabarit ${x}`; // note", "js"],
    ["body { color: #fff; margin: 0 }", "css"],
    ['{"nom": "Léa", "actif": true, "n": -1.5}', "json"],
    ["<!-- note --><p class='a'>Bonjour &amp; bonsoir</p>", "html"],
  ];
  for (const [source, langage] of sources) {
    const brut = colorer(source, langage)
      .replace(/<span class="[^"]*">/g, "")
      .replace(/<\/span>/g, "");
    assert.equal(brut, echapper(source), langage);
  }
});

test("le texte brut n'est pas coloré mais reste échappé", () => {
  assert.equal(colorer("a < b", "texte"), "a &lt; b");
});

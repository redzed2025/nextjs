import { test } from "node:test";
import assert from "node:assert/strict";
import { create } from "qrcode";
import { matriceQr, qrSvg } from "./qr.ts";

/**
 * L'implémentation embarquée est comparée module par module à la bibliothèque
 * `qrcode`, présente uniquement en dépendance de développement : l'application
 * livrée n'embarque aucune dépendance de génération de QR code.
 */
function reference(texte: string): boolean[][] {
  // Mode octet imposé : Atelier n'encode que ce mode, la référence doit faire de même.
  const { modules } = create([{ data: texte, mode: "byte" }] as never, {
    errorCorrectionLevel: "M",
  });
  const taille = modules.size;
  return Array.from({ length: taille }, (_, ligne) =>
    Array.from({ length: taille }, (_, colonne) => modules.get(ligne, colonne) === 1),
  );
}

const CAS = [
  "https://exemple.pages.dev",
  "https://mon-projet-9f2.pages.dev/",
  "HELLO",
  "https://atelier.example.com/p/6f3a1c9d-2b47-4e8a-9f10-5c2d7e8b4a06",
  "https://exemple.fr/café-brûlé?utm=qr",
  "a".repeat(120),
  "b".repeat(200),
];

for (const texte of CAS) {
  test(`matrice conforme à la référence — ${texte.slice(0, 32)}`, () => {
    assert.deepEqual(matriceQr(texte), reference(texte));
  });
}

test("refuse un texte trop long pour la version 10", () => {
  assert.throws(() => matriceQr("x".repeat(400)), /trop long/);
});

test("produit un SVG autonome", () => {
  const svg = qrSvg("https://exemple.pages.dev", { taille: 160 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /width="160"/);
  assert.doesNotMatch(svg, /<script/i);
});

test("couvre toutes les versions, aux capacités limites", () => {
  const limites = [1, 14, 15, 26, 27, 42, 43, 62, 63, 84, 85, 106, 107, 122, 123, 152, 153, 180, 181, 213];
  for (const longueur of limites) {
    const texte = "x".repeat(longueur);
    assert.deepEqual(matriceQr(texte), reference(texte), `longueur ${longueur}`);
  }
});

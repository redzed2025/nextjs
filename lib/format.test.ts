import { test } from "node:test";
import assert from "node:assert/strict";
import { cleMois, formaterCout, formaterJetons, formaterOctets } from "./format.ts";

test("un coût de génération reste lisible même très petit", () => {
  assert.equal(formaterCout(0), "0 $");
  assert.match(formaterCout(0.00002), /< 0,0001/);
  assert.match(formaterCout(0.00197), /0,002/);
  assert.match(formaterCout(12.5), /12,50/);
  // Symbole court : « 12,50 $ » et non « 12,50 $US ».
  assert.doesNotMatch(formaterCout(12.5), /\$US/);
});

test("les jetons sont abrégés au-delà du millier", () => {
  assert.equal(formaterJetons(812), "812");
  assert.equal(formaterJetons(1043), "1,0 k");
  assert.equal(formaterJetons(128000), "128 k");
  assert.equal(formaterJetons(1_000_000), "1,0 M");
});

test("les tailles de fichier suivent l'unité", () => {
  assert.equal(formaterOctets(512), "512 o");
  assert.match(formaterOctets(2048), /2,0 ko/);
  assert.match(formaterOctets(3 * 1024 * 1024), /3,0 Mo/);
});

test("la clé de mois sert au regroupement des dépenses", () => {
  assert.equal(cleMois(new Date(2026, 7, 26).getTime()), "2026-08");
  assert.equal(cleMois(new Date(2026, 0, 3).getTime()), "2026-01");
});

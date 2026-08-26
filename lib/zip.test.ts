import { test } from "node:test";
import assert from "node:assert/strict";
import { construireZip, nomArchive } from "./zip.ts";

test("produit une archive lisible par un décompresseur standard", async () => {
  const archive = await construireZip([
    { chemin: "index.html", contenu: "<h1>Bonjour le monde</h1>".repeat(50) },
    { chemin: "assets/style.css", contenu: "body{color:red}" },
    { chemin: "accents-éàü.txt", contenu: "contenu accentué" },
  ]);
  const octets = new Uint8Array(await archive.arrayBuffer());

  assert.equal(archive.type, "application/zip");
  // Signature d'en-tête local puis marqueur de fin d'annuaire central.
  assert.deepEqual([...octets.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...octets.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);

  const vue = new DataView(octets.buffer);
  assert.equal(vue.getUint16(octets.length - 22 + 10, true), 3, "trois entrées annoncées");
});

test("dérive un nom de fichier sûr du nom du projet", () => {
  assert.equal(nomArchive("Boulangerie Léa & Fils"), "boulangerie-lea-fils.zip");
  assert.equal(nomArchive("   "), "projet.zip");
  assert.equal(nomArchive("###"), "projet.zip");
});

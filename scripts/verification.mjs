import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { demarrerFauxFournisseur, demarrerServeurStatique } from "./serveurs-de-test.mjs";

/**
 * Vérification de bout en bout, hors ligne.
 *
 * Le build statique est servi comme il le serait en production, et un faux
 * fournisseur compatible OpenAI joue le rôle du modèle. Le parcours complet est
 * rejoué : clé refusée, clé acceptée, génération en flux, itération, retour à
 * une version antérieure, export ZIP.
 *
 *     npm run build && npm run verif
 *
 * Les captures sont écrites dans `captures/`.
 */

const PORT_APP = 4321;
const PORT_FOURNISSEUR = 4322;
const CAPTURES = resolve(import.meta.dirname, "..", "captures");

const CHEMINS_CHROMIUM = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].filter(Boolean);

async function lancerNavigateur() {
  for (const executablePath of CHEMINS_CHROMIUM) {
    try {
      return await chromium.launch({ executablePath });
    } catch {
      /* on essaie le suivant */
    }
  }
  // Chromium installé par Playwright lui-même.
  return chromium.launch();
}

const statique = await demarrerServeurStatique(PORT_APP);
const fournisseur = await demarrerFauxFournisseur(PORT_FOURNISSEUR);
await rm(CAPTURES, { recursive: true, force: true });
await mkdir(CAPTURES, { recursive: true });

const navigateur = await lancerNavigateur();
const contexte = await navigateur.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: "fr-FR",
  acceptDownloads: true,
});
const page = await contexte.newPage();

const journal = [];
page.on("pageerror", (erreur) => journal.push(`pageerror: ${erreur.message}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  // Le 401 volontaire du cas « clé refusée » n'est pas un défaut.
  if (message.text().includes("401")) return;
  journal.push(`console: ${message.text()}`);
});

const capture = (nom) => page.screenshot({ path: resolve(CAPTURES, `${nom}.png`) });

/** Attend qu'un élément porte enfin du texte, et le renvoie. */
async function attendreTexte(selecteur, delai = 10_000) {
  const limite = Date.now() + delai;
  while (Date.now() < limite) {
    const texte = await page.locator(selecteur).first().textContent().catch(() => null);
    if (texte && texte.trim()) return texte;
    await page.waitForTimeout(100);
  }
  return "";
}
const verifications = [];
const verifier = (nom, condition) => {
  verifications.push({ nom, ok: Boolean(condition) });
  console.log(`${condition ? "ok  " : "ÉCHEC"} ${nom}`);
};

try {
  await page.goto(`http://localhost:${PORT_APP}/`, { waitUntil: "networkidle" });
  verifier("l'onboarding s'impose au premier lancement", page.url().endsWith("/bienvenue"));
  await capture("01-bienvenue");

  await page.getByRole("button", { name: /J'ai compris/i }).click();
  await page.waitForURL("**/fournisseurs");

  // --- Clé refusée
  await page.getByRole("button", { name: /^Ajouter$/ }).click();
  await page.getByRole("button", { name: /Fournisseur personnalisé/ }).click();
  await page.getByLabel("Nom").fill("Clé cassée");
  await page.getByLabel("URL de base").fill(`http://localhost:${PORT_FOURNISSEUR}`);
  await page.getByLabel("Clé API", { exact: false }).fill("sk-mauvaise-cle-1234567890");
  await page.getByRole("button", { name: /Vérifier et enregistrer/ }).click();
  const alerte = await attendreTexte('[role="alert"]');
  verifier("une clé refusée donne un message actionnable", /refuse la clé API/.test(alerte));
  verifier(
    "la clé renvoyée par le fournisseur est expurgée du message",
    !alerte.includes("sk-mauvaise-cle-1234567890"),
  );
  await capture("02-cle-refusee");

  // --- Clé acceptée
  await page.getByLabel("Nom").fill("Maquette locale");
  await page.getByLabel("Clé API", { exact: false }).fill("sk-bonne-cle-1234567890");
  await page.getByRole("button", { name: /Vérifier et enregistrer/ }).click();
  await page.waitForSelector("text=Maquette locale", { timeout: 10_000 });
  const pageFournisseurs = (await page.textContent("body")) ?? "";
  verifier("la clé n'apparaît jamais en clair", !pageFournisseurs.includes("sk-bonne-cle-1234567890"));
  verifier("la clé est affichée masquée", /sk-b••••7890/.test(pageFournisseurs));
  verifier("le catalogue de modèles est récupéré", /2 modèles/.test(pageFournisseurs));
  await capture("03-fournisseurs");

  // --- Création de projet
  await page.getByRole("link", { name: "Projets" }).click();
  await page.getByRole("button", { name: /Nouveau/ }).click();
  await page.getByLabel("Nom du projet").fill("Boulangerie du coin");
  await page.getByRole("button", { name: /Maquette rapide/ }).first().click();
  await capture("04-nouveau-projet");
  await page.getByRole("button", { name: /Créer le projet/ }).click();
  await page.waitForURL("**/projet**");

  // --- Première génération
  await page
    .getByLabel("Votre demande")
    .fill("Une vitrine d'une page pour ma boulangerie, avec les horaires et un bouton d'appel.");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await page.waitForSelector("iframe[title='Aperçu du site généré']", { timeout: 30_000 });
  await page.waitForTimeout(800);
  await capture("05-apercu");

  const cadre = page.frameLocator("iframe[title='Aperçu du site généré']");
  verifier(
    "l'aperçu rend le site généré",
    (await cadre.locator("h1").first().textContent()) === "Boulangerie du coin",
  );
  verifier(
    "la feuille de style locale est intégrée à l'aperçu",
    (await cadre.locator("style").count()) > 0,
  );

  await page.getByRole("button", { name: "Bureau" }).click();
  await page.waitForTimeout(400);
  await capture("06-apercu-bureau");

  await page.getByRole("button", { name: /^Code/ }).click();
  const versionUn = await page.locator("li button span.font-mono").allTextContents();
  verifier(
    "les trois fichiers sont enregistrés",
    versionUn.join(",") === "app.js,index.html,styles.css",
  );
  await capture("07-fichiers");

  await page.getByRole("button", { name: /styles\.css/ }).click();
  await page.waitForTimeout(300);
  verifier(
    "le code est coloré à la lecture",
    (await page.locator("code .jeton-attribut").count()) > 0,
  );
  await capture("08-fichier");

  // --- Itération
  await page.getByRole("button", { name: /Discussion/ }).click();
  await page.getByLabel("Votre demande").fill("Ajoute une page de contact avec l'adresse.");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await page.waitForTimeout(4000);
  await capture("09-discussion");
  await page.getByRole("button", { name: /^Code/ }).click();
  const versionDeux = await page.locator("li button span.font-mono").allTextContents();
  verifier(
    "l'itération ajoute un fichier sans perdre les autres",
    versionDeux.join(",") === "app.js,contact.html,index.html,styles.css",
  );

  // --- Retour arrière
  await page.getByRole("button", { name: "Versions" }).click();
  await page.waitForTimeout(300);
  await capture("10-versions");
  await page.getByRole("button", { name: /Revenir à cette version/ }).first().click();
  await page.getByRole("button", { name: /^Revenir$/ }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /^Code/ }).click();
  const apresRetour = await page.locator("li button span.font-mono").allTextContents();
  verifier(
    "le retour à la version 1 restitue son contenu",
    apresRetour.join(",") === "app.js,index.html,styles.css",
  );

  // --- Export
  await page.getByRole("button", { name: /Publier/ }).click();
  await page.waitForTimeout(300);
  await capture("11-publier");
  const attente = page.waitForEvent("download", { timeout: 20_000 });
  await page.getByRole("button", { name: /Exporter en ZIP/ }).click();
  const telechargement = await attente;
  verifier(
    "l'archive porte le nom du projet",
    telechargement.suggestedFilename() === "boulangerie-du-coin.zip",
  );
  await page.keyboard.press("Escape");

  // --- Dépenses
  await page.goto(`http://localhost:${PORT_APP}/depenses`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const depenses = (await page.textContent("body")) ?? "";
  verifier("la dépense des deux tours est comptabilisée", /2 générations/.test(depenses));
  await capture("12-depenses");

  verifier("aucune erreur JavaScript", journal.length === 0);
  if (journal.length > 0) console.log(journal);
} finally {
  await navigateur.close();
  statique.close();
  fournisseur.close();
}

const echecs = verifications.filter((v) => !v.ok);
console.log(`\n${verifications.length - echecs.length}/${verifications.length} vérifications passées`);
assert.equal(echecs.length, 0, `Vérifications en échec : ${echecs.map((v) => v.nom).join(", ")}`);

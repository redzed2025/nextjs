import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

/**
 * Deux serveurs jetables pour la vérification de bout en bout :
 *
 *   - un hébergeur statique, qui sert `out/` comme le ferait Cloudflare Pages ;
 *   - un faux fournisseur compatible OpenAI, qui répond en SSE.
 *
 * Ils permettent d'exercer toute la chaîne — clé, flux, analyse, versions,
 * aperçu, export — sans réseau et sans consommer un seul jeton payant.
 */

const RACINE_STATIQUE = resolve(import.meta.dirname, "..", "out");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
};

export function demarrerServeurStatique(port) {
  const serveur = createServer(async (requete, reponse) => {
    const url = new URL(requete.url ?? "/", "http://interne");
    let chemin = join(RACINE_STATIQUE, normalize(decodeURIComponent(url.pathname)));

    const infos = await stat(chemin).catch(() => null);
    if (!infos || infos.isDirectory()) {
      const candidats = [join(chemin, "index.html"), `${chemin.replace(/\/$/, "")}.html`];
      let trouve = null;
      for (const candidat of candidats) {
        if (await stat(candidat).then((i) => i.isFile()).catch(() => false)) {
          trouve = candidat;
          break;
        }
      }
      chemin = trouve ?? join(RACINE_STATIQUE, "404.html");
    }

    try {
      const corps = await readFile(chemin);
      reponse.writeHead(200, {
        "content-type": TYPES[extname(chemin)] ?? "application/octet-stream",
      });
      reponse.end(corps);
    } catch {
      reponse.writeHead(404).end("introuvable");
    }
  });
  return new Promise((resoudre) => serveur.listen(port, () => resoudre(serveur)));
}

const PREMIERE_REPONSE = `Voici une vitrine d'une page, en français, avec les horaires et un bouton d'appel.

<<<fichier: index.html>>>
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Boulangerie du coin</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header><h1>Boulangerie du coin</h1><p>Pain au levain cuit chaque matin</p></header>
<main>
<section><h2>Nos produits</h2>
<ul><li>Baguette tradition — 1,30 €</li><li>Pain au levain — 4,20 €</li><li>Croissant — 1,20 €</li></ul>
</section>
<section><h2>Horaires</h2><p>Du mardi au dimanche, 7 h – 13 h et 16 h – 19 h 30</p></section>
</main>
<footer><a class="appel" href="tel:+33123456789">Appeler la boulangerie</a></footer>
<script src="app.js"></script>
</body>
</html>
<<<fin>>>

<<<fichier: styles.css>>>
:root { color-scheme: light dark; --or: #c98a3d; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #fffaf2; color: #2b2119; }
header { padding: 3rem 1.25rem 2rem; background: linear-gradient(160deg, #f6e2c4, #fffaf2); }
h1 { margin: 0; font-size: 2rem; }
main { padding: 0 1.25rem 2rem; }
ul { padding-left: 1.1rem; line-height: 1.9; }
.appel { display: block; margin: 1.25rem; padding: 1rem; border-radius: 999px; background: var(--or); color: #fff; text-align: center; text-decoration: none; font-weight: 600; }
@media (prefers-color-scheme: dark) { body { background: #191410; color: #f3e9dd; } header { background: linear-gradient(160deg, #3a2a18, #191410); } }
<<<fin>>>

<<<fichier: app.js>>>
document.querySelector('.appel').addEventListener('click', function () {
  console.log('appel demandé');
});
<<<fin>>>`;

const SECONDE_REPONSE = `J'ai ajouté une page de contact et un lien depuis l'accueil.

<<<fichier: contact.html>>>
<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Contact</title><link rel="stylesheet" href="styles.css"></head>
<body><header><h1>Nous contacter</h1></header><main><p>12 rue des Blés, 31000 Toulouse</p></main></body></html>
<<<fin>>>`;

const ENTETES_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

export function demarrerFauxFournisseur(port) {
  const serveur = createServer(async (requete, reponse) => {
    if (requete.method === "OPTIONS") {
      return reponse.writeHead(204, ENTETES_CORS).end();
    }

    // Toute clé contenant « mauvaise » est refusée : c'est le cas d'erreur testé.
    if ((requete.headers.authorization ?? "").includes("mauvaise")) {
      return reponse
        .writeHead(401, { ...ENTETES_CORS, "content-type": "application/json" })
        .end(
          JSON.stringify({
            error: { message: "Invalid API key provided: sk-mauvaise-cle-1234567890" },
          }),
        );
    }

    const url = requete.url ?? "/";

    if (url.startsWith("/v1/models")) {
      return reponse.writeHead(200, { ...ENTETES_CORS, "content-type": "application/json" }).end(
        JSON.stringify({
          data: [
            {
              id: "maquette-rapide",
              name: "Maquette rapide",
              context_length: 128_000,
              pricing: { prompt: "0.0000005", completion: "0.0000015" },
              architecture: { input_modalities: ["text"] },
            },
            {
              id: "maquette-image",
              name: "Maquette multimodale",
              context_length: 200_000,
              pricing: { prompt: "0.000003", completion: "0.000015" },
              architecture: { input_modalities: ["text", "image"] },
            },
          ],
        }),
      );
    }

    if (url.startsWith("/v1/chat/completions")) {
      const corps = await new Promise((resoudre) => {
        let donnees = "";
        requete.on("data", (morceau) => (donnees += morceau));
        requete.on("end", () => resoudre(donnees));
      });

      reponse.writeHead(200, {
        ...ENTETES_CORS,
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });

      const texte = corps.includes("page de contact") ? SECONDE_REPONSE : PREMIERE_REPONSE;
      // Découpage en petits fragments : c'est ce qui met l'analyseur incrémental
      // à l'épreuve, avec des blocs coupés au milieu.
      for (const fragment of texte.match(/[\s\S]{1,60}/g) ?? []) {
        reponse.write(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: fragment } }] })}\n\n`,
        );
        await new Promise((r) => setTimeout(r, 3));
      }
      reponse.write(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
      );
      reponse.write(
        `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 812, completion_tokens: 1043 } })}\n\n`,
      );
      reponse.write("data: [DONE]\n\n");
      return reponse.end();
    }

    reponse.writeHead(404, ENTETES_CORS).end("{}");
  });
  return new Promise((resoudre) => serveur.listen(port, () => resoudre(serveur)));
}

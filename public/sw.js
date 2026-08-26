// Service worker d'Atelier.
//
// Deux règles, volontairement strictes :
//   1. seules les ressources de l'application sont mises en cache ;
//   2. aucune requête vers un fournisseur IA ou une plateforme de déploiement
//      ne passe par ici — elles portent des clés API et ne doivent jamais être
//      interceptées, mises en cache ou rejouées.

const CACHE = "atelier-v1";
const COQUILLE = ["/", "/manifest.webmanifest", "/icone-192.png", "/icone-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(COQUILLE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;

  const url = new URL(requete.url);
  // Tout ce qui sort de l'origine de l'application est laissé au réseau.
  if (url.origin !== self.location.origin) return;

  // Réseau d'abord pour les navigations (l'app évolue souvent), cache en repli
  // pour rester utilisable hors ligne.
  if (requete.mode === "navigate") {
    event.respondWith(
      fetch(requete)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(CACHE).then((cache) => cache.put(requete, copie));
          return reponse;
        })
        .catch(() => caches.match(requete).then((c) => c ?? caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(requete).then((cache) => {
      if (cache) return cache;
      return fetch(requete).then((reponse) => {
        if (reponse.ok && reponse.type === "basic") {
          const copie = reponse.clone();
          caches.open(CACHE).then((c) => c.put(requete, copie));
        }
        return reponse;
      });
    }),
  );
});

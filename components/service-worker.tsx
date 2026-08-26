"use client";

import { useEffect } from "react";

/**
 * Enregistrement du service worker.
 *
 * Il ne sert qu'à rendre la coquille de l'application disponible hors ligne :
 * consulter et modifier ses projets sans réseau est un vrai besoin sur mobile.
 * Aucune requête vers un fournisseur ne passe par lui (voir public/sw.js).
 */
export function EnregistrementServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

    const enregistrer = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // Un échec d'enregistrement ne doit pas gêner : l'app reste utilisable en ligne.
      });
    };

    if (document.readyState === "complete") enregistrer();
    else window.addEventListener("load", enregistrer, { once: true });
  }, []);

  return null;
}

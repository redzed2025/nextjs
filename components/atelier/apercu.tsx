"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { construireApercu, MESSAGE_NAVIGATION, TAILLES_APERCU, type IdTailleApercu } from "@/lib/apercu";
import { Bandeau, Vide } from "@/components/ui";
import type { FichierProjet } from "@/lib/types";

/**
 * Aperçu du projet.
 *
 * L'iframe est en `sandbox="allow-scripts"` sans `allow-same-origin` : le
 * document obtient une origine opaque, donc aucun accès au stockage d'Atelier,
 * à ses clés ni à ses cookies. La navigation hors du cadre et l'envoi de
 * formulaires sont refusés par le bac à sable lui-même.
 */
export function ApercuProjet({
  fichiers,
  reseauAutorise,
  surBasculeReseau,
}: {
  fichiers: FichierProjet[];
  reseauAutorise: boolean;
  surBasculeReseau: (actif: boolean) => void;
}) {
  const [taille, setTaille] = useState<IdTailleApercu>("mobile");
  const [page, setPage] = useState<string | null>(null);
  const conteneur = useRef<HTMLDivElement>(null);
  const [echelle, setEchelle] = useState(1);

  const apercu = useMemo(
    () => construireApercu(fichiers, { reseau: reseauAutorise, page }),
    [fichiers, reseauAutorise, page],
  );

  const dimensions = TAILLES_APERCU.find((t) => t.id === taille) ?? TAILLES_APERCU[0];

  // La page rendue garde sa largeur réelle et l'ensemble est mis à l'échelle :
  // c'est ce qui rend un aperçu « bureau » lisible sur un téléphone.
  useEffect(() => {
    const ajuster = () => {
      const largeurDisponible = conteneur.current?.clientWidth ?? 0;
      if (!largeurDisponible) return;
      setEchelle(Math.min(1, largeurDisponible / dimensions.largeur));
    };
    ajuster();
    window.addEventListener("resize", ajuster);
    return () => window.removeEventListener("resize", ajuster);
  }, [dimensions.largeur]);

  // Les liens internes du site généré remontent ici : on recompose le document.
  useEffect(() => {
    const surMessage = (evenement: MessageEvent) => {
      const donnees = evenement.data as { type?: string; chemin?: string } | null;
      if (!donnees || donnees.type !== MESSAGE_NAVIGATION || typeof donnees.chemin !== "string") {
        return;
      }
      const cible = donnees.chemin.replace(/^\.?\//, "");
      if (fichiers.some((f) => f.chemin === cible)) setPage(cible);
    };
    window.addEventListener("message", surMessage);
    return () => window.removeEventListener("message", surMessage);
  }, [fichiers]);

  if (apercu.vide) {
    return (
      <Vide titre="Rien à afficher">
        L&apos;aperçu montre le fichier HTML du projet. Demandez une génération dans l&apos;onglet
        Discussion pour le voir apparaître ici.
      </Vide>
    );
  }

  const pagesHtml = fichiers.filter((f) => /\.html?$/i.test(f.chemin));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-bord px-3 py-2">
        <div className="flex gap-1" role="group" aria-label="Taille d'écran">
          {TAILLES_APERCU.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTaille(option.id)}
              aria-pressed={taille === option.id}
              className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                taille === option.id ? "bg-accent/15 text-accent" : "text-texte-doux"
              }`}
            >
              {option.nom}
            </button>
          ))}
        </div>

        {pagesHtml.length > 1 ? (
          <select
            className="ml-auto max-w-[45%] rounded-lg border border-bord bg-fond px-2 py-1.5 text-xs"
            value={apercu.page ?? ""}
            onChange={(evenement) => setPage(evenement.target.value)}
            aria-label="Page affichée"
          >
            {pagesHtml.map((fichier) => (
              <option key={fichier.chemin} value={fichier.chemin}>
                {fichier.chemin}
              </option>
            ))}
          </select>
        ) : (
          <span className="ml-auto truncate text-xs text-texte-doux">{apercu.page}</span>
        )}
      </div>

      <div ref={conteneur} className="flex-1 overflow-auto bg-fond-3/40 p-3">
        <div
          className="mx-auto overflow-hidden rounded-xl border border-bord bg-white shadow-lg"
          style={{
            width: dimensions.largeur,
            height: dimensions.hauteur,
            transform: `scale(${echelle})`,
            transformOrigin: "top center",
            marginBottom: dimensions.hauteur * (echelle - 1),
          }}
        >
          <iframe
            title="Aperçu du site généré"
            srcDoc={apercu.html}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="size-full border-0"
          />
        </div>
      </div>

      <div className="border-t border-bord px-3 py-2">
        <Bandeau ton={reseauAutorise ? "alerte" : "info"}>
          <label className="flex items-center gap-2.5 text-xs">
            <input
              type="checkbox"
              checked={reseauAutorise}
              onChange={(evenement) => surBasculeReseau(evenement.target.checked)}
              className="size-4 accent-[var(--color-accent)]"
            />
            <span>
              {reseauAutorise
                ? "L'aperçu peut joindre Internet. Le code généré peut donc émettre des requêtes."
                : "L'aperçu est coupé du réseau : le code généré ne peut joindre aucun serveur."}
            </span>
          </label>
        </Bandeau>
      </div>
    </div>
  );
}

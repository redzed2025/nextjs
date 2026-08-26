"use client";

import { useMemo, useState } from "react";
import { formaterContexte } from "@/lib/format";
import type { Fournisseur, ModeleInfo } from "@/lib/types";

/**
 * Choix du modèle : recherche, tri par prix ou par contexte, filtre sur les
 * modalités. Le PRD demande que le coût soit visible au moment du choix, pas
 * découvert sur la facture.
 */

type Tri = "pertinence" | "prix" | "contexte";

function prixLisible(modele: ModeleInfo): string | null {
  if (modele.prixEntree === null || modele.prixSortie === null) return null;
  if (modele.prixEntree === 0 && modele.prixSortie === 0) return "Gratuit";
  const format = (valeur: number) =>
    valeur >= 1 ? valeur.toFixed(2).replace(".", ",") : valeur.toFixed(3).replace(".", ",");
  return `${format(modele.prixEntree)} $ / ${format(modele.prixSortie)} $ par M`;
}

export function SelecteurModele({
  fournisseur,
  modeles,
  valeur,
  surChoix,
}: {
  fournisseur: Fournisseur | null;
  modeles: ModeleInfo[];
  valeur: string | null;
  surChoix: (id: string) => void;
}) {
  const [recherche, setRecherche] = useState("");
  const [tri, setTri] = useState<Tri>("pertinence");
  const [imageSeulement, setImageSeulement] = useState(false);

  const listeFiltree = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    let liste = modeles.filter((m) => {
      if (imageSeulement && !m.modalites.includes("image")) return false;
      if (!terme) return true;
      return m.id.toLowerCase().includes(terme) || m.nom.toLowerCase().includes(terme);
    });

    if (tri === "prix") {
      liste = [...liste].sort((a, b) => (a.prixSortie ?? Infinity) - (b.prixSortie ?? Infinity));
    } else if (tri === "contexte") {
      liste = [...liste].sort((a, b) => (b.contexte ?? 0) - (a.contexte ?? 0));
    }
    return liste;
  }, [modeles, recherche, tri, imageSeulement]);

  if (!fournisseur) {
    return (
      <p className="text-sm text-texte-doux">
        Choisissez d&apos;abord un fournisseur pour voir ses modèles.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="search"
        className="champ"
        placeholder="Rechercher un modèle…"
        value={recherche}
        onChange={(evenement) => setRecherche(evenement.target.value)}
      />

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["pertinence", "Par défaut"],
            ["prix", "Moins cher"],
            ["contexte", "Plus grand contexte"],
          ] as Array<[Tri, string]>
        ).map(([id, libelle]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTri(id)}
            className={`puce ${tri === id ? "border-accent text-accent" : ""}`}
          >
            {libelle}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setImageSeulement((v) => !v)}
          className={`puce ${imageSeulement ? "border-accent text-accent" : ""}`}
        >
          Accepte les images
        </button>
      </div>

      <p className="text-xs text-texte-doux">
        {listeFiltree.length} modèle{listeFiltree.length > 1 ? "s" : ""} chez {fournisseur.nom}
      </p>

      <ul className="max-h-[45dvh] space-y-2 overflow-y-auto">
        {listeFiltree.map((modele) => {
          const choisi = modele.id === valeur;
          const prix = prixLisible(modele);
          const contexte = formaterContexte(modele.contexte);
          return (
            <li key={modele.id}>
              <button
                type="button"
                onClick={() => surChoix(modele.id)}
                aria-pressed={choisi}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  choisi ? "border-accent bg-accent/10" : "border-bord bg-fond hover:border-accent/50"
                }`}
              >
                <span className="block truncate text-sm font-medium">{modele.nom}</span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-texte-doux">
                  {modele.id}
                </span>
                {prix || contexte ? (
                  <span className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-texte-doux">
                    {prix ? <span className="puce">{prix}</span> : null}
                    {contexte ? <span className="puce">{contexte}</span> : null}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
        {listeFiltree.length === 0 ? (
          <li className="rounded-xl border border-bord px-3 py-6 text-center text-sm text-texte-doux">
            Aucun modèle ne correspond.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAtelier } from "@/components/contexte-atelier";
import { Bandeau, Chargement, EnTete, Vide } from "@/components/ui";
import { tousLesMessages } from "@/lib/depot";
import { cleMois, formaterCout, formaterJetons, libelleMois } from "@/lib/format";
import type { MessageProjet } from "@/lib/types";

/**
 * Suivi de dépense (PRD US-10, question ouverte §12.3).
 *
 * Le calcul est local : jetons comptés par le fournisseur pendant le flux,
 * multipliés par les tarifs publiés. Interroger l'API de crédit du fournisseur
 * donnerait un chiffre plus exact, mais l'exposerait à chaque ouverture de cet
 * écran et lierait la page à un fournisseur précis. L'estimation est donc
 * assumée — et présentée comme telle, jamais comme une facture.
 */

interface Ligne {
  cle: string;
  libelle: string;
  cout: number;
  entree: number;
  sortie: number;
  echanges: number;
}

function agreger(
  messages: MessageProjet[],
  clef: (message: MessageProjet) => string | null,
  libelle: (cle: string) => string,
): Ligne[] {
  const total = new Map<string, Ligne>();
  for (const message of messages) {
    const cle = clef(message);
    if (cle === null) continue;
    const ligne = total.get(cle) ?? {
      cle,
      libelle: libelle(cle),
      cout: 0,
      entree: 0,
      sortie: 0,
      echanges: 0,
    };
    ligne.cout += message.cout;
    ligne.entree += message.tokensEntree;
    ligne.sortie += message.tokensSortie;
    ligne.echanges += 1;
    total.set(cle, ligne);
  }
  return [...total.values()].sort((a, b) => b.cout - a.cout);
}

export default function PageDepenses() {
  const atelier = useAtelier();
  // `moisCourant` est figé au chargement plutôt que relu à chaque rendu : la
  // date est une source externe, elle n'a pas sa place dans le calcul du rendu.
  const [donnees, setDonnees] = useState<{
    messages: MessageProjet[];
    moisCourant: string;
  } | null>(null);

  useEffect(() => {
    let vivant = true;
    tousLesMessages().then((tous) => {
      if (!vivant) return;
      setDonnees({
        messages: tous.filter((m) => m.role === "assistant"),
        moisCourant: cleMois(Date.now()),
      });
    });
    return () => {
      vivant = false;
    };
  }, []);

  const vues = useMemo(() => {
    if (!donnees) return null;
    const { messages, moisCourant } = donnees;
    const nomFournisseur = new Map(atelier.fournisseurs.map((f) => [f.id, f.nom]));
    const nomProjet = new Map(atelier.projets.map((p) => [p.id, p.nom]));
    return {
      total: messages.reduce((somme, m) => somme + m.cout, 0),
      jetons: messages.reduce((somme, m) => somme + m.tokensEntree + m.tokensSortie, 0),
      moisCourant: messages
        .filter((m) => cleMois(m.creeLe) === moisCourant)
        .reduce((somme, m) => somme + m.cout, 0),
      parMois: agreger(messages, (m) => cleMois(m.creeLe), libelleMois),
      parFournisseur: agreger(
        messages,
        (m) => m.fournisseurId,
        (cle) => nomFournisseur.get(cle) ?? "Fournisseur supprimé",
      ),
      parProjet: agreger(
        messages,
        (m) => m.projetId,
        (cle) => nomProjet.get(cle) ?? "Projet supprimé",
      ),
      parModele: agreger(
        messages,
        (m) => m.modele,
        (cle) => cle,
      ),
    };
  }, [donnees, atelier.fournisseurs, atelier.projets]);

  if (!atelier.pret || !vues) return <Chargement />;

  const plafond = atelier.reglages.plafondMensuel;
  const depassement = plafond !== null && vues.moisCourant >= plafond;

  return (
    <>
      <EnTete titre="Dépenses" sousTitre="Estimation calculée sur cet appareil" />

      <div className="space-y-5 px-4 py-4">
        {donnees && donnees.messages.length === 0 ? (
          <Vide
            titre="Aucune dépense"
            action={
              <Link href="/" className="bouton bouton-principal">
                Créer un projet
              </Link>
            }
          >
            Le compteur se remplit dès la première génération.
          </Vide>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="carte px-4 py-3.5">
                <p className="text-xs text-texte-doux">Ce mois-ci</p>
                <p className="mt-1 text-2xl font-semibold">{formaterCout(vues.moisCourant)}</p>
                {plafond !== null ? (
                  <>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fond-3">
                      <div
                        className={`h-full rounded-full ${depassement ? "bg-erreur" : "bg-accent"}`}
                        style={{ width: `${Math.min(100, (vues.moisCourant / plafond) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-texte-doux">
                      plafond {formaterCout(plafond)}
                    </p>
                  </>
                ) : null}
              </div>
              <div className="carte px-4 py-3.5">
                <p className="text-xs text-texte-doux">Depuis le début</p>
                <p className="mt-1 text-2xl font-semibold">{formaterCout(vues.total)}</p>
                <p className="mt-2 text-[11px] text-texte-doux">
                  {formaterJetons(vues.jetons)} jetons
                </p>
              </div>
            </div>

            {depassement ? (
              <Bandeau ton="alerte" titre="Plafond mensuel atteint">
                Ce plafond est indicatif : Atelier ne peut pas bloquer votre fournisseur. Pour un
                arrêt effectif, définissez un plafond par projet dans ses réglages.
              </Bandeau>
            ) : null}

            <Tableau titre="Par fournisseur" lignes={vues.parFournisseur} />
            <Tableau titre="Par projet" lignes={vues.parProjet} />
            <Tableau titre="Par modèle" lignes={vues.parModele} mono />
            <Tableau titre="Par mois" lignes={vues.parMois} />

            <Bandeau titre="Comment ce chiffre est obtenu">
              Jetons comptés par le fournisseur pendant la génération, multipliés par les tarifs
              qu&apos;il publie. Les modèles dont le tarif n&apos;est pas exposé comptent pour zéro.
              Seule la facture de votre fournisseur fait foi.
            </Bandeau>
          </>
        )}
      </div>
    </>
  );
}

function Tableau({ titre, lignes, mono }: { titre: string; lignes: Ligne[]; mono?: boolean }) {
  if (lignes.length === 0) return null;
  const maximum = Math.max(...lignes.map((l) => l.cout), 0.000001);

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">{titre}</h2>
      <ul className="carte divide-y divide-bord">
        {lignes.map((ligne) => (
          <li key={ligne.cle} className="px-4 py-3">
            <div className="flex items-baseline gap-3">
              <span className={`min-w-0 flex-1 truncate text-sm ${mono ? "font-mono text-xs" : ""}`}>
                {ligne.libelle}
              </span>
              <span className="text-sm tabular-nums">{formaterCout(ligne.cout)}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-fond-3">
              <div
                className="h-full rounded-full bg-accent/70"
                style={{ width: `${Math.max(2, (ligne.cout / maximum) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-texte-doux">
              {ligne.echanges} génération{ligne.echanges > 1 ? "s" : ""} ·{" "}
              {formaterJetons(ligne.entree)} entrée · {formaterJetons(ligne.sortie)} sortie
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

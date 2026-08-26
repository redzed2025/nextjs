"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtelier } from "@/components/contexte-atelier";
import { ApercuProjet } from "@/components/atelier/apercu";
import { Discussion } from "@/components/atelier/discussion";
import { EditeurFichiers } from "@/components/atelier/editeur";
import { FeuillePublication } from "@/components/atelier/publication";
import {
  IconeApercu,
  IconeCode,
  IconeDiscussion,
  IconePublier,
  IconeReglages,
  IconeRetour,
  IconeVersions,
} from "@/components/icones";
import { SelecteurModele } from "@/components/selecteur-modele";
import {
  Bandeau,
  Champ,
  Chargement,
  Feuille,
  Interrupteur,
  Selection,
  Vide,
  useConfirmation,
  useNotification,
} from "@/components/ui";
import { ErreurAtelier, messageLisible } from "@/lib/erreurs";
import {
  ecrireFichier,
  enregistrerTour,
  fichiersDeVersion,
  listerDeploiements,
  listerMessages,
  listerVersions,
  lireProjet,
  nouveauFichier,
  restaurerVersion,
  supprimerFichier,
} from "@/lib/depot";
import { creerAdaptateur, supporteReflexion } from "@/lib/fournisseurs";
import { formaterCout, formaterDateHeure } from "@/lib/format";
import { genererProjet, type EtatFlux } from "@/lib/generation/moteur";
import type {
  Deploiement,
  FichierProjet,
  MessageProjet,
  Projet,
  VersionProjet,
} from "@/lib/types";

type Onglet = "discussion" | "apercu" | "code";

const LONGUEURS: Array<{ valeur: number; libelle: string }> = [
  { valeur: 4000, libelle: "Courte — 4 000 jetons" },
  { valeur: 8000, libelle: "Standard — 8 000 jetons" },
  { valeur: 16000, libelle: "Longue — 16 000 jetons" },
  { valeur: 32000, libelle: "Très longue — 32 000 jetons" },
];

/** Longueur par défaut : l'API Anthropic accepte des réponses bien plus longues. */
function longueurParDefaut(typeApi: string | undefined): number {
  return typeApi === "anthropic" ? 16000 : 8000;
}

export default function PageProjet() {
  return (
    <Suspense fallback={<Chargement />}>
      <Atelier />
    </Suspense>
  );
}

function Atelier() {
  const parametres = useSearchParams();
  const id = parametres.get("id");
  const atelier = useAtelier();
  const { notifier, element: notification } = useNotification();
  const { confirmer, element: confirmation } = useConfirmation();

  const [projet, setProjet] = useState<Projet | null>(null);
  const [fichiers, setFichiers] = useState<FichierProjet[]>([]);
  const [messages, setMessages] = useState<MessageProjet[]>([]);
  const [versions, setVersions] = useState<VersionProjet[]>([]);
  const [deploiements, setDeploiements] = useState<Deploiement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [introuvable, setIntrouvable] = useState(false);

  const [onglet, setOnglet] = useState<Onglet>("discussion");
  const [flux, setFlux] = useState<EtatFlux | null>(null);
  const [erreur, setErreur] = useState<ErreurAtelier | null>(null);
  const controleur = useRef<AbortController | null>(null);

  const [reglagesOuverts, setReglagesOuverts] = useState(false);
  const [versionsOuvertes, setVersionsOuvertes] = useState(false);
  const [publicationOuverte, setPublicationOuverte] = useState(false);

  const recharger = useCallback(async (courant: Projet) => {
    const [f, m, v, d] = await Promise.all([
      fichiersDeVersion(courant.id, courant.versionCourante),
      listerMessages(courant.id),
      listerVersions(courant.id),
      listerDeploiements(courant.id),
    ]);
    setFichiers(f);
    setMessages(m);
    setVersions(v);
    setDeploiements(d);
  }, []);

  useEffect(() => {
    if (!id) {
      setIntrouvable(true);
      setChargement(false);
      return;
    }
    let vivant = true;
    (async () => {
      const trouve = await lireProjet(id);
      if (!vivant) return;
      if (!trouve) {
        setIntrouvable(true);
        setChargement(false);
        return;
      }
      setProjet(trouve);
      await recharger(trouve);
      if (vivant) setChargement(false);
    })();
    return () => {
      vivant = false;
      controleur.current?.abort();
    };
  }, [id, recharger]);

  const fournisseur = atelier.fournisseurs.find((f) => f.id === projet?.fournisseurId) ?? null;
  const modeleInfo = fournisseur?.modeles?.find((m) => m.id === projet?.modele) ?? null;
  const depense = useMemo(() => messages.reduce((somme, m) => somme + m.cout, 0), [messages]);
  const peutGenerer = Boolean(fournisseur && projet?.modele);

  const majProjetLocal = useCallback(
    async (partiel: Partial<Projet>) => {
      if (!projet) return;
      const suivant = await atelier.enregistrerProjet({ ...projet, ...partiel });
      setProjet(suivant);
      return suivant;
    },
    [projet, atelier],
  );

  const lancer = async (demande: string) => {
    if (!projet || !fournisseur || !projet.modele) return;

    setErreur(null);
    setFlux({ texte: "", reflexion: "", tokensEntree: 0, tokensSortie: 0, cout: 0, fichiers: [] });
    const abandon = new AbortController();
    controleur.current = abandon;

    try {
      const resultat = await genererProjet({
        adaptateur: creerAdaptateur(fournisseur),
        modele: projet.modele,
        modeleInfo,
        cible: projet.typeCible,
        demande,
        fichiers,
        historique: messages,
        reflexion: projet.reflexion && supporteReflexion(fournisseur, projet.modele),
        maxJetons: projet.maxJetons ?? longueurParDefaut(fournisseur.typeApi),
        plafondRestant: projet.plafond === null ? null : Math.max(projet.plafond - depense, 0),
        signal: abandon.signal,
        surProgres: setFlux,
      });

      if (resultat.texte.trim().length === 0) {
        setErreur(
          new ErreurAtelier("serveur", "Le modèle n'a rien renvoyé.", {
            conseil:
              "Reformulez la demande, ou essayez un autre modèle : certains refusent les " +
              "consignes de format très strictes.",
          }),
        );
        return;
      }

      const { projet: maj } = await enregistrerTour({
        projet,
        demande,
        reponse: resultat.texte,
        fichiersProduits: resultat.fichiers.filter((f) => !f.incomplet || f.contenu.trim()),
        fichiersExistants: fichiers,
        tokensEntree: resultat.tokensEntree,
        tokensSortie: resultat.tokensSortie,
        cout: resultat.cout,
        incomplet: resultat.motif !== "termine",
        resume: resumeVersion(resultat.commentaire, demande),
      });

      setProjet(maj);
      await recharger(maj);
      await atelier.rechargerProjets();

      if (resultat.fichiers.length > 0) setOnglet("apercu");
      if (resultat.motif === "plafond") {
        notifier("Plafond de dépense atteint : génération interrompue.", "erreur");
      } else if (resultat.motif === "tronque") {
        notifier("Réponse tronquée : demandez « continue » ou augmentez la longueur.", "erreur");
      } else if (resultat.motif === "annule") {
        notifier("Génération arrêtée. Ce qui a été reçu est conservé.");
      }
    } catch (cause) {
      setErreur(
        cause instanceof ErreurAtelier
          ? cause
          : new ErreurAtelier("inconnue", messageLisible(cause)),
      );
    } finally {
      controleur.current = null;
      setFlux(null);
    }
  };

  if (chargement) return <Chargement />;

  if (introuvable || !projet) {
    return (
      <Vide
        titre="Projet introuvable"
        action={
          <Link href="/" className="bouton bouton-principal">
            Retour aux projets
          </Link>
        }
      >
        Ce projet n&apos;existe pas sur cet appareil. Il a peut-être été supprimé.
      </Vide>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-1 border-b border-bord px-2 pb-2 pt-[calc(0.5rem+var(--marge-haute))]">
        <Link href="/" className="bouton bouton-fantome px-2 py-2" aria-label="Retour aux projets">
          <IconeRetour width={18} height={18} />
        </Link>
        <button
          type="button"
          onClick={() => setReglagesOuverts(true)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-sm font-medium">{projet.nom}</span>
          <span className="block truncate text-[11px] text-texte-doux">
            {fournisseur ? `${fournisseur.nom} · ${projet.modele ?? "aucun modèle"}` : "aucun fournisseur"}
            {depense > 0 ? ` · ${formaterCout(depense)}` : ""}
          </span>
        </button>
        <button
          type="button"
          className="bouton bouton-fantome px-2 py-2"
          onClick={() => setVersionsOuvertes(true)}
          aria-label="Versions"
        >
          <IconeVersions width={18} height={18} />
        </button>
        <button
          type="button"
          className="bouton bouton-fantome px-2 py-2"
          onClick={() => setReglagesOuverts(true)}
          aria-label="Réglages du projet"
        >
          <IconeReglages width={18} height={18} />
        </button>
        <button
          type="button"
          className="bouton bouton-principal px-3 py-2"
          onClick={() => setPublicationOuverte(true)}
        >
          <IconePublier width={16} height={16} />
          Publier
        </button>
      </header>

      <div className="min-h-0 flex-1">
        {onglet === "discussion" ? (
          <Discussion
            messages={messages}
            flux={flux}
            erreur={erreur}
            enCours={flux !== null}
            peutGenerer={peutGenerer}
            surEnvoi={lancer}
            surArret={() => controleur.current?.abort()}
          />
        ) : null}

        {onglet === "apercu" ? (
          <ApercuProjet
            fichiers={fichiers}
            reseauAutorise={atelier.reglages.reseauApercu}
            surBasculeReseau={(actif) => atelier.majReglages({ reseauApercu: actif })}
          />
        ) : null}

        {onglet === "code" ? (
          <EditeurFichiers
            fichiers={fichiers}
            surEnregistrement={async (fichier, contenu) => {
              await ecrireFichier({ ...fichier, contenu });
              await recharger(projet);
            }}
            surSuppression={async (fichier) => {
              await supprimerFichier(fichier.id);
              await recharger(projet);
            }}
            surCreation={async (chemin) => {
              await ecrireFichier(nouveauFichier(projet.id, projet.versionCourante, chemin));
              await recharger(projet);
            }}
            surRenommage={async (fichier, chemin) => {
              await ecrireFichier({ ...fichier, chemin });
              await recharger(projet);
            }}
          />
        ) : null}
      </div>

      <nav className="border-t border-bord bg-fond pb-[var(--marge-basse)]">
        <ul className="flex">
          {(
            [
              ["discussion", "Discussion", IconeDiscussion],
              ["apercu", "Aperçu", IconeApercu],
              ["code", "Code", IconeCode],
            ] as Array<[Onglet, string, typeof IconeCode]>
          ).map(([id, libelle, Icone]) => (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => setOnglet(id)}
                aria-current={onglet === id ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-1 py-2.5 text-[11px] transition-colors ${
                  onglet === id ? "text-accent" : "text-texte-doux"
                }`}
              >
                <Icone width={20} height={20} />
                {libelle}
                {id === "code" && fichiers.length > 0 ? ` (${fichiers.length})` : ""}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <FeuilleReglagesProjet
        ouverte={reglagesOuverts}
        projet={projet}
        surFermeture={() => setReglagesOuverts(false)}
        surChangement={majProjetLocal}
        depense={depense}
      />

      <Feuille
        ouverte={versionsOuvertes}
        titre="Versions"
        surFermeture={() => setVersionsOuvertes(false)}
      >
        {versions.length === 0 ? (
          <p className="pb-4 text-sm text-texte-doux">
            Chaque génération qui écrit des fichiers crée une version. Vous pourrez revenir à
            n&apos;importe laquelle.
          </p>
        ) : (
          <ul className="space-y-2 pb-2">
            {versions.map((version) => (
              <li key={version.id} className="rounded-xl border border-bord px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Version {version.numero}</span>
                  {version.numero === projet.versionCourante ? (
                    <span className="puce border-accent/50 text-accent">courante</span>
                  ) : null}
                  <span className="ml-auto text-[11px] text-texte-doux">
                    {formaterDateHeure(version.creeLe)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-texte-doux">{version.resume}</p>
                {version.numero !== projet.versionCourante ? (
                  <button
                    type="button"
                    className="bouton bouton-secondaire mt-2 w-full py-2 text-xs"
                    onClick={async () => {
                      const accepte = await confirmer(
                        `Revenir à la version ${version.numero} ?`,
                        "Une nouvelle version sera créée avec ces fichiers. Rien n'est perdu : la version courante reste dans l'historique.",
                        "Revenir",
                      );
                      if (!accepte) return;
                      const { projet: maj } = await restaurerVersion(projet, version.numero);
                      setProjet(maj);
                      await recharger(maj);
                      await atelier.rechargerProjets();
                      setVersionsOuvertes(false);
                      notifier(`Retour à la version ${version.numero}.`);
                    }}
                  >
                    Revenir à cette version
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Feuille>

      <FeuillePublication
        ouverte={publicationOuverte}
        projet={projet}
        fichiers={fichiers}
        deploiements={deploiements}
        surFermeture={() => setPublicationOuverte(false)}
        surDeploiement={async () => setDeploiements(await listerDeploiements(projet.id))}
        surNotification={notifier}
      />

      {notification}
      {confirmation}
    </div>
  );
}

function resumeVersion(commentaire: string, demande: string): string {
  const source = commentaire.trim() || demande.trim();
  const premiere = source.split(/\n|(?<=\.)\s/)[0] ?? source;
  return premiere.length > 120 ? `${premiere.slice(0, 117)}…` : premiere;
}

function FeuilleReglagesProjet({
  ouverte,
  projet,
  depense,
  surFermeture,
  surChangement,
}: {
  ouverte: boolean;
  projet: Projet;
  depense: number;
  surFermeture: () => void;
  surChangement: (partiel: Partial<Projet>) => Promise<Projet | undefined>;
}) {
  return (
    <Feuille ouverte={ouverte} titre="Réglages du projet" surFermeture={surFermeture}>
      {/* Le corps n'est monté qu'à l'ouverture : les champs partent des valeurs
          enregistrées, sans synchronisation dans un effet. */}
      <CorpsReglagesProjet projet={projet} depense={depense} surChangement={surChangement} />
    </Feuille>
  );
}

function CorpsReglagesProjet({
  projet,
  depense,
  surChangement,
}: {
  projet: Projet;
  depense: number;
  surChangement: (partiel: Partial<Projet>) => Promise<Projet | undefined>;
}) {
  const atelier = useAtelier();
  const [nom, setNom] = useState(projet.nom);
  const [plafond, setPlafond] = useState(projet.plafond === null ? "" : String(projet.plafond));

  const fournisseur = atelier.fournisseurs.find((f) => f.id === projet.fournisseurId) ?? null;
  const reflexionPossible =
    fournisseur !== null && projet.modele !== null && supporteReflexion(fournisseur, projet.modele);

  return (
      <div className="space-y-5 pb-2">
        <Champ
          etiquette="Nom"
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
          onBlur={() => nom.trim() && nom !== projet.nom && surChangement({ nom: nom.trim() })}
        />

        <fieldset>
          <legend className="etiquette">Fournisseur</legend>
          {atelier.fournisseurs.length === 0 ? (
            <Bandeau
              ton="alerte"
              action={
                <Link href="/fournisseurs" className="bouton bouton-secondaire">
                  Ajouter une clé
                </Link>
              }
            >
              Aucun fournisseur n&apos;est configuré.
            </Bandeau>
          ) : (
            <div className="flex flex-wrap gap-2">
              {atelier.fournisseurs.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() =>
                    surChangement({
                      fournisseurId: f.id,
                      modele: f.modeleParDefaut ?? f.modeles?.[0]?.id ?? null,
                    })
                  }
                  className={`puce ${projet.fournisseurId === f.id ? "border-accent text-accent" : ""}`}
                >
                  {f.nom}
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <div>
          <p className="etiquette">Modèle</p>
          <SelecteurModele
            fournisseur={fournisseur}
            modeles={fournisseur?.modeles ?? []}
            valeur={projet.modele}
            surChoix={(modele) => surChangement({ modele })}
          />
        </div>

        <Selection
          etiquette="Longueur maximale d'une réponse"
          value={String(projet.maxJetons ?? longueurParDefaut(fournisseur?.typeApi))}
          onChange={(evenement) => surChangement({ maxJetons: Number(evenement.target.value) })}
          aide="Une limite basse coupe les gros fichiers ; une limite haute coûte plus cher si le modèle s'étale."
        >
          {LONGUEURS.map((option) => (
            <option key={option.valeur} value={option.valeur}>
              {option.libelle}
            </option>
          ))}
        </Selection>

        {reflexionPossible ? (
          <Interrupteur
            etiquette="Réflexion approfondie"
            aide="Le modèle raisonne avant de répondre. Meilleure qualité sur les demandes complexes, réponse plus lente et plus chère."
            actif={projet.reflexion}
            surChangement={(actif) => surChangement({ reflexion: actif })}
          />
        ) : null}

        <Champ
          etiquette="Plafond de dépense pour ce projet"
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          placeholder="aucun"
          value={plafond}
          onChange={(evenement) => setPlafond(evenement.target.value)}
          onBlur={() => {
            const valeur = plafond.trim() === "" ? null : Number(plafond);
            surChangement({
              plafond: valeur !== null && Number.isFinite(valeur) && valeur >= 0 ? valeur : null,
            });
          }}
          aide={`Dépense estimée à ce jour : ${formaterCout(depense)}. Au-delà du plafond, la génération s'arrête d'elle-même.`}
        />
      </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAtelier } from "@/components/contexte-atelier";
import { IconeCopier, IconeCorbeille, IconePlus } from "@/components/icones";
import { SelecteurModele } from "@/components/selecteur-modele";
import {
  Bandeau,
  Champ,
  Chargement,
  EnTete,
  Feuille,
  Vide,
  useConfirmation,
  useNotification,
} from "@/components/ui";
import { formaterDateRelative } from "@/lib/format";
import { MODELE_ANTHROPIC_PAR_DEFAUT } from "@/lib/fournisseurs";
import type { Projet, TypeCible } from "@/lib/types";

const CIBLES: Array<{ id: TypeCible; nom: string; description: string }> = [
  {
    id: "site-statique",
    nom: "Site web",
    description: "Une ou plusieurs pages, publiables partout.",
  },
  {
    id: "pwa",
    nom: "Application installable",
    description: "Fonctionne hors ligne, s'ajoute à l'écran d'accueil.",
  },
];

export default function PageProjets() {
  const atelier = useAtelier();
  const routeur = useRouter();
  const { confirmer, element: confirmation } = useConfirmation();
  const { notifier, element: notification } = useNotification();
  const [creationOuverte, setCreationOuverte] = useState(false);

  useEffect(() => {
    if (atelier.pret && !atelier.reglages.onboardingFait) routeur.replace("/bienvenue");
  }, [atelier.pret, atelier.reglages.onboardingFait, routeur]);

  const supprimer = async (projet: Projet) => {
    const accepte = await confirmer(
      "Supprimer ce projet ?",
      `« ${projet.nom} », ses fichiers, ses versions et son historique seront effacés de cet appareil. Cette action est définitive.`,
    );
    if (!accepte) return;
    await atelier.retirerProjet(projet.id);
    notifier("Projet supprimé.");
  };

  const dupliquer = async (projet: Projet) => {
    const copie = await atelier.copierProjet(projet);
    notifier(`« ${copie.nom} » créé.`);
  };

  if (!atelier.pret) return <Chargement />;

  return (
    <>
      <EnTete
        titre="Mes projets"
        sousTitre={
          atelier.projets.length > 0
            ? `${atelier.projets.length} projet${atelier.projets.length > 1 ? "s" : ""} sur cet appareil`
            : undefined
        }
        action={
          <button
            type="button"
            className="bouton bouton-principal px-3"
            onClick={() => setCreationOuverte(true)}
          >
            <IconePlus />
            Nouveau
          </button>
        }
      />

      <div className="space-y-4 px-4 py-4">
        {atelier.erreur ? (
          <Bandeau ton="erreur" titre="Stockage local indisponible">
            {atelier.erreur} Atelier a besoin d&apos;IndexedDB pour conserver vos projets ; la
            navigation privée de certains navigateurs le désactive.
          </Bandeau>
        ) : null}

        {atelier.fournisseurs.length === 0 ? (
          <Bandeau
            ton="alerte"
            titre="Aucun fournisseur configuré"
            action={
              <Link href="/fournisseurs" className="bouton bouton-secondaire">
                Ajouter une clé API
              </Link>
            }
          >
            Atelier utilise vos propres clés : rien ne peut être généré tant qu&apos;aucun
            fournisseur n&apos;est branché.
          </Bandeau>
        ) : null}

        {atelier.projets.length === 0 ? (
          <Vide
            titre="Rien ici pour l'instant"
            action={
              <button
                type="button"
                className="bouton bouton-principal"
                onClick={() => setCreationOuverte(true)}
              >
                Créer mon premier projet
              </button>
            }
          >
            Décrivez ce que vous voulez construire, en français, et Atelier écrit les fichiers.
          </Vide>
        ) : (
          <ul className="space-y-3">
            {atelier.projets.map((projet) => (
              <li key={projet.id} className="carte overflow-hidden">
                <Link href={`/projet?id=${projet.id}`} className="block px-4 py-3.5">
                  <p className="truncate font-medium">{projet.nom}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texte-doux">
                    <span>
                      {CIBLES.find((c) => c.id === projet.typeCible)?.nom ?? projet.typeCible}
                    </span>
                    <span aria-hidden>•</span>
                    <span>
                      {projet.versionCourante === 0
                        ? "aucune version"
                        : `version ${projet.versionCourante}`}
                    </span>
                    <span aria-hidden>•</span>
                    <span>modifié {formaterDateRelative(projet.modifieLe)}</span>
                  </p>
                  {projet.modele ? (
                    <p className="mt-1.5 truncate font-mono text-[11px] text-texte-doux/80">
                      {projet.modele}
                    </p>
                  ) : null}
                </Link>
                <div className="flex justify-end gap-1 border-t border-bord px-2 py-1.5">
                  <button
                    type="button"
                    className="bouton bouton-fantome px-2.5 py-2 text-xs"
                    onClick={() => dupliquer(projet)}
                  >
                    <IconeCopier width={16} height={16} />
                    Dupliquer
                  </button>
                  <button
                    type="button"
                    className="bouton bouton-fantome px-2.5 py-2 text-xs hover:text-erreur"
                    onClick={() => supprimer(projet)}
                  >
                    <IconeCorbeille width={16} height={16} />
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <FeuilleCreation
        ouverte={creationOuverte}
        surFermeture={() => setCreationOuverte(false)}
        surCreation={(projet) => routeur.push(`/projet?id=${projet.id}`)}
      />
      {confirmation}
      {notification}
    </>
  );
}

function FeuilleCreation({
  ouverte,
  surFermeture,
  surCreation,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  surCreation: (projet: Projet) => void;
}) {
  const atelier = useAtelier();
  const [nom, setNom] = useState("");
  const [cible, setCible] = useState<TypeCible>("site-statique");
  const [fournisseurId, setFournisseurId] = useState<string | null>(null);
  const [modele, setModele] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!ouverte) return;
    const premier = atelier.fournisseurs[0] ?? null;
    setNom("");
    setCible("site-statique");
    setFournisseurId(premier?.id ?? null);
    setModele(
      premier?.modeleParDefaut ??
        (premier?.typeApi === "anthropic" ? MODELE_ANTHROPIC_PAR_DEFAUT : null),
    );
  }, [ouverte, atelier.fournisseurs]);

  const fournisseur = atelier.fournisseurs.find((f) => f.id === fournisseurId) ?? null;

  const creer = async () => {
    setEnCours(true);
    try {
      const projet = await atelier.ajouterProjet({
        nom: nom.trim() || "Projet sans nom",
        typeCible: cible,
        fournisseurId,
        modele,
      });
      surFermeture();
      surCreation(projet);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Feuille ouverte={ouverte} titre="Nouveau projet" surFermeture={surFermeture}>
      <div className="space-y-5">
        <Champ
          etiquette="Nom du projet"
          placeholder="Boulangerie du coin"
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
          autoComplete="off"
        />

        <fieldset>
          <legend className="etiquette">Que voulez-vous créer ?</legend>
          <div className="grid gap-2">
            {CIBLES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setCible(option.id)}
                aria-pressed={cible === option.id}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                  cible === option.id
                    ? "border-accent bg-accent/10"
                    : "border-bord bg-fond hover:border-accent/50"
                }`}
              >
                <span className="block text-sm font-medium">{option.nom}</span>
                <span className="mt-0.5 block text-xs text-texte-doux">{option.description}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {atelier.fournisseurs.length === 0 ? (
          <Bandeau
            ton="alerte"
            action={
              <Link href="/fournisseurs" className="bouton bouton-secondaire">
                Ajouter un fournisseur
              </Link>
            }
          >
            Vous pouvez créer le projet, mais il faudra une clé API pour générer quoi que ce soit.
          </Bandeau>
        ) : (
          <>
            <fieldset>
              <legend className="etiquette">Fournisseur</legend>
              <div className="flex flex-wrap gap-2">
                {atelier.fournisseurs.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFournisseurId(f.id);
                      setModele(
                        f.modeleParDefaut ??
                          (f.typeApi === "anthropic" ? MODELE_ANTHROPIC_PAR_DEFAUT : null),
                      );
                    }}
                    className={`puce ${fournisseurId === f.id ? "border-accent text-accent" : ""}`}
                  >
                    {f.nom}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <p className="etiquette">Modèle</p>
              <SelecteurModele
                fournisseur={fournisseur}
                modeles={fournisseur?.modeles ?? []}
                valeur={modele}
                surChoix={setModele}
              />
            </div>
          </>
        )}

        <button
          type="button"
          className="bouton bouton-principal w-full"
          onClick={creer}
          disabled={enCours}
        >
          {enCours ? "Création…" : "Créer le projet"}
        </button>
      </div>
    </Feuille>
  );
}

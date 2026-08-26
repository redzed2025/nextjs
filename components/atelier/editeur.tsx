"use client";

import { useMemo, useState } from "react";
import { IconeCopier, IconeCorbeille, IconeFichier, IconePlus, IconeRetour } from "@/components/icones";
import { Champ, Feuille, Vide, useConfirmation, useNotification, copierPressePapier } from "@/components/ui";
import { colorer, langageDepuisChemin } from "@/lib/coloration";
import { formaterOctets } from "@/lib/format";
import { normaliserChemin } from "@/lib/generation/analyse";
import type { FichierProjet } from "@/lib/types";

/**
 * Éditeur de fichiers.
 *
 * Deux modes plutôt qu'un champ coloré éditable : la lecture est colorée, la
 * modification se fait dans une zone de texte simple. Superposer un calque
 * coloré et un curseur natif tient rarement sur un clavier virtuel, et ce qui
 * compte ici est de pouvoir relire puis corriger sans surprise.
 */
export function EditeurFichiers({
  fichiers,
  surEnregistrement,
  surSuppression,
  surCreation,
  surRenommage,
}: {
  fichiers: FichierProjet[];
  surEnregistrement: (fichier: FichierProjet, contenu: string) => Promise<void>;
  surSuppression: (fichier: FichierProjet) => Promise<void>;
  surCreation: (chemin: string) => Promise<void>;
  surRenommage: (fichier: FichierProjet, chemin: string) => Promise<void>;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [creationOuverte, setCreationOuverte] = useState(false);
  const { confirmer, element: confirmation } = useConfirmation();
  const { notifier, element: notification } = useNotification();

  // Dérivé plutôt que synchronisé : si le fichier ouvert disparaît, la liste
  // reprend la main d'elle-même au rendu suivant.
  const fichier = fichiers.find((f) => f.chemin === ouvert) ?? null;

  if (fichier) {
    return (
      <>
        <VueFichier
          key={fichier.chemin}
          fichier={fichier}
          surRetour={() => setOuvert(null)}
          surEnregistrement={async (contenu) => {
            await surEnregistrement(fichier, contenu);
            notifier("Fichier enregistré.");
          }}
          surRenommage={async (chemin) => {
            await surRenommage(fichier, chemin);
            setOuvert(chemin);
            notifier("Fichier renommé.");
          }}
          surSuppression={async () => {
            const accepte = await confirmer(
              "Supprimer ce fichier ?",
              `« ${fichier.chemin} » sera retiré de la version courante.`,
            );
            if (!accepte) return;
            await surSuppression(fichier);
            setOuvert(null);
            notifier("Fichier supprimé.");
          }}
          surCopie={async () => {
            const copie = await copierPressePapier(fichier.contenu);
            notifier(copie ? "Contenu copié." : "Copie refusée par le navigateur.", copie ? "info" : "erreur");
          }}
        />
        {confirmation}
        {notification}
      </>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-bord px-3 py-2">
          <p className="text-xs text-texte-doux">
            {fichiers.length} fichier{fichiers.length > 1 ? "s" : ""}
          </p>
          <button
            type="button"
            className="bouton bouton-fantome px-2 py-1.5 text-xs"
            onClick={() => setCreationOuverte(true)}
          >
            <IconePlus width={16} height={16} />
            Nouveau fichier
          </button>
        </div>

        {fichiers.length === 0 ? (
          <Vide titre="Aucun fichier">
            Les fichiers apparaîtront ici dès la première génération. Vous pouvez aussi en créer un
            à la main.
          </Vide>
        ) : (
          <ul className="flex-1 divide-y divide-bord overflow-y-auto">
            {fichiers.map((f) => (
              <li key={f.chemin}>
                <button
                  type="button"
                  onClick={() => setOuvert(f.chemin)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-fond-3"
                >
                  <IconeFichier className="shrink-0 text-texte-doux" width={18} height={18} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm">{f.chemin}</span>
                    <span className="mt-0.5 block text-xs text-texte-doux">
                      {formaterOctets(new Blob([f.contenu]).size)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <FeuilleNouveauFichier
        ouverte={creationOuverte}
        cheminsExistants={fichiers.map((f) => f.chemin)}
        surFermeture={() => setCreationOuverte(false)}
        surValidation={async (chemin) => {
          await surCreation(chemin);
          setCreationOuverte(false);
          setOuvert(chemin);
        }}
      />
      {confirmation}
      {notification}
    </>
  );
}

function VueFichier({
  fichier,
  surRetour,
  surEnregistrement,
  surRenommage,
  surSuppression,
  surCopie,
}: {
  fichier: FichierProjet;
  surRetour: () => void;
  surEnregistrement: (contenu: string) => Promise<void>;
  surRenommage: (chemin: string) => Promise<void>;
  surSuppression: () => Promise<void>;
  surCopie: () => Promise<void>;
}) {
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(fichier.contenu);
  const [renommageOuvert, setRenommageOuvert] = useState(false);
  const [nouveauChemin, setNouveauChemin] = useState(fichier.chemin);

  const colore = useMemo(
    () => colorer(fichier.contenu, langageDepuisChemin(fichier.chemin)),
    [fichier.contenu, fichier.chemin],
  );

  const modifie = brouillon !== fichier.contenu;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-bord px-2 py-2">
        <button type="button" className="bouton bouton-fantome px-2 py-2" onClick={surRetour}>
          <IconeRetour width={18} height={18} />
          <span className="sr-only">Retour à la liste</span>
        </button>
        <button
          type="button"
          onClick={() => setRenommageOuvert(true)}
          className="min-w-0 flex-1 truncate text-left font-mono text-sm"
        >
          {fichier.chemin}
        </button>
        <button type="button" className="bouton bouton-fantome px-2 py-2" onClick={surCopie}>
          <IconeCopier width={18} height={18} />
          <span className="sr-only">Copier le contenu</span>
        </button>
        <button
          type="button"
          className="bouton bouton-fantome px-2 py-2 hover:text-erreur"
          onClick={surSuppression}
        >
          <IconeCorbeille width={18} height={18} />
          <span className="sr-only">Supprimer le fichier</span>
        </button>
      </div>

      {edition ? (
        <textarea
          value={brouillon}
          onChange={(evenement) => setBrouillon(evenement.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="flex-1 resize-none bg-fond px-4 py-3 font-mono text-[13px] leading-relaxed outline-none"
          aria-label={`Contenu de ${fichier.chemin}`}
        />
      ) : (
        <pre className="flex-1 overflow-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
          <code dangerouslySetInnerHTML={{ __html: colore }} />
        </pre>
      )}

      <div className="flex gap-2 border-t border-bord px-3 py-2">
        {edition ? (
          <>
            <button
              type="button"
              className="bouton bouton-secondaire flex-1 py-2 text-xs"
              onClick={() => {
                setBrouillon(fichier.contenu);
                setEdition(false);
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              className="bouton bouton-principal flex-1 py-2 text-xs"
              disabled={!modifie}
              onClick={async () => {
                await surEnregistrement(brouillon);
                setEdition(false);
              }}
            >
              Enregistrer
            </button>
          </>
        ) : (
          <button
            type="button"
            className="bouton bouton-secondaire w-full py-2 text-xs"
            onClick={() => setEdition(true)}
          >
            Modifier ce fichier
          </button>
        )}
      </div>

      <Feuille
        ouverte={renommageOuvert}
        titre="Renommer le fichier"
        surFermeture={() => setRenommageOuvert(false)}
      >
        <div className="space-y-4">
          <Champ
            etiquette="Chemin"
            value={nouveauChemin}
            onChange={(evenement) => setNouveauChemin(evenement.target.value)}
            autoCapitalize="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="bouton bouton-principal w-full"
            disabled={!normaliserChemin(nouveauChemin) || nouveauChemin === fichier.chemin}
            onClick={async () => {
              const propre = normaliserChemin(nouveauChemin);
              if (!propre) return;
              await surRenommage(propre);
              setRenommageOuvert(false);
            }}
          >
            Renommer
          </button>
        </div>
      </Feuille>
    </div>
  );
}

function FeuilleNouveauFichier({
  ouverte,
  cheminsExistants,
  surFermeture,
  surValidation,
}: {
  ouverte: boolean;
  cheminsExistants: string[];
  surFermeture: () => void;
  surValidation: (chemin: string) => Promise<void>;
}) {
  return (
    <Feuille ouverte={ouverte} titre="Nouveau fichier" surFermeture={surFermeture}>
      {/* Monté à l'ouverture seulement : le champ repart vide sans effet de bord. */}
      <FormulaireNouveauFichier cheminsExistants={cheminsExistants} surValidation={surValidation} />
    </Feuille>
  );
}

function FormulaireNouveauFichier({
  cheminsExistants,
  surValidation,
}: {
  cheminsExistants: string[];
  surValidation: (chemin: string) => Promise<void>;
}) {
  const [chemin, setChemin] = useState("");
  const propre = normaliserChemin(chemin);
  const existe = propre !== null && cheminsExistants.includes(propre);

  return (
      <div className="space-y-4">
        <Champ
          etiquette="Chemin"
          value={chemin}
          onChange={(evenement) => setChemin(evenement.target.value)}
          placeholder="pages/contact.html"
          autoCapitalize="off"
          spellCheck={false}
          aide={existe ? "Un fichier porte déjà ce chemin." : "Chemin relatif à la racine du projet."}
        />
        <button
          type="button"
          className="bouton bouton-principal w-full"
          disabled={!propre || existe}
          onClick={() => propre && surValidation(propre)}
        >
          Créer
        </button>
      </div>
  );
}

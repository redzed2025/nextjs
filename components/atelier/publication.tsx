"use client";

import { useEffect, useState } from "react";
import { IconeCopier, IconePublier, IconeValide } from "@/components/icones";
import { Bandeau, Champ, Feuille, copierPressePapier } from "@/components/ui";
import { CONNECTEURS, type Connecteur } from "@/lib/deploiement";
import { enregistrerDeploiement, nouveauDeploiement } from "@/lib/depot";
import { messageLisible } from "@/lib/erreurs";
import { formaterDateHeure } from "@/lib/format";
import { qrSvg } from "@/lib/qr";
import { ecrireSecret, lireSecret, masquerCle } from "@/lib/trousseau";
import type { Deploiement, FichierProjet, Projet } from "@/lib/types";
import { construireZip, nomArchive, partagerArchive } from "@/lib/zip";

/**
 * Publication et export.
 *
 * Même principe BYOK que pour les fournisseurs IA : le jeton d'hébergement
 * appartient à l'utilisateur, il est chiffré dans le trousseau, et l'archive est
 * fabriquée sur l'appareil.
 */

function refJeton(connecteurId: string): string {
  return `deploiement:${connecteurId}`;
}

export function FeuillePublication({
  ouverte,
  projet,
  fichiers,
  deploiements,
  surFermeture,
  surDeploiement,
  surNotification,
}: {
  ouverte: boolean;
  projet: Projet;
  fichiers: FichierProjet[];
  deploiements: Deploiement[];
  surFermeture: () => void;
  surDeploiement: () => Promise<void>;
  surNotification: (texte: string, ton?: "info" | "erreur") => void;
}) {
  const [connecteurId, setConnecteurId] = useState(CONNECTEURS[0].id);
  const connecteurActif = CONNECTEURS.find((c) => c.id === connecteurId) ?? CONNECTEURS[0];

  const exporter = async () => {
    if (fichiers.length === 0) {
      surNotification("Le projet ne contient encore aucun fichier.", "erreur");
      return;
    }
    try {
      const archive = await construireZip(
        fichiers.map((f) => ({ chemin: f.chemin, contenu: f.contenu })),
      );
      const resultat = await partagerArchive(archive, nomArchive(projet.nom), projet.nom);
      surNotification(
        resultat === "partage" ? "Archive partagée." : "Archive téléchargée.",
      );
    } catch (cause) {
      surNotification(messageLisible(cause), "erreur");
    }
  };

  return (
    <Feuille ouverte={ouverte} titre="Publier" surFermeture={surFermeture}>
      <div className="space-y-5 pb-2">
        <section>
          <h3 className="text-sm font-medium">Exporter le projet</h3>
          <p className="mt-1 text-xs text-texte-doux">
            Une archive ZIP des {fichiers.length} fichier{fichiers.length > 1 ? "s" : ""} de la
            version courante, à partager ou à enregistrer.
          </p>
          <button type="button" className="bouton bouton-secondaire mt-2.5 w-full" onClick={exporter}>
            Exporter en ZIP
          </button>
        </section>

        <hr className="border-bord" />

        <section>
          <h3 className="text-sm font-medium">Mettre en ligne</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {CONNECTEURS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setConnecteurId(c.id)}
                className={`puce ${connecteurId === c.id ? "border-accent text-accent" : ""}`}
              >
                {c.nom}
                {c.mode === "manuel" ? " · manuel" : ""}
              </button>
            ))}
          </div>

          <div className="mt-3">
            {connecteurActif.mode === "automatique" ? (
              <PublicationAutomatique
                connecteur={connecteurActif}
                projet={projet}
                fichiers={fichiers}
                deploiements={deploiements}
                surDeploiement={surDeploiement}
                surNotification={surNotification}
              />
            ) : (
              <PublicationManuelle connecteur={connecteurActif} surExport={exporter} />
            )}
          </div>
        </section>

        {deploiements.length > 0 ? (
          <>
            <hr className="border-bord" />
            <section>
              <h3 className="text-sm font-medium">Historique</h3>
              <ul className="mt-2 space-y-2">
                {deploiements.slice(0, 8).map((deploiement) => (
                  <li key={deploiement.id} className="rounded-xl border border-bord px-3 py-2.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={
                          deploiement.statut === "reussi"
                            ? "text-succes"
                            : deploiement.statut === "echoue"
                              ? "text-erreur"
                              : "text-texte-doux"
                        }
                      >
                        {deploiement.statut === "reussi"
                          ? "Publié"
                          : deploiement.statut === "echoue"
                            ? "Échec"
                            : "En cours"}
                      </span>
                      <span className="text-texte-doux">{deploiement.plateforme}</span>
                      <span className="ml-auto text-texte-doux">
                        {formaterDateHeure(deploiement.creeLe)}
                      </span>
                    </div>
                    {deploiement.url ? (
                      <a
                        href={deploiement.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 block truncate text-xs text-accent underline underline-offset-2"
                      >
                        {deploiement.url}
                      </a>
                    ) : null}
                    {deploiement.detail ? (
                      <p className="mt-1 text-xs text-texte-doux">{deploiement.detail}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </Feuille>
  );
}

function PublicationAutomatique({
  connecteur,
  projet,
  fichiers,
  deploiements,
  surDeploiement,
  surNotification,
}: {
  connecteur: Connecteur;
  projet: Projet;
  fichiers: FichierProjet[];
  deploiements: Deploiement[];
  surDeploiement: () => Promise<void>;
  surNotification: (texte: string, ton?: "info" | "erreur") => void;
}) {
  const [jetonConnu, setJetonConnu] = useState<string | null>(null);
  const [jetonSaisi, setJetonSaisi] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [etape, setEtape] = useState<string | null>(null);
  const [publie, setPublie] = useState<{ url: string } | null>(null);

  useEffect(() => {
    let vivant = true;
    lireSecret(refJeton(connecteur.id)).then((jeton) => {
      if (vivant) setJetonConnu(jeton);
    });
    return () => {
      vivant = false;
    };
  }, [connecteur.id]);

  const dernierReussi = deploiements.find(
    (d) => d.plateforme === connecteur.id && d.statut === "reussi",
  );

  const publier = async () => {
    if (!connecteur.publier) return;
    const jeton = jetonConnu ?? jetonSaisi.trim();
    if (!jeton) return;
    if (fichiers.length === 0) {
      surNotification("Le projet ne contient encore aucun fichier.", "erreur");
      return;
    }

    setEnCours(true);
    setPublie(null);
    const enregistrement = { ...nouveauDeploiement(projet.id, connecteur.id) };

    try {
      const resultat = await connecteur.publier({
        jeton,
        fichiers,
        nomProjet: projet.nom,
        identifiantSite: dernierReussi?.identifiantSite ?? null,
        surEtape: setEtape,
      });

      if (!jetonConnu) {
        await ecrireSecret(refJeton(connecteur.id), jeton);
        setJetonConnu(jeton);
        setJetonSaisi("");
      }

      await enregistrerDeploiement({
        ...enregistrement,
        statut: "reussi",
        url: resultat.url,
        identifiantSite: resultat.identifiantSite,
        detail: resultat.detail,
      });
      setPublie({ url: resultat.url });
      surNotification("Site publié.");
    } catch (cause) {
      await enregistrerDeploiement({
        ...enregistrement,
        statut: "echoue",
        detail: messageLisible(cause),
      });
      surNotification(messageLisible(cause), "erreur");
    } finally {
      setEnCours(false);
      setEtape(null);
      await surDeploiement();
    }
  };

  if (publie) {
    return <SitePublie url={publie.url} surNotification={surNotification} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-texte-doux">{connecteur.description}</p>

      {jetonConnu ? (
        <p className="flex items-center gap-2 text-xs text-texte-doux">
          <IconeValide width={14} height={14} className="text-succes" />
          Jeton enregistré ({masquerCle(jetonConnu)})
        </p>
      ) : (
        <Champ
          etiquette={`Jeton d'accès ${connecteur.nom}`}
          type="password"
          value={jetonSaisi}
          onChange={(evenement) => setJetonSaisi(evenement.target.value)}
          autoComplete="off"
          spellCheck={false}
          aide={
            connecteur.urlJeton ? (
              <a
                href={connecteur.urlJeton}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-2"
              >
                Créer un jeton personnel
              </a>
            ) : undefined
          }
        />
      )}

      {dernierReussi ? (
        <p className="text-xs text-texte-doux">
          Ce projet sera republié sur le site existant, à la même adresse.
        </p>
      ) : null}

      <button
        type="button"
        className="bouton bouton-principal w-full"
        disabled={enCours || (!jetonConnu && jetonSaisi.trim().length === 0)}
        onClick={publier}
      >
        <IconePublier width={16} height={16} />
        {enCours ? (etape ?? "Publication…") : `Publier sur ${connecteur.nom}`}
      </button>
    </div>
  );
}

function SitePublie({
  url,
  surNotification,
}: {
  url: string;
  surNotification: (texte: string, ton?: "info" | "erreur") => void;
}) {
  return (
    <div className="space-y-3 text-center">
      <p className="text-sm font-medium text-succes">Votre site est en ligne.</p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="block truncate text-sm text-accent underline underline-offset-2"
      >
        {url}
      </a>
      <div
        className="mx-auto w-40"
        // Le SVG est produit localement par lib/qr.ts : aucune donnée n'est envoyée
        // à un service de génération de QR code.
        dangerouslySetInnerHTML={{ __html: qrSvg(url) }}
      />
      <button
        type="button"
        className="bouton bouton-secondaire w-full"
        onClick={async () => {
          const copie = await copierPressePapier(url);
          surNotification(copie ? "Adresse copiée." : "Copie refusée.", copie ? "info" : "erreur");
        }}
      >
        <IconeCopier width={16} height={16} />
        Copier l&apos;adresse
      </button>
    </div>
  );
}

function PublicationManuelle({
  connecteur,
  surExport,
}: {
  connecteur: Connecteur;
  surExport: () => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      {connecteur.note ? <Bandeau ton="info">{connecteur.note}</Bandeau> : null}
      <ol className="space-y-2 text-xs text-texte-doux">
        {(connecteur.etapes ?? []).map((etape, rang) => (
          <li key={etape} className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-fond-3 text-[10px]">
              {rang + 1}
            </span>
            <span>{etape}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="bouton bouton-secondaire w-full" onClick={surExport}>
        Préparer l&apos;archive
      </button>
      {connecteur.urlJeton ? (
        <a
          href={connecteur.urlJeton}
          target="_blank"
          rel="noreferrer noopener"
          className="bouton bouton-fantome w-full"
        >
          Ouvrir {connecteur.nom}
        </a>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useAtelier } from "@/components/contexte-atelier";
import { IconeCorbeille, IconePlus, IconeValide } from "@/components/icones";
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
import { creerAdaptateur, LIBELLE_CORS, PREREGLAGES, type Prereglage } from "@/lib/fournisseurs";
import { MODELE_ANTHROPIC_PAR_DEFAUT } from "@/lib/fournisseurs";
import { ErreurAtelier, messageLisible } from "@/lib/erreurs";
import { formaterDateRelative } from "@/lib/format";
import { ecrireSecret, nouvelleReference, supprimerSecret } from "@/lib/trousseau";
import type { Fournisseur, ModeleInfo } from "@/lib/types";

export default function PageFournisseurs() {
  const atelier = useAtelier();
  const { confirmer, element: confirmation } = useConfirmation();
  const { notifier, element: notification } = useNotification();
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [modelesOuverts, setModelesOuverts] = useState<Fournisseur | null>(null);

  const retirer = async (fournisseur: Fournisseur) => {
    const accepte = await confirmer(
      "Supprimer ce fournisseur ?",
      `La clé de « ${fournisseur.nom} » sera effacée immédiatement du stockage sécurisé. Les projets qui l'utilisaient resteront, mais ne pourront plus générer.`,
    );
    if (!accepte) return;
    await atelier.retirerFournisseur(fournisseur);
    notifier("Fournisseur et clé supprimés.");
  };

  const rafraichirModeles = async (fournisseur: Fournisseur) => {
    notifier("Récupération des modèles…");
    try {
      const modeles = await creerAdaptateur(fournisseur).listerModeles();
      await atelier.majFournisseur({ ...fournisseur, modeles, modelesMajLe: Date.now() });
      notifier(`${modeles.length} modèles disponibles.`);
    } catch (cause) {
      notifier(messageLisible(cause), "erreur");
    }
  };

  if (!atelier.pret) return <Chargement />;

  return (
    <>
      <EnTete
        titre="Fournisseurs"
        sousTitre="Vos clés API, chiffrées sur cet appareil"
        action={
          <button
            type="button"
            className="bouton bouton-principal px-3"
            onClick={() => setAjoutOuvert(true)}
          >
            <IconePlus />
            Ajouter
          </button>
        }
      />

      <div className="space-y-4 px-4 py-4">
        {atelier.fournisseurs.length === 0 ? (
          <Vide
            titre="Aucun fournisseur"
            action={
              <button
                type="button"
                className="bouton bouton-principal"
                onClick={() => setAjoutOuvert(true)}
              >
                Brancher une clé
              </button>
            }
          >
            Ajoutez la clé API d&apos;un fournisseur pour commencer à générer. Elle ne quittera
            jamais cet appareil, sauf vers ce fournisseur.
          </Vide>
        ) : (
          <ul className="space-y-3">
            {atelier.fournisseurs.map((fournisseur) => (
              <li key={fournisseur.id} className="carte px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{fournisseur.nom}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-texte-doux">
                      {fournisseur.masque}
                    </p>
                    <p className="mt-1 truncate text-xs text-texte-doux">{fournisseur.baseUrl}</p>
                  </div>
                  <button
                    type="button"
                    className="bouton bouton-fantome px-2 py-2 hover:text-erreur"
                    onClick={() => retirer(fournisseur)}
                    aria-label={`Supprimer ${fournisseur.nom}`}
                  >
                    <IconeCorbeille width={18} height={18} />
                  </button>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="puce">
                    {fournisseur.typeApi === "anthropic" ? "API Anthropic" : "Compatible OpenAI"}
                  </span>
                  <span className="puce">
                    {fournisseur.modeles?.length ?? 0} modèle
                    {(fournisseur.modeles?.length ?? 0) > 1 ? "s" : ""}
                  </span>
                  {fournisseur.modelesMajLe ? (
                    <span className="puce">
                      liste {formaterDateRelative(fournisseur.modelesMajLe)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="bouton bouton-secondaire flex-1 py-2 text-xs"
                    onClick={() => setModelesOuverts(fournisseur)}
                  >
                    Modèles
                  </button>
                  <button
                    type="button"
                    className="bouton bouton-secondaire flex-1 py-2 text-xs"
                    onClick={() => rafraichirModeles(fournisseur)}
                  >
                    Rafraîchir la liste
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Bandeau titre="Où sont stockées les clés ?">
          Chiffrées en AES-256 dans le stockage de ce navigateur, avec une clé de chiffrement que
          le navigateur ne laisse jamais relire, pas même à Atelier. Elles ne sont ni affichées en
          clair, ni journalisées, ni incluses dans un rapport d&apos;erreur.
        </Bandeau>
      </div>

      <FeuilleAjout ouverte={ajoutOuvert} surFermeture={() => setAjoutOuvert(false)} />

      <Feuille
        ouverte={modelesOuverts !== null}
        titre={`Modèle par défaut — ${modelesOuverts?.nom ?? ""}`}
        surFermeture={() => setModelesOuverts(null)}
      >
        {modelesOuverts ? (
          <SelecteurModele
            fournisseur={modelesOuverts}
            modeles={modelesOuverts.modeles ?? []}
            valeur={modelesOuverts.modeleParDefaut}
            surChoix={async (id) => {
              await atelier.majFournisseur({ ...modelesOuverts, modeleParDefaut: id });
              setModelesOuverts(null);
              notifier("Modèle par défaut enregistré.");
            }}
          />
        ) : null}
      </Feuille>

      {confirmation}
      {notification}
    </>
  );
}

type Etape = "choix" | "formulaire";

function FeuilleAjout({ ouverte, surFermeture }: { ouverte: boolean; surFermeture: () => void }) {
  const atelier = useAtelier();
  const [etape, setEtape] = useState<Etape>("choix");
  const [reglage, setReglage] = useState<Prereglage | null>(null);
  const [nom, setNom] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [cle, setCle] = useState("");
  const [etat, setEtat] = useState<"repos" | "verification" | "erreur">("repos");
  const [erreur, setErreur] = useState<ErreurAtelier | null>(null);

  useEffect(() => {
    if (ouverte) return;
    setEtape("choix");
    setReglage(null);
    setCle("");
    setEtat("repos");
    setErreur(null);
  }, [ouverte]);

  const choisir = (prereglage: Prereglage) => {
    setReglage(prereglage);
    setNom(prereglage.id === "personnalise" ? "" : prereglage.nom);
    setBaseUrl(prereglage.baseUrl);
    setCle("");
    setErreur(null);
    setEtat("repos");
    setEtape("formulaire");
  };

  const enregistrer = async () => {
    if (!reglage) return;
    setEtat("verification");
    setErreur(null);

    // La vérification a besoin d'un adaptateur, donc d'une clé dans le trousseau :
    // on écrit sous une référence provisoire, qu'on efface si la clé est refusée.
    const cleRef = nouvelleReference("essai");
    try {
      await ecrireSecret(cleRef, cle.trim());

      const provisoire: Fournisseur = {
        id: "provisoire",
        nom: nom.trim() || reglage.nom,
        presetId: reglage.id,
        baseUrl: baseUrl.trim(),
        typeApi: reglage.typeApi,
        cleRef,
        masque: "",
        modeles: null,
        modelesMajLe: null,
        modeleParDefaut: reglage.typeApi === "anthropic" ? MODELE_ANTHROPIC_PAR_DEFAUT : null,
        creeLe: Date.now(),
      };

      const adaptateur = creerAdaptateur(provisoire);
      let modeles: ModeleInfo[] | null = null;
      try {
        modeles = await adaptateur.listerModeles();
      } catch (cause) {
        // Un catalogue indisponible n'est pas bloquant ; une clé refusée l'est.
        if (cause instanceof ErreurAtelier && cause.categorie === "cle-invalide") throw cause;
        await adaptateur.verifierCle();
      }

      await atelier.ajouterFournisseur({
        nom: provisoire.nom,
        presetId: reglage.id,
        baseUrl: provisoire.baseUrl,
        typeApi: reglage.typeApi,
        cle: cle.trim(),
        modeles,
        modeleParDefaut:
          modeles?.find((m) => m.id === MODELE_ANTHROPIC_PAR_DEFAUT)?.id ??
          provisoire.modeleParDefaut ??
          modeles?.[0]?.id ??
          null,
      });
      surFermeture();
    } catch (cause) {
      setErreur(
        cause instanceof ErreurAtelier
          ? cause
          : new ErreurAtelier("inconnue", messageLisible(cause)),
      );
      setEtat("erreur");
    } finally {
      await supprimerSecret(cleRef);
    }
  };

  const cleRequise = reglage?.id !== "ollama";
  const pretAEnvoyer = Boolean(baseUrl.trim()) && (!cleRequise || cle.trim().length > 0);

  return (
    <Feuille
      ouverte={ouverte}
      titre={etape === "choix" ? "Choisir un fournisseur" : `Configurer ${reglage?.nom ?? ""}`}
      surFermeture={surFermeture}
    >
      {etape === "choix" ? (
        <ul className="space-y-2 pb-2">
          {PREREGLAGES.map((prereglage) => (
            <li key={prereglage.id}>
              <button
                type="button"
                onClick={() => choisir(prereglage)}
                className="w-full rounded-xl border border-bord bg-fond px-3 py-3 text-left transition-colors hover:border-accent/60"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium">{prereglage.nom}</span>
                  <span
                    className={`puce text-[10px] ${
                      prereglage.cors === "confirme" ? "border-succes/40 text-succes" : ""
                    }`}
                  >
                    {LIBELLE_CORS[prereglage.cors]}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-texte-doux">{prereglage.description}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-4 pb-2">
          {reglage?.cors !== "confirme" ? (
            <Bandeau ton="alerte" titre="Appels depuis le navigateur">
              {reglage?.noteCors ??
                "Ce fournisseur n'annonce pas publiquement accepter les requêtes émises depuis une page web. " +
                  "Si la vérification échoue sans message du serveur, c'est cette règle qui bloque."}
            </Bandeau>
          ) : null}

          <Champ
            etiquette="Nom"
            value={nom}
            onChange={(evenement) => setNom(evenement.target.value)}
            placeholder="Mon fournisseur"
            autoComplete="off"
          />

          <Champ
            etiquette="URL de base"
            value={baseUrl}
            onChange={(evenement) => setBaseUrl(evenement.target.value)}
            placeholder="https://api.exemple.com"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aide="Racine de l'API, sans « /v1 » ni nom de méthode."
          />

          <Champ
            etiquette={cleRequise ? "Clé API" : "Clé API (facultative)"}
            type="password"
            value={cle}
            onChange={(evenement) => setCle(evenement.target.value)}
            placeholder={cleRequise ? "collez votre clé" : "laisser vide pour un serveur local"}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aide={
              reglage?.urlCle ? (
                <>
                  Elle est chiffrée avant d&apos;être stockée et ne sera plus jamais affichée.{" "}
                  <a
                    href={reglage.urlCle}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline underline-offset-2"
                  >
                    Créer une clé chez {reglage.nom}
                  </a>
                </>
              ) : (
                "Elle est chiffrée avant d'être stockée et ne sera plus jamais affichée."
              )
            }
          />

          {erreur ? (
            <Bandeau ton="erreur" titre={erreur.message}>
              {erreur.conseil}
            </Bandeau>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              className="bouton bouton-secondaire"
              onClick={() => setEtape("choix")}
            >
              Retour
            </button>
            <button
              type="button"
              className="bouton bouton-principal flex-1"
              onClick={enregistrer}
              disabled={!pretAEnvoyer || etat === "verification"}
            >
              {etat === "verification" ? (
                "Vérification de la clé…"
              ) : (
                <>
                  <IconeValide width={16} height={16} />
                  Vérifier et enregistrer
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </Feuille>
  );
}

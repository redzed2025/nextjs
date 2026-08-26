"use client";


import { useAtelier } from "@/components/contexte-atelier";
import {
  Bandeau,
  Champ,
  Chargement,
  EnTete,
  Interrupteur,
  useConfirmation,
  useNotification,
  useValeurClient,
} from "@/components/ui";
import { viderTrousseau } from "@/lib/trousseau";

export default function PageReglages() {
  const atelier = useAtelier();
  const { confirmer, element: confirmation } = useConfirmation();
  const { notifier, element: notification } = useNotification();
  const installable = useValeurClient<"ios" | "autre" | null>(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return null;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios" : "autre";
  }, null);

  const toutEffacer = async () => {
    const accepte = await confirmer(
      "Tout effacer ?",
      "Projets, fichiers, historique, dépenses et clés API seront supprimés de cet appareil. Rien n'est sauvegardé ailleurs : cette action est irréversible.",
      "Tout effacer",
    );
    if (!accepte) return;
    await viderTrousseau();
    await Promise.all(
      ["atelier", "atelier-trousseau"].map(
        (nom) =>
          new Promise<void>((resoudre) => {
            const demande = indexedDB.deleteDatabase(nom);
            demande.onsuccess = () => resoudre();
            demande.onerror = () => resoudre();
            demande.onblocked = () => resoudre();
          }),
      ),
    );
    notifier("Données effacées. Rechargement…");
    setTimeout(() => window.location.replace("/"), 800);
  };

  if (!atelier.pret) return <Chargement />;

  return (
    <>
      <EnTete titre="Réglages" />

      <div className="space-y-6 px-4 py-4">
        {installable ? (
          <Bandeau titre="Installer Atelier">
            {installable === "ios" ? (
              <>
                Dans Safari, touchez le bouton Partager, puis « Sur l&apos;écran d&apos;accueil ».
                Atelier s&apos;ouvrira alors en plein écran, comme une application.
              </>
            ) : (
              <>
                Depuis le menu de votre navigateur, choisissez « Installer l&apos;application » ou
                « Ajouter à l&apos;écran d&apos;accueil ».
              </>
            )}
          </Bandeau>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-sm font-medium">Dépense</h2>
          <Champ
            // Champ non contrôlé, réinitialisé quand la valeur enregistrée change :
            // la saisie reste libre et la validation se fait à la sortie du champ.
            key={String(atelier.reglages.plafondMensuel)}
            etiquette="Plafond mensuel indicatif"
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            placeholder="aucun"
            defaultValue={
              atelier.reglages.plafondMensuel === null ? "" : String(atelier.reglages.plafondMensuel)
            }
            onBlur={(evenement) => {
              const saisie = evenement.target.value.trim();
              const valeur = saisie === "" ? null : Number(saisie);
              atelier.majReglages({
                plafondMensuel:
                  valeur !== null && Number.isFinite(valeur) && valeur >= 0 ? valeur : null,
              });
            }}
            aide="Affiché sur l'écran Dépenses. Pour un arrêt automatique, définissez un plafond par projet."
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Aperçu</h2>
          <Interrupteur
            etiquette="Autoriser le réseau dans l'aperçu"
            aide="Désactivé, le code généré ne peut joindre aucun serveur depuis l'aperçu. À activer seulement si votre site doit charger une ressource externe."
            actif={atelier.reglages.reseauApercu}
            surChangement={(actif) => atelier.majReglages({ reseauApercu: actif })}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Confidentialité</h2>
          <div className="carte space-y-3 px-4 py-4 text-sm text-texte-doux">
            <p>
              <strong className="text-texte">Aucun serveur Atelier.</strong> L&apos;application est
              un ensemble de fichiers statiques exécutés par votre navigateur. Vos projets, votre
              historique et vos clés restent dans le stockage de cet appareil.
            </p>
            <p>
              <strong className="text-texte">Aucune télémétrie.</strong> Ni prompt, ni contenu de
              projet, ni statistique d&apos;usage ne sont collectés.
            </p>
            <p>
              <strong className="text-texte">Vos clés.</strong> Chiffrées en AES-256 avant d&apos;être
              stockées, avec une clé que le navigateur ne laisse jamais relire. Elles ne sont
              transmises qu&apos;au fournisseur auquel elles appartiennent. Cette protection est
              solide au repos, mais reste celle d&apos;un navigateur, pas celle d&apos;un coffre
              matériel : sur un appareil partagé, préférez une clé dédiée et un plafond de dépense.
            </p>
            <p>
              <strong className="text-texte">Vos prompts chez le fournisseur.</strong> Ce que vous
              écrivez est envoyé au fournisseur que vous avez choisi et relève de ses conditions
              d&apos;utilisation et de sa politique de conservation.
            </p>
            <p>
              <strong className="text-texte">Le code généré.</strong> Il s&apos;exécute dans un cadre
              isolé, sans accès aux données d&apos;Atelier ni, par défaut, au réseau.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Usage responsable</h2>
          <div className="carte space-y-3 px-4 py-4 text-sm text-texte-doux">
            <p>
              Vous êtes responsable de ce que vous générez et publiez. Les contenus illicites,
              trompeurs ou destinés à nuire sont interdits, comme l&apos;imitation d&apos;un site
              officiel ou la collecte de données sous une fausse identité.
            </p>
            <p>
              Un site généré peut comporter des erreurs : relisez-le avant de le mettre en ligne,
              en particulier s&apos;il affiche des prix, des horaires ou des mentions légales.
            </p>
            <p>
              Pour signaler un abus lié à un modèle, adressez-vous au fournisseur concerné : c&apos;est
              lui qui applique ses propres garde-fous. Atelier n&apos;a aucune visibilité sur vos
              générations.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Données</h2>
          <Bandeau ton="alerte" titre="Rien n'est sauvegardé ailleurs">
            Vos projets n&apos;existent que sur cet appareil. Effacer les données du site, changer de
            navigateur ou réinitialiser le téléphone les supprime définitivement. Exportez ce qui
            compte en ZIP.
          </Bandeau>
          <button type="button" className="bouton bouton-danger w-full" onClick={toutEffacer}>
            Effacer toutes les données locales
          </button>
        </section>

        <p className="pb-2 text-center text-xs text-texte-doux">
          Atelier — application locale, sans compte et sans serveur.
        </p>
      </div>

      {confirmation}
      {notification}
    </>
  );
}

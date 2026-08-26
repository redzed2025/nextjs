"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { IconeAlerte, IconeFermer, IconeValide } from "./icones";

/** Petites briques d'interface partagées, adaptées à un usage au pouce. */

export function EnTete({
  titre,
  sousTitre,
  action,
  retour,
}: {
  titre: string;
  sousTitre?: React.ReactNode;
  action?: React.ReactNode;
  retour?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-bord bg-fond/90 px-4 pb-3 pt-[calc(0.75rem+var(--marge-haute))] backdrop-blur">
      <div className="flex items-start gap-3">
        {retour}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{titre}</h1>
          {sousTitre ? <p className="mt-0.5 text-sm text-texte-doux">{sousTitre}</p> : null}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Bandeau({
  ton = "info",
  titre,
  children,
  action,
}: {
  ton?: "info" | "alerte" | "erreur" | "succes";
  titre?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const styles = {
    info: "border-bord bg-fond-3 text-texte-doux",
    alerte: "border-alerte/40 bg-alerte/10 text-alerte",
    erreur: "border-erreur/40 bg-erreur/10 text-erreur",
    succes: "border-succes/40 bg-succes/10 text-succes",
  }[ton];

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${styles}`} role={ton === "erreur" ? "alert" : undefined}>
      <div className="flex gap-2.5">
        {ton === "erreur" || ton === "alerte" ? (
          <IconeAlerte className="mt-0.5 shrink-0" width={16} height={16} />
        ) : null}
        {ton === "succes" ? <IconeValide className="mt-0.5 shrink-0" width={16} height={16} /> : null}
        <div className="min-w-0 flex-1">
          {titre ? <p className="font-medium">{titre}</p> : null}
          <div className={titre ? "mt-1 opacity-90" : undefined}>{children}</div>
          {action ? <div className="mt-2.5">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function Vide({
  titre,
  children,
  action,
}: {
  titre: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="text-base font-medium">{titre}</p>
      {children ? <p className="max-w-sm text-sm text-texte-doux">{children}</p> : null}
      {action}
    </div>
  );
}

export function Chargement({ libelle = "Chargement…" }: { libelle?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-sm text-texte-doux">
      <span className="size-2 animate-pulse rounded-full bg-accent" />
      {libelle}
    </div>
  );
}

export function Champ({
  etiquette,
  aide,
  ...reste
}: React.InputHTMLAttributes<HTMLInputElement> & { etiquette: string; aide?: React.ReactNode }) {
  const id = useId();
  return (
    <div>
      <label className="etiquette" htmlFor={id}>
        {etiquette}
      </label>
      <input id={id} className="champ" {...reste} />
      {aide ? <p className="mt-1.5 text-xs text-texte-doux">{aide}</p> : null}
    </div>
  );
}

export function ZoneTexte({
  etiquette,
  aide,
  ...reste
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  etiquette: string;
  aide?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label className="etiquette" htmlFor={id}>
        {etiquette}
      </label>
      <textarea id={id} className="champ resize-y" {...reste} />
      {aide ? <p className="mt-1.5 text-xs text-texte-doux">{aide}</p> : null}
    </div>
  );
}

export function Selection({
  etiquette,
  aide,
  children,
  ...reste
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  etiquette: string;
  aide?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label className="etiquette" htmlFor={id}>
        {etiquette}
      </label>
      <select id={id} className="champ appearance-none" {...reste}>
        {children}
      </select>
      {aide ? <p className="mt-1.5 text-xs text-texte-doux">{aide}</p> : null}
    </div>
  );
}

export function Interrupteur({
  etiquette,
  aide,
  actif,
  surChangement,
}: {
  etiquette: string;
  aide?: React.ReactNode;
  actif: boolean;
  surChangement: (actif: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      onClick={() => surChangement(!actif)}
      className="flex w-full items-start gap-3 rounded-xl px-1 py-2 text-left"
    >
      <span
        className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
          actif ? "border-accent bg-accent/80" : "border-bord bg-fond-3"
        }`}
      >
        <span
          className={`ml-0.5 size-5 rounded-full bg-texte transition-transform ${
            actif ? "translate-x-5" : ""
          }`}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{etiquette}</span>
        {aide ? <span className="mt-0.5 block text-xs text-texte-doux">{aide}</span> : null}
      </span>
    </button>
  );
}

/** Feuille modale qui remonte du bas : geste attendu sur mobile. */
export function Feuille({
  ouverte,
  titre,
  surFermeture,
  children,
}: {
  ouverte: boolean;
  titre: string;
  surFermeture: () => void;
  children: React.ReactNode;
}) {
  const reference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouverte) return;
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === "Escape") surFermeture();
    };
    document.addEventListener("keydown", surTouche);
    const precedent = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    reference.current?.focus();
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = precedent;
    };
  }, [ouverte, surFermeture]);

  if (!ouverte) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
      <button
        type="button"
        className="flex-1"
        aria-label="Fermer"
        onClick={surFermeture}
      />
      <div
        ref={reference}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className="max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-bord bg-fond-2 pb-[calc(1.5rem+var(--marge-basse))] outline-none"
      >
        <div className="sticky top-0 flex items-center gap-3 border-b border-bord bg-fond-2 px-4 py-3">
          <h2 className="flex-1 text-base font-semibold">{titre}</h2>
          <button type="button" className="bouton bouton-fantome px-2 py-2" onClick={surFermeture}>
            <IconeFermer />
            <span className="sr-only">Fermer</span>
          </button>
        </div>
        <div className="px-4 pt-4">{children}</div>
      </div>
    </div>
  );
}

/** Confirmation explicite avant une action destructrice. */
export function useConfirmation() {
  const [demande, setDemande] = useState<{
    titre: string;
    texte: string;
    libelle: string;
    resoudre: (accepte: boolean) => void;
  } | null>(null);

  const confirmer = (titre: string, texte: string, libelle = "Supprimer") =>
    new Promise<boolean>((resoudre) => setDemande({ titre, texte, libelle, resoudre }));

  const repondre = (accepte: boolean) => {
    demande?.resoudre(accepte);
    setDemande(null);
  };

  const element = (
    <Feuille ouverte={demande !== null} titre={demande?.titre ?? ""} surFermeture={() => repondre(false)}>
      <p className="text-sm text-texte-doux">{demande?.texte}</p>
      <div className="mt-5 flex gap-2">
        <button type="button" className="bouton bouton-secondaire flex-1" onClick={() => repondre(false)}>
          Annuler
        </button>
        <button type="button" className="bouton bouton-danger flex-1" onClick={() => repondre(true)}>
          {demande?.libelle}
        </button>
      </div>
    </Feuille>
  );

  return { confirmer, element };
}

/** Message éphémère de confirmation, sans dépendance ni portail. */
export function useNotification() {
  const [message, setMessage] = useState<{ texte: string; ton: "info" | "erreur" } | null>(null);

  useEffect(() => {
    if (!message) return;
    const minuterie = setTimeout(() => setMessage(null), 3200);
    return () => clearTimeout(minuterie);
  }, [message]);

  const notifier = (texte: string, ton: "info" | "erreur" = "info") => setMessage({ texte, ton });

  const element = message ? (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+var(--marge-basse))] z-50 flex justify-center px-4"
    >
      <p
        className={`rounded-full border px-4 py-2 text-sm shadow-lg ${
          message.ton === "erreur"
            ? "border-erreur/40 bg-erreur/15 text-erreur"
            : "border-bord bg-fond-3 text-texte"
        }`}
      >
        {message.texte}
      </p>
    </div>
  ) : null;

  return { notifier, element };
}

/**
 * Lit une information qui n'existe que dans le navigateur (taille d'écran, mode
 * d'affichage, agent utilisateur) sans provoquer de désynchronisation avec le
 * HTML pré-rendu, et sans passer par un `setState` dans un effet.
 */
export function useValeurClient<T>(calcul: () => T, valeurServeur: T): T {
  const sabonner = useCallback(() => () => {}, []);
  return useSyncExternalStore(sabonner, calcul, () => valeurServeur);
}

export async function copierPressePapier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}

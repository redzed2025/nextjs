"use client";

import { useEffect, useRef, useState } from "react";
import { IconeArret, IconeEnvoyer, IconeFichier } from "@/components/icones";
import { Bandeau } from "@/components/ui";
import { formaterCout, formaterJetons } from "@/lib/format";
import { SUGGESTIONS } from "@/lib/generation/invites";
import type { EtatFlux } from "@/lib/generation/moteur";
import type { ErreurAtelier } from "@/lib/erreurs";
import type { MessageProjet } from "@/lib/types";
import { analyserReponse } from "@/lib/generation/analyse";

/** Fil de conversation, zone de saisie, et compteurs en temps réel. */
export function Discussion({
  messages,
  flux,
  erreur,
  enCours,
  peutGenerer,
  surEnvoi,
  surArret,
}: {
  messages: MessageProjet[];
  flux: EtatFlux | null;
  erreur: ErreurAtelier | null;
  enCours: boolean;
  peutGenerer: boolean;
  surEnvoi: (demande: string) => void;
  surArret: () => void;
}) {
  const [demande, setDemande] = useState("");
  const bas = useRef<HTMLDivElement>(null);
  const zone = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bas.current?.scrollIntoView({ block: "end" });
  }, [messages.length, flux?.texte, erreur]);

  useEffect(() => {
    const element = zone.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [demande]);

  const envoyer = () => {
    const texte = demande.trim();
    if (!texte || enCours || !peutGenerer) return;
    surEnvoi(texte);
    setDemande("");
  };

  const vide = messages.length === 0 && !flux;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {vide ? (
          <div className="space-y-3">
            <p className="text-sm text-texte-doux">
              Décrivez ce que vous voulez, en une phrase ou en dix. Plus vous êtes précis sur le
              contenu, les couleurs et les pages, plus le premier jet sera proche du but.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.titre}
                  type="button"
                  className="puce hover:border-accent hover:text-accent"
                  onClick={() => {
                    setDemande(suggestion.texte);
                    zone.current?.focus();
                  }}
                >
                  {suggestion.titre}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <MessageAffiche key={message.id} message={message} />
        ))}

        {flux ? <MessageEnCours flux={flux} /> : null}

        {erreur ? (
          <Bandeau ton="erreur" titre={erreur.message}>
            {erreur.conseil}
          </Bandeau>
        ) : null}

        <div ref={bas} />
      </div>

      <div className="border-t border-bord bg-fond px-3 pb-[calc(0.5rem+var(--marge-basse))] pt-2">
        {!peutGenerer ? (
          <p className="mb-2 text-xs text-alerte">
            Choisissez un fournisseur et un modèle pour ce projet avant de générer.
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            ref={zone}
            value={demande}
            onChange={(evenement) => setDemande(evenement.target.value)}
            onKeyDown={(evenement) => {
              if (evenement.key === "Enter" && (evenement.metaKey || evenement.ctrlKey)) {
                evenement.preventDefault();
                envoyer();
              }
            }}
            rows={1}
            placeholder={
              messages.length === 0
                ? "Un site vitrine pour ma boulangerie…"
                : "Que faut-il changer ?"
            }
            aria-label="Votre demande"
            className="champ max-h-44 flex-1 resize-none py-2.5"
          />
          {enCours ? (
            <button
              type="button"
              className="bouton bouton-secondaire px-3 py-2.5"
              onClick={surArret}
              aria-label="Arrêter la génération"
            >
              <IconeArret width={18} height={18} />
            </button>
          ) : (
            <button
              type="button"
              className="bouton bouton-principal px-3 py-2.5"
              onClick={envoyer}
              disabled={!demande.trim() || !peutGenerer}
              aria-label="Envoyer"
            >
              <IconeEnvoyer width={18} height={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageAffiche({ message }: { message: MessageProjet }) {
  if (message.role === "utilisateur") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent/15 px-3.5 py-2.5 text-sm">
          {message.contenu}
        </p>
      </div>
    );
  }

  const { fichiers, commentaire } = analyserReponse(message.contenu);

  return (
    <div className="space-y-2">
      {commentaire ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-texte-doux">{commentaire}</p>
      ) : null}

      {fichiers.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {fichiers.map((fichier) => (
            <li key={fichier.chemin} className="puce font-mono text-[11px]">
              <IconeFichier width={12} height={12} />
              {fichier.chemin}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-texte-doux/80">
        {message.version !== null ? <span>version {message.version}</span> : null}
        <span>
          {formaterJetons(message.tokensEntree)} entrée · {formaterJetons(message.tokensSortie)}{" "}
          sortie
        </span>
        <span>{formaterCout(message.cout)}</span>
        {message.incomplet ? <span className="text-alerte">réponse interrompue</span> : null}
      </p>
    </div>
  );
}

function MessageEnCours({ flux }: { flux: EtatFlux }) {
  const { commentaire } = analyserReponse(flux.texte);

  return (
    <div className="space-y-2">
      {flux.reflexion && !commentaire ? (
        <p className="whitespace-pre-wrap rounded-xl border border-bord bg-fond-2 px-3 py-2 text-xs italic leading-relaxed text-texte-doux">
          {flux.reflexion.slice(-600)}
        </p>
      ) : null}

      <p className="curseur-flux whitespace-pre-wrap text-sm leading-relaxed text-texte-doux">
        {commentaire}
      </p>

      {flux.fichiers.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {flux.fichiers.map((fichier) => (
            <li
              key={fichier.chemin}
              className={`puce font-mono text-[11px] ${
                fichier.incomplet ? "border-accent/50 text-accent" : "border-succes/40 text-succes"
              }`}
            >
              <IconeFichier width={12} height={12} />
              {fichier.chemin}
              {fichier.incomplet ? " · en cours" : ""}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-[11px] text-texte-doux/80">
        {formaterJetons(flux.tokensEntree)} entrée · {formaterJetons(flux.tokensSortie)} sortie ·{" "}
        {formaterCout(flux.cout)}
      </p>
    </div>
  );
}

import type { FichierProjet, MessageProjet, ModeleInfo, TypeCible } from "@/lib/types";
import { ErreurAtelier } from "@/lib/erreurs";
import type { Adaptateur, MessageChat } from "@/lib/fournisseurs";
import { estimerCout } from "@/lib/fournisseurs";
import { analyserReponse, type FichierAnalyse } from "./analyse";
import { carteProjet, choisirContexte } from "./contexte";
import { inviteSysteme } from "./invites";

/**
 * Moteur de génération : construit la requête, consomme le flux, tient les
 * compteurs à jour. Il ne touche pas au stockage — la persistance appartient à
 * la couche au-dessus, ce qui rend ce module testable et réutilisable.
 */

export interface EtatFlux {
  texte: string;
  reflexion: string;
  tokensEntree: number;
  tokensSortie: number;
  cout: number;
  fichiers: FichierAnalyse[];
}

export type MotifArret = "termine" | "annule" | "plafond" | "tronque";

export interface ResultatGeneration extends EtatFlux {
  motif: MotifArret;
  commentaire: string;
}

export interface ParametresGeneration {
  adaptateur: Adaptateur;
  modele: string;
  modeleInfo: ModeleInfo | null;
  cible: TypeCible;
  invitePersonnalisee?: string | null;
  demande: string;
  fichiers: FichierProjet[];
  historique: MessageProjet[];
  reflexion: boolean;
  maxJetons: number;
  /** Budget restant en dollars ; la génération s'arrête si l'estimation le dépasse. */
  plafondRestant?: number | null;
  signal?: AbortSignal;
  surProgres?: (etat: EtatFlux) => void;
}

/** Au-delà, l'historique gonfle le coût sans améliorer la réponse. */
const TOURS_HISTORIQUE = 8;

/**
 * Les réponses passées contenaient les fichiers entiers. Les renvoyer telles
 * quelles doublerait le contexte à chaque tour : on ne garde que l'explication
 * et la liste des fichiers écrits.
 */
function resumerReponse(contenu: string): string {
  const { fichiers, commentaire } = analyserReponse(contenu);
  if (fichiers.length === 0) return commentaire || contenu;
  const liste = fichiers.map((f) => `- ${f.chemin}`).join("\n");
  return `${commentaire}\n\n(Fichiers écrits lors de ce tour :\n${liste}\n)`.trim();
}

export function construireMessages(
  parametres: Pick<ParametresGeneration, "demande" | "fichiers" | "historique">,
): { messages: MessageChat[]; omis: string[] } {
  const { demande, fichiers, historique } = parametres;

  const messages: MessageChat[] = historique
    .slice(-TOURS_HISTORIQUE * 2)
    .filter((m) => m.contenu.trim().length > 0)
    .map((m) => ({
      role: m.role,
      contenu: m.role === "assistant" ? resumerReponse(m.contenu) : m.contenu,
    }));

  const selection = choisirContexte(fichiers, demande);

  const parties: string[] = [];
  if (fichiers.length > 0) {
    parties.push(`ÉTAT ACTUEL DU PROJET\n${carteProjet(fichiers)}`);
    if (selection.retenus.length > 0) {
      parties.push(
        "CONTENU DES FICHIERS CONCERNÉS\n" +
          selection.retenus
            .map((f) => `<<<fichier: ${f.chemin}>>>\n${f.contenu}\n<<<fin>>>`)
            .join("\n\n"),
      );
    }
    if (selection.omis.length > 0) {
      parties.push(
        "Le contenu des fichiers suivants n'est pas joint pour limiter le coût : " +
          selection.omis.map((f) => f.chemin).join(", ") +
          ". Demande-le si tu en as besoin, et ne les réécris pas à l'aveugle.",
      );
    }
  }
  parties.push(`DEMANDE\n${demande.trim()}`);

  messages.push({ role: "utilisateur", contenu: parties.join("\n\n") });
  return { messages, omis: selection.omis.map((f) => f.chemin) };
}

export async function genererProjet(
  parametres: ParametresGeneration,
): Promise<ResultatGeneration> {
  const {
    adaptateur,
    modele,
    modeleInfo,
    cible,
    invitePersonnalisee,
    reflexion,
    maxJetons,
    plafondRestant,
    signal,
    surProgres,
  } = parametres;

  const { messages } = construireMessages(parametres);
  const controleur = new AbortController();
  const relayerArret = () => controleur.abort();
  signal?.addEventListener("abort", relayerArret);

  const etat: EtatFlux = {
    texte: "",
    reflexion: "",
    tokensEntree: 0,
    tokensSortie: 0,
    cout: 0,
    fichiers: [],
  };
  let motif: MotifArret = "termine";
  let derniereAnalyse = 0;

  try {
    const flux = adaptateur.generer({
      modele,
      systeme: inviteSysteme(cible, invitePersonnalisee),
      messages,
      maxJetons,
      reflexion,
      signal: controleur.signal,
    });

    for await (const evenement of flux) {
      if (evenement.type === "texte") {
        etat.texte += evenement.delta;
        // Réanalyser à chaque fragment serait quadratique sur une longue
        // réponse : on le fait par paliers, ce qui suffit à l'affichage.
        if (etat.texte.length - derniereAnalyse > 400) {
          derniereAnalyse = etat.texte.length;
          etat.fichiers = analyserReponse(etat.texte).fichiers;
        }
      } else if (evenement.type === "reflexion") {
        etat.reflexion += evenement.delta;
      } else if (evenement.type === "usage") {
        etat.tokensEntree = evenement.entree;
        etat.tokensSortie = evenement.sortie;
        etat.cout = estimerCout(modeleInfo, evenement.entree, evenement.sortie);
      } else if (evenement.type === "fin") {
        if (evenement.raison === "length") motif = "tronque";
      }

      if (
        typeof plafondRestant === "number" &&
        plafondRestant >= 0 &&
        etat.cout > plafondRestant
      ) {
        motif = "plafond";
        controleur.abort();
        break;
      }

      surProgres?.({ ...etat });
    }
  } catch (cause) {
    if (motif === "plafond") {
      // L'annulation ci-dessus fait remonter une erreur d'abandon : c'est voulu.
    } else if (
      signal?.aborted ||
      (cause instanceof ErreurAtelier && cause.categorie === "annule")
    ) {
      motif = "annule";
    } else {
      throw cause;
    }
  } finally {
    signal?.removeEventListener("abort", relayerArret);
  }

  const analyse = analyserReponse(etat.texte);
  etat.fichiers = analyse.fichiers;
  if (motif === "termine" && analyse.fichiers.some((f) => f.incomplet)) motif = "tronque";

  // Le décompte de sortie peut manquer si le flux a été coupé avant l'usage final.
  if (etat.tokensSortie === 0 && etat.texte.length > 0) {
    etat.tokensSortie = Math.round(etat.texte.length / 4);
    etat.cout = estimerCout(modeleInfo, etat.tokensEntree, etat.tokensSortie);
  }

  return { ...etat, motif, commentaire: analyse.commentaire };
}

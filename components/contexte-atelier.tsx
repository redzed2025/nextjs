"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  creerProjet,
  dupliquerProjet,
  ecrireReglages,
  enregistrerFournisseur,
  identifiant,
  listerFournisseurs,
  listerProjets,
  lireReglages,
  majProjet,
  supprimerFournisseur,
  supprimerProjet,
} from "@/lib/depot";
import { messageLisible } from "@/lib/erreurs";
import { ecrireSecret, masquerCle, nouvelleReference } from "@/lib/trousseau";
import type { Fournisseur, ModeleInfo, Projet, Reglages, TypeApi, TypeCible } from "@/lib/types";
import { REGLAGES_PAR_DEFAUT } from "@/lib/types";

/**
 * État partagé de l'application.
 *
 * Tout vit dans le navigateur : le contexte charge une fois depuis IndexedDB,
 * puis les mutations écrivent et mettent l'état à jour. Il n'y a ni requête
 * serveur, ni cache à invalider.
 */

interface ValeurAtelier {
  pret: boolean;
  erreur: string | null;
  reglages: Reglages;
  fournisseurs: Fournisseur[];
  projets: Projet[];
  majReglages: (partiel: Partial<Reglages>) => Promise<void>;
  ajouterFournisseur: (donnees: {
    nom: string;
    presetId: string;
    baseUrl: string;
    typeApi: TypeApi;
    cle: string;
    modeles: ModeleInfo[] | null;
    modeleParDefaut: string | null;
  }) => Promise<Fournisseur>;
  majFournisseur: (fournisseur: Fournisseur) => Promise<void>;
  retirerFournisseur: (fournisseur: Fournisseur) => Promise<void>;
  ajouterProjet: (donnees: {
    nom: string;
    typeCible: TypeCible;
    fournisseurId: string | null;
    modele: string | null;
  }) => Promise<Projet>;
  enregistrerProjet: (projet: Projet) => Promise<Projet>;
  copierProjet: (projet: Projet) => Promise<Projet>;
  retirerProjet: (id: string) => Promise<void>;
  rechargerProjets: () => Promise<void>;
}

const Contexte = createContext<ValeurAtelier | null>(null);

export function FournisseurAtelier({ children }: { children: React.ReactNode }) {
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reglages, setReglages] = useState<Reglages>(REGLAGES_PAR_DEFAUT);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [projets, setProjets] = useState<Projet[]>([]);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const [r, f, p] = await Promise.all([lireReglages(), listerFournisseurs(), listerProjets()]);
        if (!vivant) return;
        setReglages(r);
        setFournisseurs(f);
        setProjets(p);
      } catch (cause) {
        if (vivant) setErreur(messageLisible(cause));
      } finally {
        if (vivant) setPret(true);
      }
    })();
    return () => {
      vivant = false;
    };
  }, []);

  const majReglages = useCallback(
    async (partiel: Partial<Reglages>) => {
      const suivant = { ...reglages, ...partiel };
      setReglages(suivant);
      await ecrireReglages(suivant);
    },
    [reglages],
  );

  const ajouterFournisseur = useCallback(
    async (donnees: Parameters<ValeurAtelier["ajouterFournisseur"]>[0]) => {
      const cleRef = nouvelleReference("fournisseur");
      // La clé part au trousseau chiffré ; seul le masque d'affichage est conservé
      // à côté du fournisseur.
      await ecrireSecret(cleRef, donnees.cle);

      const fournisseur: Fournisseur = {
        id: identifiant(),
        nom: donnees.nom,
        presetId: donnees.presetId,
        baseUrl: donnees.baseUrl,
        typeApi: donnees.typeApi,
        cleRef,
        masque: donnees.cle ? masquerCle(donnees.cle) : "sans clé",
        modeles: donnees.modeles,
        modelesMajLe: donnees.modeles ? Date.now() : null,
        modeleParDefaut: donnees.modeleParDefaut,
        creeLe: Date.now(),
      };
      await enregistrerFournisseur(fournisseur);
      setFournisseurs((liste) => [...liste, fournisseur]);
      return fournisseur;
    },
    [],
  );

  const majFournisseur = useCallback(async (fournisseur: Fournisseur) => {
    await enregistrerFournisseur(fournisseur);
    setFournisseurs((liste) => liste.map((f) => (f.id === fournisseur.id ? fournisseur : f)));
  }, []);

  const retirerFournisseur = useCallback(async (fournisseur: Fournisseur) => {
    await supprimerFournisseur(fournisseur);
    setFournisseurs((liste) => liste.filter((f) => f.id !== fournisseur.id));
  }, []);

  const ajouterProjet = useCallback(
    async (donnees: Parameters<ValeurAtelier["ajouterProjet"]>[0]) => {
      const projet = await creerProjet(donnees);
      setProjets((liste) => [projet, ...liste]);
      return projet;
    },
    [],
  );

  const enregistrerProjet = useCallback(async (projet: Projet) => {
    const suivant = await majProjet(projet);
    setProjets((liste) =>
      [...liste.map((p) => (p.id === suivant.id ? suivant : p))].sort(
        (a, b) => b.modifieLe - a.modifieLe,
      ),
    );
    return suivant;
  }, []);

  const copierProjet = useCallback(async (projet: Projet) => {
    const copie = await dupliquerProjet(projet);
    setProjets((liste) => [copie, ...liste]);
    return copie;
  }, []);

  const retirerProjet = useCallback(async (id: string) => {
    await supprimerProjet(id);
    setProjets((liste) => liste.filter((p) => p.id !== id));
  }, []);

  const rechargerProjets = useCallback(async () => {
    setProjets(await listerProjets());
  }, []);

  const valeur = useMemo<ValeurAtelier>(
    () => ({
      pret,
      erreur,
      reglages,
      fournisseurs,
      projets,
      majReglages,
      ajouterFournisseur,
      majFournisseur,
      retirerFournisseur,
      ajouterProjet,
      enregistrerProjet,
      copierProjet,
      retirerProjet,
      rechargerProjets,
    }),
    [
      pret,
      erreur,
      reglages,
      fournisseurs,
      projets,
      majReglages,
      ajouterFournisseur,
      majFournisseur,
      retirerFournisseur,
      ajouterProjet,
      enregistrerProjet,
      copierProjet,
      retirerProjet,
      rechargerProjets,
    ],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useAtelier(): ValeurAtelier {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error("useAtelier doit être utilisé dans FournisseurAtelier.");
  return valeur;
}

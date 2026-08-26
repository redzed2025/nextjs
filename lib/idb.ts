/**
 * Couche de persistance : IndexedDB.
 *
 * Le PRD prévoit SQLite côté Expo. En PWA l'équivalent disponible est
 * IndexedDB : même modèle relationnel (les magasins reprennent les tables du
 * PRD), mêmes index, et un fonctionnement entièrement hors ligne.
 */

const NOM_BASE = "atelier";
const VERSION_BASE = 1;

export const MAGASINS = {
  fournisseurs: "fournisseurs",
  projets: "projets",
  fichiers: "fichiers",
  messages: "messages",
  versions: "versions",
  deploiements: "deploiements",
  reglages: "reglages",
} as const;

export type NomMagasin = (typeof MAGASINS)[keyof typeof MAGASINS];

let promesseBase: Promise<IDBDatabase> | null = null;

function requete<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    r.onsuccess = () => resoudre(r.result);
    r.onerror = () => rejeter(r.error);
  });
}

export function ouvrirBase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB n'est pas disponible dans ce navigateur."));
  }
  if (promesseBase) return promesseBase;

  promesseBase = new Promise((resoudre, rejeter) => {
    const ouverture = indexedDB.open(NOM_BASE, VERSION_BASE);

    ouverture.onupgradeneeded = () => {
      const base = ouverture.result;

      if (!base.objectStoreNames.contains(MAGASINS.fournisseurs)) {
        base.createObjectStore(MAGASINS.fournisseurs, { keyPath: "id" });
      }
      if (!base.objectStoreNames.contains(MAGASINS.projets)) {
        base.createObjectStore(MAGASINS.projets, { keyPath: "id" });
      }
      if (!base.objectStoreNames.contains(MAGASINS.fichiers)) {
        const m = base.createObjectStore(MAGASINS.fichiers, { keyPath: "id" });
        m.createIndex("projet", "projetId");
        m.createIndex("projet-version", ["projetId", "version"]);
      }
      if (!base.objectStoreNames.contains(MAGASINS.messages)) {
        const m = base.createObjectStore(MAGASINS.messages, { keyPath: "id" });
        m.createIndex("projet", "projetId");
        m.createIndex("date", "creeLe");
      }
      if (!base.objectStoreNames.contains(MAGASINS.versions)) {
        const m = base.createObjectStore(MAGASINS.versions, { keyPath: "id" });
        m.createIndex("projet", "projetId");
      }
      if (!base.objectStoreNames.contains(MAGASINS.deploiements)) {
        const m = base.createObjectStore(MAGASINS.deploiements, { keyPath: "id" });
        m.createIndex("projet", "projetId");
      }
      if (!base.objectStoreNames.contains(MAGASINS.reglages)) {
        base.createObjectStore(MAGASINS.reglages);
      }
    };

    ouverture.onsuccess = () => resoudre(ouverture.result);
    ouverture.onerror = () => rejeter(ouverture.error);
    ouverture.onblocked = () =>
      rejeter(new Error("Une autre fenêtre d'Atelier bloque la mise à jour de la base."));
  });

  return promesseBase;
}

async function transaction<T>(
  magasins: NomMagasin | NomMagasin[],
  mode: IDBTransactionMode,
  travail: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const base = await ouvrirBase();
  const tx = base.transaction(magasins, mode);
  const resultat = await travail(tx);
  await new Promise<void>((resoudre, rejeter) => {
    tx.oncomplete = () => resoudre();
    tx.onerror = () => rejeter(tx.error);
    tx.onabort = () => rejeter(tx.error ?? new Error("Transaction annulée."));
  });
  return resultat;
}

export async function lireTout<T>(magasin: NomMagasin): Promise<T[]> {
  return transaction(magasin, "readonly", (tx) =>
    requete<T[]>(tx.objectStore(magasin).getAll() as IDBRequest<T[]>),
  );
}

export async function lire<T>(magasin: NomMagasin, cle: IDBValidKey): Promise<T | undefined> {
  return transaction(magasin, "readonly", (tx) =>
    requete<T | undefined>(tx.objectStore(magasin).get(cle) as IDBRequest<T | undefined>),
  );
}

export async function lireParIndex<T>(
  magasin: NomMagasin,
  index: string,
  valeur: IDBValidKey | IDBKeyRange,
): Promise<T[]> {
  return transaction(magasin, "readonly", (tx) =>
    requete<T[]>(tx.objectStore(magasin).index(index).getAll(valeur) as IDBRequest<T[]>),
  );
}

export async function ecrire<T>(magasin: NomMagasin, valeur: T, cle?: IDBValidKey): Promise<void> {
  await transaction(magasin, "readwrite", (tx) => {
    tx.objectStore(magasin).put(valeur, cle);
  });
}

export async function ecrireLot<T>(magasin: NomMagasin, valeurs: T[]): Promise<void> {
  if (valeurs.length === 0) return;
  await transaction(magasin, "readwrite", (tx) => {
    const m = tx.objectStore(magasin);
    for (const valeur of valeurs) m.put(valeur);
  });
}

export async function supprimer(magasin: NomMagasin, cle: IDBValidKey): Promise<void> {
  await transaction(magasin, "readwrite", (tx) => {
    tx.objectStore(magasin).delete(cle);
  });
}

/** Supprime toutes les entrées d'un magasin rattachées à un projet. */
export async function supprimerParIndex(
  magasin: NomMagasin,
  index: string,
  valeur: IDBValidKey,
): Promise<void> {
  await transaction(magasin, "readwrite", (tx) => {
    const curseur = tx.objectStore(magasin).index(index).openCursor(valeur);
    curseur.onsuccess = () => {
      const c = curseur.result;
      if (!c) return;
      c.delete();
      c.continue();
    };
  });
}

/** Écrit dans plusieurs magasins en une seule transaction. */
export async function ecrireMulti(
  operations: Array<{ magasin: NomMagasin; valeurs: unknown[] }>,
): Promise<void> {
  const magasins = [...new Set(operations.map((o) => o.magasin))];
  if (magasins.length === 0) return;
  await transaction(magasins, "readwrite", (tx) => {
    for (const operation of operations) {
      const m = tx.objectStore(operation.magasin);
      for (const valeur of operation.valeurs) m.put(valeur);
    }
  });
}

export function identifiant(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

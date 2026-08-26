/**
 * Trousseau : stockage des clés API et des jetons de déploiement.
 *
 * Le PRD spécifie `expo-secure-store`, adossé au Keychain iOS et au Keystore
 * Android. Une PWA n'a pas accès à ces coffres matériels ; l'équivalent le plus
 * proche que le web garantisse est retenu ici :
 *
 *   - un secret n'est jamais écrit en clair : il est chiffré en AES-GCM 256 ;
 *   - la clé de chiffrement est générée par WebCrypto en **non exportable**
 *     (`extractable: false`) et stockée telle quelle dans IndexedDB. Le
 *     navigateur ne permet à personne — pas même à cette application — de la
 *     relire : elle ne peut que servir à chiffrer et déchiffrer ;
 *   - le chiffré et la clé vivent dans une base séparée, effaçable d'un bloc.
 *
 * Limite à connaître, et affichée à l'utilisateur dans les réglages : ce
 * dispositif protège les secrets au repos (sauvegarde du profil, inspection du
 * disque, extension lisant le stockage) mais pas contre l'exécution de code
 * hostile dans l'origine de l'application. C'est plus faible qu'un Keychain
 * matériel, et c'est la raison pour laquelle un plafond de dépense est proposé
 * pour chaque projet.
 *
 * Règle de code : aucune valeur renvoyée par `lireSecret` ne doit être
 * journalisée, sérialisée dans un état persistant ou incluse dans un rapport
 * d'erreur. Voir `lib/erreurs.ts`, qui nettoie les messages sortants.
 */

const NOM_BASE = "atelier-trousseau";
const MAGASIN_SECRETS = "secrets";
const MAGASIN_CLE = "cle";
const CLE_MAITRESSE = "maitresse";

interface SecretChiffre {
  ref: string;
  iv: ArrayBuffer;
  donnees: ArrayBuffer;
}

let promesseBase: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Le stockage sécurisé n'est pas disponible ici."));
  }
  if (promesseBase) return promesseBase;
  promesseBase = new Promise((resoudre, rejeter) => {
    const ouverture = indexedDB.open(NOM_BASE, 1);
    ouverture.onupgradeneeded = () => {
      const base = ouverture.result;
      if (!base.objectStoreNames.contains(MAGASIN_SECRETS)) {
        base.createObjectStore(MAGASIN_SECRETS, { keyPath: "ref" });
      }
      if (!base.objectStoreNames.contains(MAGASIN_CLE)) {
        base.createObjectStore(MAGASIN_CLE);
      }
    };
    ouverture.onsuccess = () => resoudre(ouverture.result);
    ouverture.onerror = () => rejeter(ouverture.error);
  });
  return promesseBase;
}

function attendre<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    r.onsuccess = () => resoudre(r.result);
    r.onerror = () => rejeter(r.error);
  });
}

function verifierCrypto(): SubtleCrypto {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error(
      "Le chiffrement du navigateur est indisponible. Atelier doit être ouvert en HTTPS " +
        "(ou sur localhost) pour stocker vos clés.",
    );
  }
  return crypto.subtle;
}

async function cleMaitresse(): Promise<CryptoKey> {
  const subtle = verifierCrypto();
  const base = await ouvrir();

  const existante = await attendre<CryptoKey | undefined>(
    base.transaction(MAGASIN_CLE, "readonly").objectStore(MAGASIN_CLE).get(CLE_MAITRESSE),
  );
  if (existante) return existante;

  const nouvelle = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);

  const tx = base.transaction(MAGASIN_CLE, "readwrite");
  tx.objectStore(MAGASIN_CLE).put(nouvelle, CLE_MAITRESSE);
  await new Promise<void>((resoudre, rejeter) => {
    tx.oncomplete = () => resoudre();
    tx.onerror = () => rejeter(tx.error);
  });
  return nouvelle;
}

/** Crée une référence opaque : c'est elle, et non le secret, qui est stockée avec le fournisseur. */
export function nouvelleReference(prefixe: string): string {
  const aleatoire =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefixe}:${aleatoire}`;
}

export async function ecrireSecret(ref: string, valeur: string): Promise<void> {
  const subtle = verifierCrypto();
  const cle = await cleMaitresse();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const donnees = await subtle.encrypt(
    { name: "AES-GCM", iv },
    cle,
    new TextEncoder().encode(valeur),
  );

  const base = await ouvrir();
  const tx = base.transaction(MAGASIN_SECRETS, "readwrite");
  const enregistrement: SecretChiffre = {
    ref,
    iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer,
    donnees,
  };
  tx.objectStore(MAGASIN_SECRETS).put(enregistrement);
  await new Promise<void>((resoudre, rejeter) => {
    tx.oncomplete = () => resoudre();
    tx.onerror = () => rejeter(tx.error);
  });
}

export async function lireSecret(ref: string): Promise<string | null> {
  const subtle = verifierCrypto();
  const base = await ouvrir();
  const enregistrement = await attendre<SecretChiffre | undefined>(
    base.transaction(MAGASIN_SECRETS, "readonly").objectStore(MAGASIN_SECRETS).get(ref),
  );
  if (!enregistrement) return null;

  try {
    const cle = await cleMaitresse();
    const clair = await subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(enregistrement.iv) },
      cle,
      enregistrement.donnees,
    );
    return new TextDecoder().decode(clair);
  } catch {
    // Clé maîtresse perdue ou remplacée : le secret est irrécupérable.
    return null;
  }
}

export async function supprimerSecret(ref: string): Promise<void> {
  const base = await ouvrir();
  const tx = base.transaction(MAGASIN_SECRETS, "readwrite");
  tx.objectStore(MAGASIN_SECRETS).delete(ref);
  await new Promise<void>((resoudre, rejeter) => {
    tx.oncomplete = () => resoudre();
    tx.onerror = () => rejeter(tx.error);
  });
}

/** Efface l'intégralité du trousseau : secrets et clé maîtresse. */
export async function viderTrousseau(): Promise<void> {
  const base = await ouvrir();
  const tx = base.transaction([MAGASIN_SECRETS, MAGASIN_CLE], "readwrite");
  tx.objectStore(MAGASIN_SECRETS).clear();
  tx.objectStore(MAGASIN_CLE).clear();
  await new Promise<void>((resoudre, rejeter) => {
    tx.oncomplete = () => resoudre();
    tx.onerror = () => rejeter(tx.error);
  });
}

/**
 * Masque d'affichage : 4 premiers et 4 derniers caractères, comme le prévoit
 * le PRD. C'est la seule forme d'une clé qui apparaît dans l'interface.
 */
export function masquerCle(cle: string): string {
  const nettoyee = cle.trim();
  if (nettoyee.length <= 8) return "•".repeat(Math.max(nettoyee.length, 4));
  return `${nettoyee.slice(0, 4)}••••${nettoyee.slice(-4)}`;
}

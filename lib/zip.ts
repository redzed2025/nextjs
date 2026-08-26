/**
 * Écriture d'archives ZIP dans le navigateur, sans dépendance.
 *
 * Atelier n'embarque aucune bibliothèque pour cela : un ZIP est une suite
 * d'en-têtes bien décrits, et la compression est fournie par le navigateur via
 * `CompressionStream('deflate-raw')`. Sur un moteur qui ne l'expose pas, les
 * fichiers sont simplement stockés sans compression — l'archive reste valide.
 */

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let valeur = i;
    for (let bit = 0; bit < 8; bit++) {
      valeur = valeur & 1 ? 0xedb88320 ^ (valeur >>> 1) : valeur >>> 1;
    }
    table[i] = valeur >>> 0;
  }
  return table;
})();

function crc32(donnees: Uint8Array): number {
  let reste = 0xffffffff;
  for (let i = 0; i < donnees.length; i++) {
    reste = TABLE_CRC[(reste ^ donnees[i]) & 0xff] ^ (reste >>> 8);
  }
  return (reste ^ 0xffffffff) >>> 0;
}

async function compresser(donnees: Uint8Array): Promise<{ octets: Uint8Array; methode: number }> {
  if (typeof CompressionStream === "undefined" || donnees.length === 0) {
    return { octets: donnees, methode: 0 };
  }
  try {
    const flux = new Blob([donnees as BlobPart]).stream().pipeThrough(
      new CompressionStream("deflate-raw"),
    );
    const compresse = new Uint8Array(await new Response(flux).arrayBuffer());
    // Un contenu déjà compact peut grossir : on garde alors la version brute.
    return compresse.length < donnees.length
      ? { octets: compresse, methode: 8 }
      : { octets: donnees, methode: 0 };
  } catch {
    return { octets: donnees, methode: 0 };
  }
}

/** Date et heure au format MS-DOS attendu par le format ZIP. */
function horodatageDos(date: Date): { heure: number; date: number } {
  return {
    heure:
      (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export interface EntreeZip {
  chemin: string;
  contenu: string;
}

export async function construireZip(entrees: EntreeZip[]): Promise<Blob> {
  const encodeur = new TextEncoder();
  const morceaux: BlobPart[] = [];
  const annuaire: BlobPart[] = [];
  const { heure, date } = horodatageDos(new Date());

  let decalage = 0;

  for (const entree of entrees) {
    const nom = encodeur.encode(entree.chemin);
    const brut = encodeur.encode(entree.contenu);
    const somme = crc32(brut);
    const { octets, methode } = await compresser(brut);

    const enteteLocal = new DataView(new ArrayBuffer(30));
    enteteLocal.setUint32(0, 0x04034b50, true); // signature
    enteteLocal.setUint16(4, 20, true); // version minimale
    enteteLocal.setUint16(6, 0x0800, true); // drapeau : nom de fichier en UTF-8
    enteteLocal.setUint16(8, methode, true);
    enteteLocal.setUint16(10, heure, true);
    enteteLocal.setUint16(12, date, true);
    enteteLocal.setUint32(14, somme, true);
    enteteLocal.setUint32(18, octets.length, true);
    enteteLocal.setUint32(22, brut.length, true);
    enteteLocal.setUint16(26, nom.length, true);
    enteteLocal.setUint16(28, 0, true); // pas de champ supplémentaire

    morceaux.push(enteteLocal.buffer as ArrayBuffer, nom as BlobPart, octets as BlobPart);

    const enteteCentral = new DataView(new ArrayBuffer(46));
    enteteCentral.setUint32(0, 0x02014b50, true);
    enteteCentral.setUint16(4, 20, true); // version d'écriture
    enteteCentral.setUint16(6, 20, true);
    enteteCentral.setUint16(8, 0x0800, true);
    enteteCentral.setUint16(10, methode, true);
    enteteCentral.setUint16(12, heure, true);
    enteteCentral.setUint16(14, date, true);
    enteteCentral.setUint32(16, somme, true);
    enteteCentral.setUint32(20, octets.length, true);
    enteteCentral.setUint32(24, brut.length, true);
    enteteCentral.setUint16(28, nom.length, true);
    enteteCentral.setUint16(30, 0, true);
    enteteCentral.setUint16(32, 0, true);
    enteteCentral.setUint16(34, 0, true);
    enteteCentral.setUint16(36, 0, true);
    enteteCentral.setUint32(38, 0, true);
    enteteCentral.setUint32(42, decalage, true);

    annuaire.push(enteteCentral.buffer as ArrayBuffer, nom as BlobPart);
    decalage += 30 + nom.length + octets.length;
  }

  const tailleAnnuaire = annuaire.reduce(
    (somme, partie) => somme + (partie as ArrayBuffer | Uint8Array).byteLength,
    0,
  );

  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(4, 0, true);
  fin.setUint16(6, 0, true);
  fin.setUint16(8, entrees.length, true);
  fin.setUint16(10, entrees.length, true);
  fin.setUint32(12, tailleAnnuaire, true);
  fin.setUint32(16, decalage, true);
  fin.setUint16(20, 0, true);

  return new Blob([...morceaux, ...annuaire, fin.buffer as ArrayBuffer], {
    type: "application/zip",
  });
}

/** Nom de fichier sûr, dérivé du nom du projet. */
export function nomArchive(nomProjet: string): string {
  const base =
    nomProjet
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "projet";
  return `${base}.zip`;
}

/**
 * Propose l'archive à l'utilisateur : feuille de partage native quand elle est
 * disponible (le PRD la demande), téléchargement classique sinon.
 */
export async function partagerArchive(archive: Blob, nom: string, titre: string): Promise<"partage" | "telechargement"> {
  const fichier = new File([archive], nom, { type: "application/zip" });
  const partage = navigator.share as ((donnees: ShareData) => Promise<void>) | undefined;
  const peutPartager = navigator.canShare?.({ files: [fichier] }) ?? false;

  if (partage && peutPartager) {
    try {
      await navigator.share({ files: [fichier], title: titre });
      return "partage";
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return "partage";
    }
  }

  const url = URL.createObjectURL(archive);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "telechargement";
}

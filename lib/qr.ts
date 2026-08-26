/**
 * Générateur de QR code (mode octet, correction niveau M, versions 1 à 10).
 *
 * Le PRD demande un QR code pour ouvrir sur un autre appareil l'URL d'un site
 * publié. Une URL de déploiement tient largement dans les 213 octets d'une
 * version 10, et coder cela ici évite d'embarquer une bibliothèque dans une
 * application qui se veut légère sur un réseau mobile.
 *
 * Conformité vérifiée dans `qr.test.ts`, qui compare chaque matrice produite à
 * celle d'une implémentation de référence utilisée uniquement en test.
 */

const NIVEAU_M = 0b00;

interface Bloc {
  /** Codets de correction par bloc. */
  correction: number;
  /** [nombre de blocs, codets de données par bloc] pour chaque groupe. */
  groupes: Array<[number, number]>;
}

const BLOCS_M: Record<number, Bloc> = {
  1: { correction: 10, groupes: [[1, 16]] },
  2: { correction: 16, groupes: [[1, 28]] },
  3: { correction: 26, groupes: [[1, 44]] },
  4: { correction: 18, groupes: [[2, 32]] },
  5: { correction: 24, groupes: [[2, 43]] },
  6: { correction: 16, groupes: [[4, 27]] },
  7: { correction: 18, groupes: [[4, 31]] },
  8: { correction: 22, groupes: [[2, 38], [2, 39]] },
  9: { correction: 22, groupes: [[3, 36], [2, 37]] },
  10: { correction: 26, groupes: [[4, 43], [1, 44]] },
};

/** Capacité en octets du mode octet, niveau M. */
const CAPACITES_M: Record<number, number> = {
  1: 14, 2: 26, 3: 42, 4: 62, 5: 84, 6: 106, 7: 122, 8: 152, 9: 180, 10: 213,
};

const ALIGNEMENTS: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/* ------------------------------------------------- corps de Galois GF(256) */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let valeur = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = valeur;
    LOG[valeur] = i;
    valeur <<= 1;
    if (valeur & 0x100) valeur ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function multiplier(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** Polynôme générateur de Reed-Solomon pour `degre` codets de correction. */
function polynomeGenerateur(degre: number): Uint8Array {
  let polynome = new Uint8Array([1]);
  for (let i = 0; i < degre; i++) {
    const suivant = new Uint8Array(polynome.length + 1);
    for (let j = 0; j < polynome.length; j++) {
      suivant[j] ^= polynome[j];
      suivant[j + 1] ^= multiplier(polynome[j], EXP[i]);
    }
    polynome = suivant;
  }
  return polynome;
}

function correction(donnees: Uint8Array, nombre: number): Uint8Array {
  const generateur = polynomeGenerateur(nombre);
  const reste = new Uint8Array(donnees.length + nombre);
  reste.set(donnees);
  for (let i = 0; i < donnees.length; i++) {
    const facteur = reste[i];
    if (facteur === 0) continue;
    for (let j = 0; j < generateur.length; j++) {
      reste[i + j] ^= multiplier(generateur[j], facteur);
    }
  }
  return reste.slice(donnees.length);
}

/* ------------------------------------------------------ flux binaire source */

class FluxBits {
  private readonly bits: number[] = [];

  ecrire(valeur: number, longueur: number): void {
    for (let i = longueur - 1; i >= 0; i--) this.bits.push((valeur >>> i) & 1);
  }

  get longueur(): number {
    return this.bits.length;
  }

  versOctets(taille: number): Uint8Array {
    const octets = new Uint8Array(taille);
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i]) octets[i >> 3] |= 0x80 >> (i & 7);
    }
    return octets;
  }
}

function choisirVersion(longueur: number): number {
  for (let version = 1; version <= 10; version++) {
    if (longueur <= CAPACITES_M[version]) return version;
  }
  throw new Error("Texte trop long pour un QR code de version 10.");
}

function codetsDonnees(donnees: Uint8Array, version: number): Uint8Array {
  const bloc = BLOCS_M[version];
  const total = bloc.groupes.reduce((somme, [n, taille]) => somme + n * taille, 0);

  const flux = new FluxBits();
  flux.ecrire(0b0100, 4); // mode octet
  flux.ecrire(donnees.length, version >= 10 ? 16 : 8);
  for (const octet of donnees) flux.ecrire(octet, 8);

  const capaciteBits = total * 8;
  flux.ecrire(0, Math.min(4, capaciteBits - flux.longueur)); // terminateur
  if (flux.longueur % 8 !== 0) flux.ecrire(0, 8 - (flux.longueur % 8));

  const octets = flux.versOctets(total);
  const remplissage = [0xec, 0x11];
  for (let i = Math.ceil(flux.longueur / 8), n = 0; i < total; i++, n++) {
    octets[i] = remplissage[n % 2];
  }
  return octets;
}

/** Découpe en blocs, calcule la correction, puis entrelace comme l'exige la norme. */
function entrelacer(octets: Uint8Array, version: number): Uint8Array {
  const bloc = BLOCS_M[version];
  const blocsDonnees: Uint8Array[] = [];
  const blocsCorrection: Uint8Array[] = [];

  let position = 0;
  for (const [nombre, taille] of bloc.groupes) {
    for (let i = 0; i < nombre; i++) {
      const morceau = octets.slice(position, position + taille);
      position += taille;
      blocsDonnees.push(morceau);
      blocsCorrection.push(correction(morceau, bloc.correction));
    }
  }

  const sortie: number[] = [];
  const maxDonnees = Math.max(...blocsDonnees.map((b) => b.length));
  for (let i = 0; i < maxDonnees; i++) {
    for (const b of blocsDonnees) if (i < b.length) sortie.push(b[i]);
  }
  for (let i = 0; i < bloc.correction; i++) {
    for (const b of blocsCorrection) sortie.push(b[i]);
  }
  return Uint8Array.from(sortie);
}

/* ------------------------------------------------------------ matrice */

type Matrice = Int8Array[]; // -1 : libre, 0 : clair, 1 : sombre

function matriceVide(taille: number): Matrice {
  return Array.from({ length: taille }, () => new Int8Array(taille).fill(-1));
}

function poserMotifFixe(matrice: Matrice, version: number): void {
  const taille = matrice.length;

  const poserRepere = (ligne: number, colonne: number) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const y = ligne + dy;
        const x = colonne + dx;
        if (y < 0 || y >= taille || x < 0 || x >= taille) continue;
        // La couronne dy/dx hors de 0..6 est le séparateur : toujours clair.
        if (dy < 0 || dy > 6 || dx < 0 || dx > 6) {
          matrice[y][x] = 0;
          continue;
        }
        const bord = dy === 0 || dy === 6 || dx === 0 || dx === 6;
        const centre = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
        matrice[y][x] = bord || centre ? 1 : 0;
      }
    }
  };

  poserRepere(0, 0);
  poserRepere(0, taille - 7);
  poserRepere(taille - 7, 0);

  for (let i = 8; i < taille - 8; i++) {
    const valeur = i % 2 === 0 ? 1 : 0;
    matrice[6][i] = valeur;
    matrice[i][6] = valeur;
  }

  const centres = ALIGNEMENTS[version];
  const dernier = taille - 7;
  for (const ligne of centres) {
    for (const colonne of centres) {
      // Les trois centres qui tomberaient sur un repère d'angle sont omis ;
      // les autres sont tracés, y compris sur les bandes de synchronisation.
      const surRepere =
        (ligne === 6 && colonne === 6) ||
        (ligne === 6 && colonne === dernier) ||
        (ligne === dernier && colonne === 6);
      if (surRepere) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const bord = Math.max(Math.abs(dy), Math.abs(dx));
          matrice[ligne + dy][colonne + dx] = bord === 1 ? 0 : 1;
        }
      }
    }
  }

  matrice[taille - 8][8] = 1; // module sombre imposé

  // Zones réservées au format ; la valeur définitive est écrite plus tard.
  for (let i = 0; i < 9; i++) {
    if (matrice[8][i] === -1) matrice[8][i] = 0;
    if (matrice[i][8] === -1) matrice[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (matrice[8][taille - 1 - i] === -1) matrice[8][taille - 1 - i] = 0;
    if (matrice[taille - 1 - i][8] === -1) matrice[taille - 1 - i][8] = 0;
  }

  if (version >= 7) {
    const bits = infoVersion(version);
    for (let i = 0; i < 18; i++) {
      const bit = (bits >> i) & 1;
      const ligne = Math.floor(i / 3);
      const colonne = taille - 11 + (i % 3);
      matrice[ligne][colonne] = bit;
      matrice[colonne][ligne] = bit;
    }
  }
}

function infoVersion(version: number): number {
  let reste = version << 12;
  for (let i = 0; i < 12; i++) {
    if ((reste >> (17 - i)) & 1) reste ^= 0x1f25 << (5 - i);
  }
  return (version << 12) | reste;
}

function infoFormat(masque: number): number {
  const donnees = (NIVEAU_M << 3) | masque;
  let reste = donnees << 10;
  for (let i = 0; i < 5; i++) {
    if ((reste >> (14 - i)) & 1) reste ^= 0x537 << (4 - i);
  }
  return ((donnees << 10) | reste) ^ 0x5412;
}

function estReserve(matrice: Matrice, ligne: number, colonne: number, version: number): boolean {
  const taille = matrice.length;
  if (ligne === 6 || colonne === 6) return true; // bandes de synchronisation
  if (ligne < 9 && colonne < 9) return true;
  if (ligne < 9 && colonne >= taille - 8) return true;
  if (ligne >= taille - 8 && colonne < 9) return true;
  if (version >= 7 && ligne < 6 && colonne >= taille - 11) return true;
  if (version >= 7 && colonne < 6 && ligne >= taille - 11) return true;
  for (const centreLigne of ALIGNEMENTS[version]) {
    for (const centreColonne of ALIGNEMENTS[version]) {
      if (centreLigne <= 8 && centreColonne <= 8) continue;
      if (centreLigne <= 8 && centreColonne >= taille - 9) continue;
      if (centreLigne >= taille - 9 && centreColonne <= 8) continue;
      if (
        Math.abs(ligne - centreLigne) <= 2 &&
        Math.abs(colonne - centreColonne) <= 2
      ) {
        return true;
      }
    }
  }
  return false;
}

function poserDonnees(matrice: Matrice, octets: Uint8Array, version: number): void {
  const taille = matrice.length;
  let bit = 0;
  let montant = true;

  for (let colonne = taille - 1; colonne > 0; colonne -= 2) {
    if (colonne === 6) colonne--; // la colonne 6 est une bande de synchronisation
    for (let pas = 0; pas < taille; pas++) {
      const ligne = montant ? taille - 1 - pas : pas;
      for (const decalage of [0, 1]) {
        const x = colonne - decalage;
        if (estReserve(matrice, ligne, x, version)) continue;
        const valeur =
          bit < octets.length * 8 ? (octets[bit >> 3] >> (7 - (bit & 7))) & 1 : 0;
        matrice[ligne][x] = valeur;
        bit++;
      }
    }
    montant = !montant;
  }
}

const MASQUES: Array<(ligne: number, colonne: number) => boolean> = [
  (l, c) => (l + c) % 2 === 0,
  (l) => l % 2 === 0,
  (_l, c) => c % 3 === 0,
  (l, c) => (l + c) % 3 === 0,
  (l, c) => (Math.floor(l / 2) + Math.floor(c / 3)) % 2 === 0,
  (l, c) => ((l * c) % 2) + ((l * c) % 3) === 0,
  (l, c) => (((l * c) % 2) + ((l * c) % 3)) % 2 === 0,
  (l, c) => (((l + c) % 2) + ((l * c) % 3)) % 2 === 0,
];

function penalite(matrice: Matrice): number {
  const taille = matrice.length;
  let total = 0;

  // Règle 1 : suites de cinq modules ou plus de même teinte.
  for (let i = 0; i < taille; i++) {
    for (const parLigne of [true, false]) {
      let precedent = -1;
      let suite = 0;
      for (let j = 0; j < taille; j++) {
        const valeur = parLigne ? matrice[i][j] : matrice[j][i];
        if (valeur === precedent) {
          suite++;
          if (suite === 5) total += 3;
          else if (suite > 5) total += 1;
        } else {
          precedent = valeur;
          suite = 1;
        }
      }
    }
  }

  // Règle 2 : blocs 2×2 uniformes.
  for (let ligne = 0; ligne < taille - 1; ligne++) {
    for (let colonne = 0; colonne < taille - 1; colonne++) {
      const v = matrice[ligne][colonne];
      if (
        v === matrice[ligne][colonne + 1] &&
        v === matrice[ligne + 1][colonne] &&
        v === matrice[ligne + 1][colonne + 1]
      ) {
        total += 3;
      }
    }
  }

  // Règle 3 : motif ressemblant à un repère de position.
  const motifs = [
    [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1],
  ];
  for (let i = 0; i < taille; i++) {
    for (let j = 0; j <= taille - 11; j++) {
      for (const motif of motifs) {
        let ligneOk = true;
        let colonneOk = true;
        for (let k = 0; k < 11; k++) {
          if (matrice[i][j + k] !== motif[k]) ligneOk = false;
          if (matrice[j + k][i] !== motif[k]) colonneOk = false;
        }
        if (ligneOk) total += 40;
        if (colonneOk) total += 40;
      }
    }
  }

  // Règle 4 : écart à un équilibre de 50 % entre modules sombres et clairs.
  let sombres = 0;
  for (const ligne of matrice) for (const valeur of ligne) if (valeur === 1) sombres++;
  const pourcentage = (sombres * 100) / (taille * taille);
  total += Math.floor(Math.abs(pourcentage - 50) / 5) * 10;

  return total;
}

function appliquerFormat(matrice: Matrice, masque: number): void {
  const taille = matrice.length;
  const bits = infoFormat(masque);
  for (let i = 0; i < 15; i++) {
    const bit = (bits >> i) & 1;
    if (i < 6) matrice[i][8] = bit;
    else if (i === 6) matrice[7][8] = bit;
    else if (i === 7) matrice[8][8] = bit;
    else if (i === 8) matrice[8][7] = bit;
    else matrice[8][14 - i] = bit;

    if (i < 8) matrice[8][taille - 1 - i] = bit;
    else matrice[taille - 15 + i][8] = bit;
  }
  matrice[taille - 8][8] = 1;
}

/** Matrice de modules : `true` = sombre. Sans marge blanche. */
export function matriceQr(texte: string): boolean[][] {
  const donnees = new TextEncoder().encode(texte);
  const version = choisirVersion(donnees.length);
  const taille = version * 4 + 17;
  const octets = entrelacer(codetsDonnees(donnees, version), version);

  const base = matriceVide(taille);
  poserMotifFixe(base, version);
  poserDonnees(base, octets, version);

  let meilleure: Matrice | null = null;
  let meilleurScore = Infinity;

  for (let masque = 0; masque < 8; masque++) {
    const candidate = base.map((ligne) => Int8Array.from(ligne));
    for (let ligne = 0; ligne < taille; ligne++) {
      for (let colonne = 0; colonne < taille; colonne++) {
        if (estReserve(candidate, ligne, colonne, version)) continue;
        if (MASQUES[masque](ligne, colonne)) candidate[ligne][colonne] ^= 1;
      }
    }
    appliquerFormat(candidate, masque);
    const score = penalite(candidate);
    if (score < meilleurScore) {
      meilleurScore = score;
      meilleure = candidate;
    }
  }

  return meilleure!.map((ligne) => Array.from(ligne, (v) => v === 1));
}

/** QR code en SVG, prêt à être injecté dans la page ou partagé. */
export function qrSvg(texte: string, options: { marge?: number; taille?: number } = {}): string {
  const marge = options.marge ?? 4;
  const matrice = matriceQr(texte);
  const cote = matrice.length + marge * 2;

  const chemins: string[] = [];
  for (let ligne = 0; ligne < matrice.length; ligne++) {
    for (let colonne = 0; colonne < matrice.length; colonne++) {
      if (matrice[ligne][colonne]) {
        chemins.push(`M${colonne + marge} ${ligne + marge}h1v1h-1z`);
      }
    }
  }

  const dimension = options.taille ? ` width="${options.taille}" height="${options.taille}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cote} ${cote}"${dimension} ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR code de l'adresse du site">` +
    `<rect width="${cote}" height="${cote}" fill="#ffffff"/>` +
    `<path d="${chemins.join("")}" fill="#000000"/>` +
    `</svg>`
  );
}

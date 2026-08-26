/** Formatage localisé (fr-FR) partagé par toute l'interface. */

const dollars = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 4,
});

const dollarsCourts = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 2,
});

const entiers = new Intl.NumberFormat("fr-FR");

/** Un coût de génération se compte souvent en fractions de centime. */
export function formaterCout(montant: number): string {
  if (montant === 0) return "0 $";
  if (montant > 0 && montant < 0.0001) return "< 0,0001 $";
  return montant >= 1 ? dollarsCourts.format(montant) : dollars.format(montant);
}

export function formaterNombre(valeur: number): string {
  return entiers.format(Math.round(valeur));
}

export function formaterJetons(valeur: number): string {
  if (valeur >= 1_000_000) return `${(valeur / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (valeur >= 1000) return `${(valeur / 1000).toFixed(valeur >= 10_000 ? 0 : 1).replace(".", ",")} k`;
  return entiers.format(valeur);
}

export function formaterContexte(jetons: number | null): string | null {
  if (!jetons) return null;
  if (jetons >= 1_000_000) return `${Math.round(jetons / 1_000_000)} M de contexte`;
  return `${Math.round(jetons / 1000)} k de contexte`;
}

export function formaterDate(horodatage: number): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(horodatage);
}

export function formaterDateHeure(horodatage: number): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(
    horodatage,
  );
}

export function formaterDateRelative(horodatage: number): string {
  const secondes = Math.round((horodatage - Date.now()) / 1000);
  const seuils: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.35],
    ["month", 12],
    ["year", Infinity],
  ];
  const format = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });
  let valeur = secondes;
  for (const [unite, taille] of seuils) {
    if (Math.abs(valeur) < taille) return format.format(Math.round(valeur), unite);
    valeur /= taille;
  }
  return formaterDate(horodatage);
}

export function formaterOctets(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1).replace(".", ",")} ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/** Clé « 2026-08 » utilisée pour regrouper les dépenses par mois. */
export function cleMois(horodatage: number): string {
  const date = new Date(horodatage);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function libelleMois(cle: string): string {
  const [annee, mois] = cle.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    new Date(annee, mois - 1, 1),
  );
}

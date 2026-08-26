"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconeDepenses, IconeFournisseurs, IconeProjets, IconeReglages } from "./icones";

const ONGLETS = [
  { href: "/", libelle: "Projets", Icone: IconeProjets },
  { href: "/fournisseurs", libelle: "Fournisseurs", Icone: IconeFournisseurs },
  { href: "/depenses", libelle: "Dépenses", Icone: IconeDepenses },
  { href: "/reglages", libelle: "Réglages", Icone: IconeReglages },
];

/** L'atelier occupe tout l'écran : la barre s'efface pour lui laisser la place. */
const ROUTES_SANS_BARRE = ["/projet", "/bienvenue"];

export function BarreNavigation() {
  const chemin = usePathname();
  if (ROUTES_SANS_BARRE.some((route) => chemin.startsWith(route))) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-3xl border-t border-bord bg-fond/95 pb-[var(--marge-basse)] backdrop-blur">
      <ul className="flex">
        {ONGLETS.map(({ href, libelle, Icone }) => {
          const actif = href === "/" ? chemin === "/" : chemin.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={actif ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors ${
                  actif ? "text-accent" : "text-texte-doux"
                }`}
              >
                <Icone width={22} height={22} />
                {libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

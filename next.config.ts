import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Atelier est une application 100 % locale : aucune clé, aucun prompt et aucun
  // fichier de projet ne transite par un serveur. L'export statique garantit
  // cette propriété par construction — le bundle produit dans `out/` peut être
  // servi par n'importe quel hébergeur de fichiers statiques.
  output: "export",

  // Les en-têtes de sécurité ne peuvent pas être servis par Next en export
  // statique : ils sont déclarés dans `public/_headers` (Cloudflare Pages,
  // Netlify) et documentés dans README.md pour les autres hébergeurs.
};

export default nextConfig;

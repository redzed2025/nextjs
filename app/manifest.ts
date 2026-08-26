import type { MetadataRoute } from "next";

// En export statique, une route de métadonnées doit être explicitement statique.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Atelier — créez votre site avec vos propres clés IA",
    short_name: "Atelier",
    description:
      "Créez un site ou une application en décrivant votre idée. Vos clés API restent sur votre appareil.",
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#08080c",
    theme_color: "#08080c",
    categories: ["productivity", "developer"],
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

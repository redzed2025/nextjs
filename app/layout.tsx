import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { FournisseurAtelier } from "@/components/contexte-atelier";
import { BarreNavigation } from "@/components/barre-navigation";
import { EnregistrementServiceWorker } from "@/components/service-worker";

const police = Inter({ variable: "--police-sans", subsets: ["latin"] });
const policeMono = JetBrains_Mono({ variable: "--police-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Atelier — créez votre site avec vos propres clés IA",
  description:
    "Décrivez votre idée, Atelier génère le site. Vos clés API restent sur votre appareil : aucun serveur, aucun abonnement à l'inférence.",
  applicationName: "Atelier",
  appleWebApp: { capable: true, title: "Atelier", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icone-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#08080c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // L'atelier contient un éditeur de code : le zoom reste autorisé.
  maximumScale: 5,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${police.variable} ${policeMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-fond text-texte">
        <FournisseurAtelier>
          <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
            <main className="flex-1 pb-[calc(4.75rem+var(--marge-basse))]">{children}</main>
            <BarreNavigation />
          </div>
        </FournisseurAtelier>
        <EnregistrementServiceWorker />
      </body>
    </html>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtelier } from "@/components/contexte-atelier";
import { Chargement } from "@/components/ui";

const POINTS = [
  {
    titre: "Vos clés, vos crédits",
    texte:
      "Atelier ne revend pas de jetons et n'héberge aucune clé. Vous branchez la vôtre — " +
      "Anthropic, OpenRouter, OpenAI, Groq, DeepSeek, Mistral, Ollama ou tout point de " +
      "terminaison compatible — et vous ne payez que ce que vous consommez, chez votre " +
      "fournisseur.",
  },
  {
    titre: "Rien ne quitte cet appareil",
    texte:
      "Il n'y a pas de serveur Atelier. Vos projets, votre historique et vos clés vivent dans " +
      "le stockage de ce navigateur. Vos requêtes partent directement vers le fournisseur que " +
      "vous avez choisi, et nulle part ailleurs.",
  },
  {
    titre: "Ce que le fournisseur voit",
    texte:
      "En revanche, ce que vous écrivez est bien envoyé au fournisseur retenu et relève de ses " +
      "conditions d'utilisation et de sa politique de conservation. Atelier n'a aucun moyen de " +
      "les modifier : lisez-les avant d'y confier quelque chose de sensible.",
  },
  {
    titre: "Une estimation, pas une facture",
    texte:
      "Le coût affiché est calculé sur cet appareil, à partir des jetons comptés et des tarifs " +
      "publiés. Il donne un ordre de grandeur fiable ; seul votre fournisseur fait foi.",
  },
];

export default function PageBienvenue() {
  const atelier = useAtelier();
  const routeur = useRouter();

  if (!atelier.pret) return <Chargement />;

  const continuer = async (destination: string) => {
    await atelier.majReglages({ onboardingFait: true });
    routeur.replace(destination);
  };

  return (
    <div className="px-5 pb-10 pt-[calc(2.5rem+var(--marge-haute))]">
      <p className="text-sm font-medium tracking-wide text-accent uppercase">Bienvenue</p>
      <h1 className="mt-2 text-3xl font-semibold leading-tight">
        Décrivez votre idée.
        <br />
        Atelier écrit le site.
      </h1>
      <p className="mt-3 text-texte-doux">
        Depuis votre téléphone, sans coder, et sans un abonnement de plus.
      </p>

      <ul className="mt-8 space-y-4">
        {POINTS.map((point, rang) => (
          <li key={point.titre} className="carte px-4 py-4">
            <p className="flex items-center gap-2.5 font-medium">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs text-accent">
                {rang + 1}
              </span>
              {point.titre}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-texte-doux">{point.texte}</p>
          </li>
        ))}
      </ul>

      <div className="mt-8 space-y-2">
        <button
          type="button"
          className="bouton bouton-principal w-full"
          onClick={() => continuer("/fournisseurs")}
        >
          J&apos;ai compris, brancher ma clé
        </button>
        <button
          type="button"
          className="bouton bouton-fantome w-full"
          onClick={() => continuer("/")}
        >
          Regarder d&apos;abord
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-texte-doux">
        <Link href="/reglages" className="underline underline-offset-2">
          Confidentialité et conditions
        </Link>
      </p>
    </div>
  );
}

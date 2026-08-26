import Link from "next/link";

export default function PageIntrouvable() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium tracking-wide text-accent uppercase">Erreur 404</p>
      <h1 className="text-2xl font-semibold">Cette page n&apos;existe pas</h1>
      <p className="max-w-sm text-sm text-texte-doux">
        Le lien est peut-être ancien, ou le projet a été supprimé de cet appareil.
      </p>
      <Link href="/" className="bouton bouton-principal">
        Retour aux projets
      </Link>
    </div>
  );
}

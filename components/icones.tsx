/** Jeu d'icônes minimal, tracé en SVG pour éviter toute dépendance. */

type ProprietesIcone = React.SVGProps<SVGSVGElement>;

function Base({ children, ...reste }: ProprietesIcone & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width={20}
      height={20}
      {...reste}
    >
      {children}
    </svg>
  );
}

export const IconeProjets = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
  </Base>
);

export const IconeFournisseurs = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M15 7a4 4 0 1 1 1.9 3.4L11 16.3V19H8v-3H5v-3l1.7-1.7A4 4 0 0 1 15 7z" />
    <circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" />
  </Base>
);

export const IconeDepenses = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M4 19V9m5 10V5m5 14v-7m5 7V8" />
  </Base>
);

export const IconeReglages = (p: ProprietesIcone) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4" />
  </Base>
);

export const IconePlus = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconeRetour = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Base>
);

export const IconeEnvoyer = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M4 12l16-8-6 16-2.5-6.5z" />
  </Base>
);

export const IconeArret = (p: ProprietesIcone) => (
  <Base {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </Base>
);

export const IconeApercu = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
    <circle cx="12" cy="12" r="2.5" />
  </Base>
);

export const IconeCode = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M9 7l-5 5 5 5m6-10l5 5-5 5" />
  </Base>
);

export const IconeDiscussion = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M20 14a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
  </Base>
);

export const IconePublier = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M12 16V4m0 0L8 8m4-4 4 4M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
  </Base>
);

export const IconeCopier = (p: ProprietesIcone) => (
  <Base {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </Base>
);

export const IconeCorbeille = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" />
  </Base>
);

export const IconeVersions = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" />
    <path d="M12 8v4l3 2" />
  </Base>
);

export const IconeFichier = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
    <path d="M13 3v6h6" />
  </Base>
);

export const IconeAlerte = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4m0 3h.01" />
  </Base>
);

export const IconeValide = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M5 12.5 10 17 19 7" />
  </Base>
);

export const IconeFermer = (p: ProprietesIcone) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

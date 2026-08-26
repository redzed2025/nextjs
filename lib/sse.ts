/**
 * Lecture d'un flux Server-Sent Events.
 *
 * Le PRD note que le `fetch` de React Native ne gère pas correctement le SSE et
 * impose `expo/fetch`. Le `fetch` des navigateurs, lui, expose un
 * `ReadableStream` conforme : on le découpe ici en événements, en tolérant les
 * fins de ligne CRLF et les trames coupées entre deux morceaux.
 */

export interface EvenementSse {
  evenement: string;
  donnees: string;
}

export async function* lireFluxSse(
  corps: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<EvenementSse> {
  const lecteur = corps.getReader();
  const decodeur = new TextDecoder();
  let tampon = "";

  const annuler = () => {
    void lecteur.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", annuler);

  try {
    while (true) {
      const { done, value } = await lecteur.read();
      if (done) break;
      tampon += decodeur.decode(value, { stream: true });
      tampon = tampon.replace(/\r\n/g, "\n");

      let coupure: number;
      while ((coupure = tampon.indexOf("\n\n")) !== -1) {
        const trame = tampon.slice(0, coupure);
        tampon = tampon.slice(coupure + 2);
        const evenement = analyserTrame(trame);
        if (evenement) yield evenement;
      }
    }

    // Un flux qui se termine sans double saut de ligne laisse une dernière trame.
    const reste = analyserTrame(tampon.replace(/\r\n/g, "\n"));
    if (reste) yield reste;
  } finally {
    signal?.removeEventListener("abort", annuler);
    lecteur.releaseLock();
  }
}

function analyserTrame(trame: string): EvenementSse | null {
  let evenement = "message";
  const donnees: string[] = [];

  for (const ligne of trame.split("\n")) {
    if (!ligne || ligne.startsWith(":")) continue;
    const separateur = ligne.indexOf(":");
    const champ = separateur === -1 ? ligne : ligne.slice(0, separateur);
    let valeur = separateur === -1 ? "" : ligne.slice(separateur + 1);
    if (valeur.startsWith(" ")) valeur = valeur.slice(1);

    if (champ === "event") evenement = valeur;
    else if (champ === "data") donnees.push(valeur);
  }

  if (donnees.length === 0) return null;
  return { evenement, donnees: donnees.join("\n") };
}

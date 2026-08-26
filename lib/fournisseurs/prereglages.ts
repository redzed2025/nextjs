import type { TypeApi } from "@/lib/types";

/**
 * Fournisseurs prêts à l'emploi.
 *
 * `cors` mérite une explication. Sur mobile natif, une requête sortante n'est
 * soumise à aucune règle d'origine. Dans un navigateur, si le fournisseur ne
 * renvoie pas les en-têtes CORS, l'appel direct est bloqué — et comme Atelier
 * n'a pas de serveur pour relayer (c'est justement ce qui garantit que la clé
 * ne quitte pas l'appareil), le fournisseur devient inutilisable en PWA.
 * Le champ ci-dessous est donc affiché avant l'ajout, pas découvert après.
 */
export type SupportCors = "confirme" | "a-verifier" | "configuration-requise";

export interface Prereglage {
  id: string;
  nom: string;
  baseUrl: string;
  typeApi: TypeApi;
  /** URL où l'utilisateur crée sa clé. */
  urlCle: string | null;
  cors: SupportCors;
  noteCors: string | null;
  /** Le point de terminaison accepte `stream_options` (usage en fin de flux). */
  usageEnFlux: boolean;
  /** En-têtes supplémentaires attendus par ce fournisseur. */
  entetes?: Record<string, string>;
  description: string;
}

export const PREREGLAGES: Prereglage[] = [
  {
    id: "anthropic",
    nom: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    typeApi: "anthropic",
    urlCle: "https://console.anthropic.com/settings/keys",
    cors: "confirme",
    noteCors: "Les appels depuis un navigateur sont acceptés explicitement par l'API.",
    usageEnFlux: true,
    description: "Les modèles Claude, directement chez l'éditeur.",
  },
  {
    id: "openrouter",
    nom: "OpenRouter",
    baseUrl: "https://openrouter.ai/api",
    typeApi: "openai",
    urlCle: "https://openrouter.ai/keys",
    cors: "confirme",
    noteCors: "Conçu pour être appelé depuis le navigateur.",
    usageEnFlux: true,
    entetes: { "X-Title": "Atelier" },
    description: "Des centaines de modèles derrière une seule clé, avec les tarifs exposés.",
  },
  {
    id: "openai",
    nom: "OpenAI",
    baseUrl: "https://api.openai.com",
    typeApi: "openai",
    urlCle: "https://platform.openai.com/api-keys",
    cors: "confirme",
    noteCors: null,
    usageEnFlux: true,
    description: "Les modèles GPT.",
  },
  {
    id: "groq",
    nom: "Groq",
    baseUrl: "https://api.groq.com/openai",
    typeApi: "openai",
    urlCle: "https://console.groq.com/keys",
    cors: "a-verifier",
    noteCors: null,
    usageEnFlux: true,
    description: "Inférence très rapide sur modèles ouverts.",
  },
  {
    id: "deepseek",
    nom: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    typeApi: "openai",
    urlCle: "https://platform.deepseek.com/api_keys",
    cors: "a-verifier",
    noteCors: "Si l'appel échoue sans message du serveur, l'origine est probablement refusée.",
    usageEnFlux: true,
    description: "Bon rapport qualité-prix sur le code.",
  },
  {
    id: "mistral",
    nom: "Mistral",
    baseUrl: "https://api.mistral.ai",
    typeApi: "openai",
    urlCle: "https://console.mistral.ai/api-keys",
    cors: "a-verifier",
    noteCors: null,
    usageEnFlux: true,
    description: "Modèles européens, interface compatible OpenAI.",
  },
  {
    id: "ollama",
    nom: "Ollama (réseau local)",
    baseUrl: "http://localhost:11434",
    typeApi: "openai",
    urlCle: null,
    cors: "configuration-requise",
    noteCors:
      "Lancez Ollama avec OLLAMA_ORIGINS=\"*\" pour autoriser cette page. Si Atelier est ouvert " +
      "en HTTPS, un point de terminaison en HTTP simple reste bloqué par le navigateur : " +
      "utilisez alors Atelier depuis http://localhost.",
    usageEnFlux: false,
    description: "Vos modèles, sur votre machine, sans clé et sans coût.",
  },
  {
    id: "personnalise",
    nom: "Fournisseur personnalisé",
    baseUrl: "",
    typeApi: "openai",
    urlCle: null,
    cors: "a-verifier",
    noteCors: null,
    usageEnFlux: true,
    description: "Tout point de terminaison compatible OpenAI.",
  },
];

export function prereglage(id: string): Prereglage | undefined {
  return PREREGLAGES.find((p) => p.id === id);
}

export const LIBELLE_CORS: Record<SupportCors, string> = {
  confirme: "Appels navigateur acceptés",
  "a-verifier": "Appels navigateur à vérifier",
  "configuration-requise": "Demande une configuration",
};

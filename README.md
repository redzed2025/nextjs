# Atelier

**Créez un site web ou une application en le décrivant, depuis votre téléphone, avec vos propres clés IA.**

Atelier ne revend pas de jetons et n'héberge aucune clé. L'utilisateur branche son
propre fournisseur — Anthropic, OpenRouter, OpenAI, Groq, DeepSeek, Mistral, Ollama
ou tout point de terminaison compatible OpenAI — choisit son modèle, et ne paie que
ce qu'il consomme, chez ce fournisseur.

Cette implémentation couvre le **périmètre v1 du PRD** sous forme de **PWA
installable**, construite avec Next.js 16 en export statique.

---

## Écart assumé avec le PRD

Le PRD décrit une application Expo / React Native, avec la PWA comme canal de
distribution iOS. Ce dépôt livre **la PWA** : c'est le seul artefact réellement
constructible et vérifiable ici, et le PRD la retient déjà comme cible v1.

La conception s'y prête : le contrat des adaptateurs fournisseurs, le moteur de
génération, l'analyseur de réponses, le modèle de données et les connecteurs de
publication sont écrits sans dépendance au navigateur au-delà de `fetch`,
`crypto.subtle` et IndexedDB. Le portage vers Expo consiste à remplacer trois
adaptateurs d'infrastructure — voir « Correspondance avec le PRD » plus bas.

---

## Démarrage

```bash
npm install
npm run dev          # http://localhost:3000
```

Autres commandes :

| Commande | Rôle |
|---|---|
| `npm run build` | Export statique dans `out/` |
| `npm test` | Tests unitaires (analyseur, ZIP, QR, coloration, formats) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run verif` | Vérification de bout en bout dans un navigateur, hors ligne |

`npm run verif` s'appuie sur Playwright et un Chromium local (`npm install`
le télécharge, sauf si `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` est défini ; on peut
aussi pointer un binaire existant avec `CHROMIUM_PATH`). Il sert le build
statique, lance un faux fournisseur compatible OpenAI qui répond en SSE, et
rejoue le parcours complet : clé refusée, clé
acceptée, génération en flux, itération, retour à une version antérieure, export
ZIP, suivi des coûts. Les captures atterrissent dans `captures/`.
Lancez `npm run build` avant.

### Déploiement

`out/` est un site statique : n'importe quel hébergeur de fichiers convient.
`public/_headers` porte les en-têtes de sécurité au format Cloudflare Pages et
Netlify ; sur un autre hébergeur, reportez-les dans sa propre configuration.

---

## Architecture

Aucun serveur propriétaire. L'application est un ensemble de fichiers statiques
exécutés par le navigateur ; toutes les requêtes partent du client vers le
fournisseur choisi par l'utilisateur.

```
app/                      Pages (toutes client — l'app est une SPA exportée statiquement)
  page.tsx                Liste des projets, création
  bienvenue/              Onboarding et avertissement fournisseur
  fournisseurs/           Ajout de clés, catalogue de modèles
  projet/                 Atelier : discussion, aperçu, code, versions, publication
  depenses/               Suivi de dépense par fournisseur, projet, modèle, mois
  reglages/               Confidentialité, plafond, effacement des données

lib/
  fournisseurs/           Contrat d'adaptateur + Anthropic + compatible OpenAI
  generation/             Invites système, analyseur de réponses, contexte ciblé, moteur
  deploiement/            Contrat de connecteur + Netlify
  idb.ts                  IndexedDB : providers, projets, fichiers, messages, versions, déploiements
  depot.ts                Toutes les lectures et écritures de l'application
  trousseau.ts            Chiffrement des clés API (AES-GCM, clé non exportable)
  apercu.ts               Construction du document d'aperçu isolé
  zip.ts  qr.ts  coloration.ts  erreurs.ts  format.ts  sse.ts

scripts/                  Serveurs de test et vérification navigateur
```

### Décisions techniques

| Point | Choix | Pourquoi |
|---|---|---|
| Rendu | Next.js 16, `output: "export"` | Aucun serveur : la promesse « la clé ne quitte pas l'appareil » devient structurelle, pas déclarative |
| Persistance | IndexedDB | Équivalent web du SQLite du PRD : même modèle relationnel, même fonctionnement hors ligne |
| Secrets | WebCrypto AES-GCM, clé non exportable | Ce que le web offre de plus proche d'un Keychain — voir « Sécurité » |
| Flux | `fetch` + `ReadableStream` | Le SSE natif du navigateur est conforme, contrairement à celui de React Native |
| Aperçu | iframe `sandbox="allow-scripts"` + CSP interne | Origine opaque : aucun accès au stockage d'Atelier, et réseau coupé par défaut |
| Dépendances | aucune en production | Un utilisateur en réseau mobile paie chaque kilo-octet. ZIP, QR code et coloration sont écrits ici, et testés |

### Contrat d'abstraction fournisseur

Chaque adaptateur expose `verifierCle()`, `listerModeles()` et `generer()`
renvoyant un flux d'événements typés. Deux implémentations couvrent l'écosystème :
`POST /v1/messages` pour Anthropic, `POST /v1/chat/completions` pour tout le
reste. Ajouter un fournisseur compatible OpenAI ne demande qu'une entrée dans
`lib/fournisseurs/prereglages.ts`.

Le format d'échange des fichiers est délibérément plus rare que les clôtures
Markdown, qu'un site généré contient souvent :

```
<<<fichier: index.html>>>
…contenu intégral…
<<<fin>>>
```

L'analyseur tolère les blocs non refermés, les clôtures Markdown parasites, les
réponses tronquées et les chemins hostiles ; il tourne aussi pendant le flux pour
afficher les fichiers au fur et à mesure. Voir `lib/generation/analyse.test.ts`.

---

## Sécurité et vie privée

- **Les clés ne quittent l'appareil que vers leur fournisseur.** Aucun relais,
  aucun serveur intermédiaire, aucune télémétrie.
- **Chiffrement au repos.** Chaque secret est chiffré en AES-GCM 256. La clé de
  chiffrement est générée `extractable: false` : le navigateur n'autorise
  personne à la relire, pas même Atelier.
- **Jamais en clair.** Une clé est affichée masquée (4 + 4 caractères), n'est ni
  journalisée ni sérialisée, et `lib/erreurs.ts` expurge les corps d'erreur des
  fournisseurs, qui renvoient parfois la clé reçue.
- **Suppression immédiate.** Retirer un fournisseur efface son secret du
  trousseau dans la même opération.
- **Le code généré est isolé.** L'aperçu s'exécute en origine opaque, sans accès
  au stockage de l'application, sans navigation hors cadre, et — sauf activation
  explicite — sans accès réseau.

**Limite à connaître** : ce dispositif protège les secrets au repos, mais reste
celui d'un navigateur, pas celui d'un coffre matériel. Le PRD prévoit
`expo-secure-store`, adossé au Keychain iOS et au Keystore Android ; la PWA n'y a
pas accès. C'est dit à l'utilisateur dans les réglages, et c'est la raison pour
laquelle un plafond de dépense par projet est proposé.

---

## Correspondance avec le PRD

| | Périmètre | État |
|---|---|---|
| US-01 | Ajout de fournisseur, presets, validation, stockage chiffré, masquage, suppression | Livré |
| US-02 | Catalogue dynamique, prix par million de jetons, recherche et filtres, modèle par défaut | Livré |
| US-03 | Génération en flux, choix de cible, arrêt, compteurs et coût en direct, erreurs actionnables | Livré |
| US-04 | Itération par conversation, envoi ciblé, versions | Livré |
| US-05 | Aperçu sandboxé, trois tailles d'écran, rechargement automatique | Livré |
| US-06 | Arborescence, coloration, édition, créer / renommer / supprimer / copier | Livré |
| US-07 | Publication en un geste, URL, copie, QR code, historique | Livré via Netlify ; Cloudflare Pages et Vercel en dépôt d'archive guidé |
| US-08 | Export ZIP par la feuille de partage native | Livré. Push GitHub : v2 au PRD |
| US-09 | Build APK via EAS | Hors périmètre v1 (v3 au PRD) |
| US-10 | Liste, duplication, suppression, dépense par fournisseur / projet / mois | Livré |

### Les trois écarts, et pourquoi

**Publication Cloudflare Pages.** Le téléversement direct identifie chaque fichier
par une empreinte BLAKE3, que WebCrypto n'expose pas ; l'API n'annonce par
ailleurs pas d'en-têtes CORS pour un appel depuis une page tierce. Plutôt qu'un
bouton qui échouerait, Atelier prépare l'archive et affiche la marche à suivre.
Netlify, dont le protocole repose sur des empreintes SHA-1 — disponibles dans le
navigateur — assure la publication en une action. Vercel est logé à la même
enseigne que Cloudflare. Sur l'application native prévue au PRD, aucune de ces
deux limites ne s'applique : le contrat `Connecteur` ne change pas, seule
l'implémentation s'ajoute.

**CORS.** Sur mobile natif, une requête sortante ignore les règles d'origine.
Dans un navigateur, un fournisseur qui n'émet pas les en-têtes CORS est
inatteignable — et comme Atelier n'a pas de serveur pour relayer, c'est
rédhibitoire. Le support est donc annoncé **avant** l'ajout d'un fournisseur, et
un échec réseau propose l'explication utile plutôt qu'un « Failed to fetch ».

**Stockage sécurisé.** Voir la limite ci-dessus.

---

## Réponses aux questions ouvertes du PRD (§12)

1. **Invite système embarquée ou téléchargée ?** Embarquée. Un téléchargement
   supposerait un serveur, donc une trace réseau corrélée à l'usage — ce que la
   promesse de confidentialité exclut. Elle reste lisible et complétable par
   l'utilisateur au niveau du projet.
2. **Mode gratuit sans clé ?** Non retenu. Héberger un modèle réintroduirait un
   coût d'infrastructure et une marge à défendre, c'est-à-dire exactement la
   position dont le produit tire son avantage. La friction d'onboarding est
   traitée autrement : presets d'un tap, validation de clé immédiate, et Ollama
   pour un usage local sans dépense.
3. **Coût réel ou estimation locale ?** Estimation locale. Lire le crédit réel
   demanderait un appel à chaque ouverture de l'écran, propre à un seul
   fournisseur. Le chiffre est présenté comme une estimation, jamais comme une
   facture.
4. **Langue de l'invite système ?** Français, avec une règle explicite de miroir
   linguistique — le modèle répond dans la langue de l'utilisateur. Le public visé
   et l'interface sont francophones ; une invite dans la langue du produit évite
   qu'un modèle réponde en anglais à une demande écrite en français.

---

## Tests

- `npm test` — analyseur de réponses (blocs tronqués, chemins hostiles, clôtures
  parasites), écriture ZIP, QR code, coloration, formats. Le QR code est comparé
  **module par module** à une implémentation de référence, sur toutes les versions
  1 à 10 et à chaque capacité limite ; cette référence est une dépendance de
  développement, l'application livrée n'embarque rien.
- `npm run verif` — parcours complet dans un navigateur, sans réseau et sans
  jeton payant.

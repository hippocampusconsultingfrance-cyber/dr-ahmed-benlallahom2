# Dr. Ahmed Ben Lallahom — site et plateforme

Site de [drahmedbenlallahom.com](https://drahmedbenlallahom.com) : présentation du Dr Ahmed Ben Lallahom (anesthésiste-réanimateur), réservation de consultations de conseil en santé avec paiement en ligne, questions santé relues, et plateforme de recrutement international Hippocampus Consulting (candidatures, espace candidat, analyse des CV, back-office).

## Stack

| Couche | Technologies |
| --- | --- |
| Front | React 19, Vite 7, Tailwind CSS 4, Radix UI, wouter, TanStack Query |
| API | Express 4 + tRPC 11 (`server/`), zod 4 |
| Données | PostgreSQL Neon via Drizzle ORM (`drizzle/schema.ts`, driver `neon-http`) |
| Auth admin | Clerk + MFA serveur (`server/adminMfa.ts`) |
| Paiement | Stripe Checkout + webhook signé |
| Emails | Resend (+ webhook Svix) |
| Fichiers | Vercel Blob ; documents candidats chiffrés AES-256 |
| Anti-robot | Cloudflare Turnstile |
| Hébergement | Vercel : SPA statique + une fonction serverless (`api/index.js`) |

## Démarrage local

Prérequis : Node.js 22 (`.nvmrc`, lu par la CI ; `nvm use`) et pnpm 10 (version figée par le champ `packageManager`).

```bash
pnpm install --frozen-lockfile
cp .env.example .env      # puis remplir les valeurs (voir le fichier)
pnpm dev                  # http://localhost:3000 (Express + Vite en mode middleware)
```

## Commandes

| Commande | Rôle |
| --- | --- |
| `pnpm dev` | Serveur de développement |
| `pnpm check` | Vérification TypeScript |
| `pnpm test` | Suite Vitest complète (certains tests exigent des variables d'environnement, voir `.github/workflows/ci.yml`) |
| `pnpm test:ci` | Suite utilisée par la CI |
| `pnpm build` | Build Vite, pré-rendu SEO par page (`scripts/prerender-route-seo.ts`), bundle serveur `dist/index.js` et fonction Vercel `api/index.js` |
| `pnpm start` | Lance le build Express (hébergement hors Vercel) |
| `pnpm test:visual` | Régression visuelle (Playwright) |
| `pnpm check:performance` | Build + budgets de performance |
| `node scripts/smoke-built-server.mjs` | Après `pnpm build` : démarre `api/index.js` et `dist/index.js` avec des variables factices, sans lire `.env` ni joindre d'autre machine, vérifie que chaque paquet chargé à la demande se résout, puis appelle `/api/health`, une requête tRPC anonyme, le prix d'une réservation, les webhooks Stripe et Resend et une tâche planifiée (CI) |
| `node scripts/check-migrations-in-sync.mjs` | Vérifie que `drizzle/pg` décrit exactement `drizzle/schema.ts` (CI) |

## Structure

```
client/            SPA React (pages, composants, données statiques, public/)
server/            API Express/tRPC, webhooks, tâches planifiées, sécurité
server/_core/      démarrage Express, auth, emails, en-têtes, hébergement statique
server/routes/     routes Express hors tRPC (webhooks Stripe et Resend, brief employeur, candidature, coffre candidat, tâches planifiées)
server/routers/    procédures tRPC, un fichier par domaine (admin/ pour l'administration), assemblées dans server/routers.ts
shared/            types et constantes partagés client/serveur
drizzle/           schéma et migrations SQL (source de vérité : drizzle/MIGRATION_SOURCE_OF_TRUTH.md)
scripts/           pré-rendu SEO, régression visuelle, budgets de performance, contrôles de la CI
docs/audits/       rapports d'audit
```

## Déploiement (Vercel)

- La production est servie par Vercel ; la configuration (build, en-têtes, réécritures, crons) est dans `vercel.json`.
- L'installation utilise `pnpm install --frozen-lockfile` : toute modification de dépendance doit être commitée avec son `pnpm-lock.yaml`.
- Les pages publiques sont pré-rendues avec leur `<title>`, description, canonical et balises Open Graph ; les routes privées et inconnues passent par `/_spa-fallback` (noindex).
- Les tâches planifiées sont des **Vercel Cron** quotidiens (`vercel.json > crons`) qui appellent `GET /api/scheduled/*` avec `Authorization: Bearer $CRON_SECRET`. **`CRON_SECRET` doit être défini** dans les variables d'environnement Vercel, sinon aucune tâche ne s'exécute (rappels, confirmations et factures, purge RGPD, analyse des documents…).
- Chaque tâche signale ses passages à un service de surveillance externe, voir ci-dessous.
- Formulaires protégés par Turnstile (contact, demande RGPD, questions médicales, candidature, espace candidat, et réservation quand le défi anti-robot y est demandé) en préproduction : le serveur n'accepte que les jetons émis pour le site et pour `localhost`, si bien que sur un déploiement Preview l'envoi est refusé (« vérification de sécurité »). Pour les essayer jusqu'à l'envoi, renseigner `TURNSTILE_EXTRA_HOSTNAMES` **dans l'environnement Preview de Vercel seulement**, avec l'hôte exact d'une adresse stable de la préproduction (alias de branche, par exemple `mon-projet-git-main-equipe.vercel.app`, ou domaine de préproduction ; plusieurs hôtes séparés par des virgules), puis redéployer. Jamais de joker : une entrée comme `*.vercel.app` est ignorée, pour qu'aucun autre déploiement `vercel.app` ne soit accepté. Vérifier aussi que cet hôte fait partie des domaines autorisés du widget dans Cloudflare Turnstile. Laisser la variable vide en production : sur Vercel, elle y est ignorée (`VERCEL_ENV=production`), avec un avertissement dans les journaux ; un serveur lancé hors de Vercel, sans `VERCEL_ENV`, la lirait.
- Variables requises en production : voir `.env.example` (les marquées `[requis prod]` bloquent le démarrage du serveur Express ; sur Vercel, elles sont signalées dans les journaux et dans `/admin` ; `GET /api/health` en donne l’état au public et les noms seulement avec `Authorization: Bearer $CRON_SECRET`).

## Surveillance des tâches planifiées

Vercel ne relance pas une tâche en échec et ne garde ses journaux qu'environ une heure. Après chaque passage, la tâche appelle donc l'URL de ping d'un service externe (gratuit) qui vous alerte, sans dépendre de Resend ni de Vercel, quand un ping manque ou signale un échec (`server/_core/scheduledJobMonitor.ts`).

- **Une variable par tâche** : `HEALTHCHECK_URL_<TÂCHE>`, où `<TÂCHE>` est la fin du chemin `/api/scheduled/<tâche>` en majuscules, tirets remplacés par `_` (liste complète dans `.env.example`). Une variable vide désactive le ping de cette tâche.
- **Ce qui est envoyé** : un `GET` sans corps ni paramètre sur l'URL après un passage réussi, sur l'URL suivie de `/fail` après un échec (exception, ou réponse d'erreur comme le 503 de la revue de sécurité sans base) : le service alerte aussitôt au lieu d'attendre la fin du délai de grâce. Aucune donnée de patient ou de candidat. Délai de 3 s (1,5 s pour le traitement des CV, dont les analyses occupent presque toute la limite de 60 s) ; si le service ne répond pas, la tâche n'est pas affectée (un avertissement `[ScheduledJobMonitor]` est journalisé, sans l'URL).
- **Création des contrôles** (une fois par tâche, 7 au total) :
  - *healthchecks.io* : *Add Check*, nom = la tâche, *Period* **1 day**, *Grace Time* **2 hours** ; copier l'URL de ping (`https://hc-ping.com/…`).
  - *Better Stack* : *Uptime > Heartbeats > Create heartbeat*, *Expect a heartbeat every* **1 day**, *with a grace period of* **2 hours** ; copier l'URL (`https://uptime.betterstack.com/api/v1/heartbeat/…`).
  - Dans le service, choisir le canal d'alerte (application mobile, SMS, Telegram, email d'une autre boîte que celle des alertes Resend).
  - Coller chaque URL dans Vercel > Settings > Environment Variables (Production) sous le nom de sa tâche, puis redéployer.
- **Vérifier** : après le prochain passage de chaque tâche (horaires dans `vercel.json`), le contrôle passe à « up » ; sinon, voir le journal Vercel de la tâche.

## Base de données

Base PostgreSQL (Neon). Les migrations de référence sont dans `drizzle/pg/` (`0000_baseline.sql` recrée tout le schéma sur une base vide) ; `drizzle/legacy-mysql/` n'est qu'un historique MySQL à ne jamais exécuter. Ne jamais utiliser `drizzle-kit push` en production. Modifier `drizzle/schema.ts`, générer la migration (`pnpm db:generate`), relire le SQL puis l'appliquer explicitement : procédure complète dans `drizzle/MIGRATION_SOURCE_OF_TRUTH.md`.

## Sécurité

Signalement de vulnérabilité : voir [SECURITY.md](SECURITY.md).

### Politique de sécurité du contenu (CSP) : retrait de `'unsafe-inline'`

La CSP appliquée (`server/_core/contentSecurityPolicy.ts` et, à l'identique, `vercel.json`) autorise encore les scripts inline (`'unsafe-inline'` dans `script-src`) par précaution pour Clerk, Stripe et Turnstile : le code du site n'en a aucun (seulement des blocs de données `application/ld+json`). Une seconde politique, `Content-Security-Policy-Report-Only`, identique mais sans `'unsafe-inline'` dans `script-src` (et sans `upgrade-insecure-requests`, ignoré dans ce mode), ne bloque rien : le navigateur signale à `POST /api/csp-report` chaque script qu'elle aurait bloqué.

- **Lire les rapports** : Vercel > projet > *Logs*, filtrer sur `[CspReport]`. Une ligne par violation : `directive` (`script-src-elem`, `script-src-attr`…), `blocked` réduit à son origine (`inline`, `eval`, `https://exemple.com`), `page` sans paramètres et `source`, l'origine du fichier en cause. Ni IP, ni paramètres d'URL, ni extrait de script. Vercel ne garde ces journaux qu'environ une heure (un jour en offre Pro) et les rapports ne sont conservés nulle part ailleurs : les lire juste après chaque essai. En production, une lecture quotidienne ne voit tous les rapports qu'en offre Pro, lue au moins toutes les 24 heures, ou avec un Log Drain (Vercel > *Settings* > *Drains*, selon l'offre) vers un service qui garde les journaux ; sinon, l'absence de rapport en production ne prouve rien. Pendant un essai, la console du navigateur (F12) affiche aussi `[Report Only] Refused to execute…`, et Chrome liste l'envoi des rapports vers `csp-endpoint` dans *Application > Reporting API*.
- **Bruit à ignorer** : `source` en `chrome-extension:`, `moz-extension:` ou `safari-web-extension:` (extension du visiteur), la barre d'outils Vercel (`vercel.live`) des déploiements de préproduction, et une même IP au-delà de 30 rapports en 10 minutes (la route répond alors 429 sans journaliser).
- **Rapport légitime** : `blocked: "inline"` avec une `source` Clerk (`clerk.drahmedbenlallahom.com`, `*.clerk.com`, `*.clerk.accounts.dev`), Stripe (`js.stripe.com`), Cloudflare (`challenges.cloudflare.com`) ou une page du site sans extension en cause. Ne pas basculer, et selon la directive :
  - `script-src-elem` (balise `<script>` inline) : ajouter l'empreinte `'sha256-…'` que donne la console du navigateur à `OBSERVED_INLINE_SCRIPT_HASHES` dans le module et au `script-src` de la valeur `Content-Security-Policy-Report-Only` de `vercel.json`, **pas** à la politique appliquée : à côté de `'unsafe-inline'`, une empreinte le fait ignorer par les navigateurs, qui bloqueraient aussitôt tous les autres scripts inline. Redéployer et reprendre l'observation. Si l'empreinte change d'un chargement à l'autre (contenu variable), elle ne suffit pas : ne pas basculer.
  - `script-src-attr` (gestionnaire inline, `onclick="…"` par exemple) : une empreinte seule ne l'autorise pas, il faudrait aussi `'unsafe-hashes'`, qui autorise ce même code dans n'importe quel attribut de n'importe quelle page. Ne pas basculer tant que le code qui ajoute ce gestionnaire n'a pas été corrigé : `addEventListener` à la place de l'attribut s'il vient du site, mise à jour de la bibliothèque s'il vient d'un tiers.
- **Quand basculer** : après avoir essayé en préproduction, console du navigateur ouverte et journaux lus dans l'heure, la connexion à l'administration (Clerk et double authentification), un paiement de consultation jusqu'à la page Stripe et les formulaires protégés par Turnstile (contact, demande RGPD, questions médicales, candidature, espace candidat, et réservation quand le défi anti-robot y est demandé), sans rapport légitime en suspens ; puis, si les journaux de production sont gardés entre deux lectures (offre Pro lue chaque jour ou Log Drain), **2 semaines de production sans rapport légitime**. Sans cela, seuls les essais de préproduction font foi : les refaire juste avant de basculer, et lire les journaux de près les jours suivants. Pour basculer, retirer `'unsafe-inline'` de `script-src` dans `CONTENT_SECURITY_POLICY_DIRECTIVES` et dans la valeur `Content-Security-Policy` de `vercel.json`, y ajouter les empreintes de `OBSERVED_INLINE_SCRIPT_HASHES` (`server/securityHeaders.test.ts` vérifie que le module et `vercel.json` restent identiques), sans toucher à `style-src`. `pnpm dev` n'en dépend pas : en développement, Express garde les scripts inline autorisés (`contentSecurityPolicyHeaders`), sans quoi le script inline de Vite (React refresh) serait bloqué et la page resterait blanche. La politique Report-Only peut ensuite rester pour signaler une éventuelle injection.

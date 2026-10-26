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

Prérequis : Node.js 22 et pnpm 10 (version figée par le champ `packageManager`).

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

## Structure

```
client/            SPA React (pages, composants, données statiques, public/)
server/            API Express/tRPC, webhooks, tâches planifiées, sécurité
server/_core/      démarrage Express, auth, emails, en-têtes, hébergement statique
shared/            types et constantes partagés client/serveur
drizzle/           schéma et migrations SQL (source de vérité : drizzle/MIGRATION_SOURCE_OF_TRUTH.md)
scripts/           pré-rendu SEO, régression visuelle, budgets de performance
docs/audits/       rapports d'audit
```

## Déploiement (Vercel)

- La production est servie par Vercel ; la configuration (build, en-têtes, réécritures, crons) est dans `vercel.json`.
- L'installation utilise `pnpm install --frozen-lockfile` : toute modification de dépendance doit être commitée avec son `pnpm-lock.yaml`.
- Les pages publiques sont pré-rendues avec leur `<title>`, description, canonical et balises Open Graph ; les routes privées et inconnues passent par `/_spa-fallback` (noindex).
- Les tâches planifiées sont des **Vercel Cron** quotidiens (`vercel.json > crons`) qui appellent `GET /api/scheduled/*` avec `Authorization: Bearer $CRON_SECRET`. **`CRON_SECRET` doit être défini** dans les variables d'environnement Vercel, sinon aucune tâche ne s'exécute (rappels, confirmations et factures, purge RGPD, analyse des documents…).
- Chaque tâche signale ses passages à un service de surveillance externe, voir ci-dessous.
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

- **Lire les rapports** : Vercel > projet > *Logs*, filtrer sur `[CspReport]`. Une ligne par violation : `directive` (`script-src-elem`, `script-src-attr`…), `blocked` réduit à son origine (`inline`, `eval`, `https://exemple.com`), `page` sans paramètres et `source`, l'origine du fichier en cause. Ni IP, ni paramètres d'URL, ni extrait de script. Vercel ne garde ces journaux qu'environ une heure (un jour en offre Pro) : les lire juste après chaque essai, puis chaque jour pendant l'observation. Pendant un essai, la console du navigateur (F12) affiche aussi `[Report Only] Refused to execute…`, et Chrome liste l'envoi des rapports vers `csp-endpoint` dans *Application > Reporting API*.
- **Bruit à ignorer** : `source` en `chrome-extension:`, `moz-extension:` ou `safari-web-extension:` (extension du visiteur), la barre d'outils Vercel (`vercel.live`) des déploiements de préproduction, et une même IP au-delà de 30 rapports en 10 minutes (la route répond alors 429 sans journaliser).
- **Rapport légitime** : `blocked: "inline"` (ou `script-src-attr`) avec une `source` Clerk (`clerk.drahmedbenlallahom.com`, `*.clerk.com`, `*.clerk.accounts.dev`), Stripe (`js.stripe.com`), Cloudflare (`challenges.cloudflare.com`) ou une page du site sans extension en cause. Ne pas basculer : ajouter dans `script-src` des deux politiques, au module et dans `vercel.json`, l'empreinte `'sha256-…'` que donne la console du navigateur, redéployer et reprendre l'observation.
- **Quand basculer** : après avoir essayé en préproduction la connexion à l'administration (Clerk et double authentification), un paiement de consultation jusqu'à la page Stripe et les formulaires protégés par Turnstile (contact, candidature, espace candidat), puis **2 semaines de production sans rapport légitime**, retirer `'unsafe-inline'` de `script-src` dans `CONTENT_SECURITY_POLICY_DIRECTIVES` et dans la valeur `Content-Security-Policy` de `vercel.json` (`server/securityHeaders.test.ts` vérifie qu'elles restent identiques), sans toucher à `style-src`. La politique Report-Only peut ensuite rester pour signaler une éventuelle injection.

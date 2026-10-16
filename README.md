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
- Variables requises en production : voir `.env.example` (les marquées `[requis prod]` bloquent le démarrage du serveur Express ; sur Vercel, elles sont signalées dans les journaux, sur `GET /api/health` et dans `/admin`).

## Base de données

Base PostgreSQL (Neon). Les migrations de référence sont dans `drizzle/pg/` (`0000_baseline.sql` recrée tout le schéma sur une base vide) ; `drizzle/legacy-mysql/` n'est qu'un historique MySQL à ne jamais exécuter. Ne jamais utiliser `drizzle-kit push` en production. Modifier `drizzle/schema.ts`, générer la migration (`pnpm db:generate`), relire le SQL puis l'appliquer explicitement : procédure complète dans `drizzle/MIGRATION_SOURCE_OF_TRUTH.md`.

## Sécurité

Signalement de vulnérabilité : voir [SECURITY.md](SECURITY.md).

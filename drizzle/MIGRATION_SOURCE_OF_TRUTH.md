# Source de vérité des migrations Drizzle

La base de production est **PostgreSQL (Neon)**. La configuration active de Drizzle, `drizzle.config.ts`, déclare `dialect: "postgresql"` et `out: "./drizzle/pg"`. Les fichiers SQL et le journal (`meta/_journal.json`) présents sous `drizzle/pg/` constituent donc la seule source de vérité des migrations de ce projet.

## Contenu des dossiers

| Dossier | Statut | Rôle |
|---|---|---|
| `drizzle/schema.ts` | actif | Schéma TypeScript lu par le code et par drizzle-kit. |
| `drizzle/pg/` | **actif, source de vérité** | Migrations PostgreSQL. `0000_baseline.sql` recrée l'intégralité du schéma (36 tables) à partir de `drizzle/schema.ts`, générée par `drizzle-kit generate` (audit de lancement M32, 2026-10). Les migrations suivantes s'y ajoutent : `0001_appointment_invoices.sql` (factures numérotées, B3) est idempotente (`IF NOT EXISTS`), car l'application crée aussi cette table à l'exécution (`server/invoiceNumbering.ts`) ; elle vérifie d'abord ce qui existe et n'envoie aucune DDL quand la table et ses index sont déjà là, donc le rôle de `DATABASE_URL` n'a pas besoin d'en être propriétaire si 0001 a été appliquée avec un autre rôle (il lui faut alors `SELECT, INSERT` sur la table et `USAGE` sur sa séquence). `0002_language_columns.sql` (EN-01, EN-02) ajoute la colonne `language` (`varchar(10)`, `'fr'` par défaut, non nulle) à `appointments`, `cv_applications` et `candidate_accounts` ; elle est idempotente (`ADD COLUMN IF NOT EXISTS`) car l'application ajoute aussi ces colonnes à l'exécution, avec la même DDL, une fois par instance, à la première requête qui nomme l'une de ces trois tables (`server/languageColumns.ts`, branché par `getDb()` sur le client Neon) : seules les requêtes sur ces tables l'attendent, les autres (disponibilités, santé, questions médicales…) partent aussitôt. La vérification lit le catalogue (`to_regclass`, `pg_attribute`) sans verrouiller les tables, et rien n'est envoyé quand les trois colonnes existent. **Voie normale : appliquer 0002 avant de déployer le code qui lit ces colonnes.** L'ajout à l'exécution n'est qu'un filet de secours : il exige que le rôle de `DATABASE_URL` puisse modifier ces tables (en être propriétaire), et `ALTER TABLE … ADD COLUMN` prend un verrou exclusif sur la table. Son attente est bornée à 2 s (`SET LOCAL lock_timeout` dans le même bloc `DO`, neon-http n'ayant pas de transaction interactive) ; pendant ces 2 s au plus, il bloque aussi les lectures de la table par les autres sessions. Un échec (verrou non obtenu, code 55P03, ou droits insuffisants) est journalisé une fois par instance (`[Database] Language columns check failed`) et réessayé une minute plus tard ; d'ici là, les requêtes sur une table encore sans colonne échouent aussitôt au lieu d'attendre, le reste du site fonctionne. |
| `drizzle/legacy-mysql/` | **historique, en lecture seule** | Anciennes migrations MySQL/TiDB de l'époque Manus (`0000`–`0027`, journal `dialect: mysql`) et ancien dossier manuel `drizzle/migrations/` (déplacé dans `drizzle/legacy-mysql/manual/`). Aucune instruction ne s'applique à PostgreSQL : ne jamais les exécuter, ne rien y ajouter. Conservées uniquement pour la traçabilité. |

Vérifié sur une base PostgreSQL 16 vierge (réplique locale de l'audit) : le migrateur `drizzle-orm/neon-http` applique `drizzle/pg` sans erreur, produit 36 tables, 468 colonnes et 95 index identiques au schéma attendu par le code, et une seconde exécution ne fait rien (journal `drizzle.__drizzle_migrations`).

## Procédure obligatoire pour toute évolution du schéma

1. Modifier le schéma TypeScript dans `drizzle/schema.ts`.
2. Générer la migration incrémentale : `pnpm db:generate` (alias de `drizzle-kit generate`, aucune base requise). Elle est écrite dans `drizzle/pg/`.
3. Lire intégralement le SQL produit et vérifier son ordre, ses index et sa réversibilité métier. Préférer des instructions idempotentes (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) lorsque le code crée aussi la colonne à l'exécution.
4. Appliquer le SQL explicitement avec l'outil de migration de la plateforme, puis comparer les tables et colonnes réellement déployées.
5. Ajouter ou mettre à jour les tests couvrant le contrat modifié. Le test `server/migrationSourceOfTruth.test.ts` échoue tant que `drizzle/pg` ne couvre pas toutes les tables et colonnes de `drizzle/schema.ts`.

Ne jamais employer `drizzle-kit push` (ni l'ancien `pnpm db:push`) comme raccourci non revu en production.

## Utilisation de la baseline

- **Nouvel environnement ou reprise après sinistre** : sur une base PostgreSQL **vide**, `DATABASE_URL=<base vide> pnpm drizzle-kit migrate` recrée tout le schéma.
- **Production existante** : la baseline ne doit **pas** y être rejouée (les tables existent déjà ; `CREATE TABLE` échouerait sans rien modifier). Aucune action n'est requise pour le lancement. Si le propriétaire souhaite ensuite appliquer les migrations incrémentales avec `drizzle-kit migrate`, il faudra d'abord, après sauvegarde et comparaison du schéma réel (export `information_schema.columns`), marquer la baseline comme appliquée dans `drizzle.__drizzle_migrations`.

Cette règle prévient les divergences silencieuses entre le schéma TypeScript, les fichiers versionnés et la base de production.

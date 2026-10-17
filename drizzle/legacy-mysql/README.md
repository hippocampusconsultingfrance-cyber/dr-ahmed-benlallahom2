# Historique MySQL/TiDB — NE PAS EXÉCUTER

Ce dossier conserve, pour la seule traçabilité, les migrations de l'époque où le site tournait sur
MySQL/TiDB (plateforme Manus) :

- `0000_*.sql` à `0027_*.sql` et `meta/` (journal drizzle-kit, `dialect: mysql`) ;
- `manual/` : l'ancien dossier `drizzle/migrations/` (scripts appliqués à la main).

Ces instructions sont en syntaxe MySQL (`ENUM`, `AUTO_INCREMENT`, `MODIFY COLUMN`, `AFTER`…) :
aucune ne s'applique à PostgreSQL. Elles ne sont plus lues par drizzle-kit (`drizzle.config.ts`
pointe sur `drizzle/pg`).

La source de vérité est désormais `drizzle/pg/` : voir `drizzle/MIGRATION_SOURCE_OF_TRUTH.md`.

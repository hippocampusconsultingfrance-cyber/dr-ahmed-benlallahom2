# Source de vérité des migrations Drizzle

La base de production est **PostgreSQL (Neon)**. La configuration active de Drizzle, `drizzle.config.ts`, déclare `dialect: "postgresql"` et `out: "./drizzle/pg"`. Les fichiers SQL et le journal (`meta/_journal.json`) présents sous `drizzle/pg/` constituent donc la seule source de vérité des migrations de ce projet.

## Contenu des dossiers

| Dossier | Statut | Rôle |
|---|---|---|
| `drizzle/schema.ts` | actif | Schéma TypeScript lu par le code et par drizzle-kit. |
| `drizzle/pg/` | **actif, source de vérité** | Migrations PostgreSQL. `0000_baseline.sql` recrée l'intégralité du schéma (36 tables) à partir de `drizzle/schema.ts`, générée par `drizzle-kit generate` (audit de lancement M32, 2026-10). Les migrations suivantes s'y ajoutent : `0001_appointment_invoices.sql` (factures numérotées, B3) est idempotente (`IF NOT EXISTS`), car l'application crée aussi cette table à l'exécution (`server/invoiceNumbering.ts`) ; elle vérifie d'abord ce qui existe et n'envoie aucune DDL quand la table et ses index sont déjà là, donc le rôle de `DATABASE_URL` n'a pas besoin d'en être propriétaire si 0001 a été appliquée avec un autre rôle (il lui faut alors `SELECT, INSERT` sur la table et `USAGE` sur sa séquence). `0002_language_columns.sql` (EN-01, EN-02) ajoute la colonne `language` (`varchar(10)`, `'fr'` par défaut, non nulle) à `appointments`, `cv_applications` et `candidate_accounts` ; elle est idempotente (`ADD COLUMN IF NOT EXISTS`) car l'application ajoute aussi ces colonnes à l'exécution, avec la même DDL, une fois par instance, à la première requête qui lit ou écrit cette colonne, c'est-à-dire qui nomme `language` et l'une de ces trois tables (`server/languageColumns.ts`, branché par `getDb()` sur le client Neon) : seules ces requêtes l'attendent, les autres (disponibilités et créneaux réservés, santé, questions médicales…) partent aussitôt. La vérification lit le catalogue (`to_regclass`, `pg_attribute`) sans verrouiller les tables, et rien n'est envoyé quand les trois colonnes existent. **Voie normale : appliquer 0002 avant de déployer le code qui lit ces colonnes.** L'ajout à l'exécution n'est qu'un filet de secours : il exige que le rôle de `DATABASE_URL` puisse modifier ces tables (en être propriétaire), et `ALTER TABLE … ADD COLUMN` prend un verrou exclusif sur la table. Son attente est bornée à 2 s (`SET LOCAL lock_timeout` dans le même bloc `DO`, neon-http n'ayant pas de transaction interactive) ; pendant ces 2 s au plus, il bloque aussi les lectures de la table par les autres sessions. Un verrou pris sur l'une des tables n'empêche pas d'ajouter la colonne aux deux autres. Un échec (verrou non obtenu, code 55P03, ou droits insuffisants, code 42501) est journalisé une fois par code (`[Database] Language columns check failed`, suivi du code ; le même échec répété ensuite reste silencieux jusqu'au retour à la normale), le retour à la normale une fois (`[Database] Language columns check succeeded after a failure`), et la vérification est réessayée par la première requête concernée 5 s après le premier échec, avec la même attente bornée à 2 s. Si ce nouvel essai attend encore le verrou sur l'une des tables (55P03), même si une autre échoue autrement, le verrou dure : chaque essai suivant n'a lieu qu'une minute après l'échec précédent, tant que les échecs se suivent. Les autres échecs (droits insuffisants, réseau), qui n'attendent pas le verrou et ne retiennent donc pas les lectures, doublent le délai (10, 20, 40 s) jusqu'à une minute au plus. Sous un verrou qui dure, les lectures de la table sont donc retenues jusqu'à 2 s au premier essai, puis au deuxième, environ 7 s après le début du premier, puis une fois par minute au plus et par instance (au plus 3 fois dans les 100 premières secondes) ; d'ici là, les requêtes qui lisent ou écrivent la colonne d'une table qui ne l'a pas encore échouent aussitôt au lieu d'attendre (quelques secondes après la fin d'un verrou bref, une minute au plus après un verrou long), le reste du site fonctionne. `0003_mission_shortlist_columns.sql` (IA-02, RGPD-03) ajoute `confirmed_at` à `cv_candidate_certifications` (certification confirmée par l'admin) et `candidate_consent_at` à `client_brief_candidates` (date de l'accord du candidat pour une mission), deux `timestamp` nullables sans valeur par défaut ; elle est idempotente pour la même raison : le même mécanisme (`RUNTIME_COLUMNS` dans `server/languageColumns.ts`, une colonne par table) les ajoute à l'exécution, à la première requête qui nomme l'une de ces colonnes et sa table, avec la même vérification unique du catalogue pour les cinq colonnes, la même attente bornée, les mêmes délais avant un nouvel essai et les mêmes journaux (`Language columns check…`). **Voie normale : appliquer 0003 avant de déployer le code qui lit ces colonnes.** `0004_integrity_constraints.sql` (DATA-01, DATA-11) pose les premières contraintes tenues par la base elle-même : l'index unique `client_brief_candidates_pair_unique` (`brief_id`, `application_id`), après avoir fusionné les associations en double (ligne gardée : la dernière modifiée, c'est-à-dire la dernière décision de l'admin ou la dernière date d'accord notée, puis la plus ancienne ; elle reçoit la création la plus ancienne, le premier score trouvé et toutes les notes distinctes ; le statut et l'accord du candidat restent ceux de la ligne gardée, ceux des doublons ne sont pas repris, une date portée par un doublon pouvant être un accord retiré depuis) ; la clé étrangère `candidate_documents_candidate_id_fk` (`candidate_documents.candidate_id` → `candidate_accounts.id`, `ON DELETE RESTRICT`) ; les CHECK `appointments_payment_status_check` et `appointments_appointment_status_check` (valeurs de `drizzle/schema.ts`) ; ces trois contraintes sont posées `NOT VALID` puis validées par une instruction séparée, dont l'échec nomme la contrainte dont des lignes sont à corriger. Enfin l'index unique partiel `cv_applications_submission_unique` (`lower(email)`, `lower(specialty)`, `file_checksum`, `md5(target_countries)`, `WHERE file_checksum IS NOT NULL` : les pays visés en font partie, comme dans `isSameRecruitmentSubmission`, INTL-03) n'est créé que si aucune candidature n'a déjà été reçue plusieurs fois : sinon aucune candidature n'est supprimée, un `WARNING` liste leurs références et 0004 est à relancer une fois décidé ce qu'on en garde. Cette relance se fait en exécutant le fichier lui-même (`psql -f drizzle/pg/0004_integrity_constraints.sql` ou l'éditeur SQL de Neon) : `drizzle-kit migrate` a déjà inscrit 0004 dans `drizzle.__drizzle_migrations` et ne la rejoue jamais, et il n'affiche pas toujours le `WARNING` ; la vérification après 0004 (section suivante) le signale par un nom nul. Chaque étape vérifie le catalogue (`to_regclass`, `pg_constraint`) : une seconde exécution ne change rien. **Voie normale : appliquer 0004 avant de déployer le code qui s'en sert.** Seul filet à l'exécution : l'association d'un candidat à une mission est un upsert `ON CONFLICT (brief_id, application_id)` que PostgreSQL refuse tant que l'index manque (code 42P10) ; l'application revient alors à l'ancienne lecture suivie d'une écriture, sur la copie modifiée en dernier, et journalise `[Database] client_brief_candidates_pair_unique missing` ; deux appels simultanés peuvent encore y créer un doublon, que 0004 fusionnera. Les autres contraintes de 0004 n'ont pas besoin de filet : sans elles, le code se comporte comme avant. Le snapshot `meta/0004_snapshot.json` et l'entrée du journal sont ceux de `pnpm db:generate --name integrity_constraints` ; seul le SQL a été réécrit à la main, si bien que `pnpm db:generate` ne produit ensuite plus rien. `appointment_invoices`, que `server/invoiceNumbering.ts` crée encore à l'exécution, n'est pas touchée. Contrôles à lancer avant et après : section suivante. |
| `drizzle/legacy-mysql/` | **historique, en lecture seule** | Anciennes migrations MySQL/TiDB de l'époque Manus (`0000`–`0027`, journal `dialect: mysql`) et ancien dossier manuel `drizzle/migrations/` (déplacé dans `drizzle/legacy-mysql/manual/`). Aucune instruction ne s'applique à PostgreSQL : ne jamais les exécuter, ne rien y ajouter. Conservées uniquement pour la traçabilité. |

Vérifié sur une base PostgreSQL 16 vierge (réplique locale de l'audit) : le migrateur `drizzle-orm/neon-http` applique `drizzle/pg` sans erreur, produit 36 tables, 468 colonnes et 95 index identiques au schéma attendu par le code, et une seconde exécution ne fait rien (journal `drizzle.__drizzle_migrations`). Avec 0004 (même réplique, 2026-10-26) : 37 tables, 481 colonnes, 101 index, la clé étrangère et les deux CHECK validés, seconde exécution sans effet ; sur une base portant des associations en double, elles sont fusionnées puis l'index créé ; avec une candidature reçue trois fois, ses trois lignes restent et l'index n'est pas créé (WARNING) jusqu'à la relance.

## 0004 : contrôles en lecture seule (production Neon)

Avant d'appliquer 0004, dans l'éditeur SQL de Neon, sur la branche de production. Ces requêtes ne modifient rien.

```sql
-- 1. Associations mission-candidat en double : 0004 les fusionne (voir la règle ci-dessus). À relire avant :
--    pour chaque couple, 0004 garde la première ligne listée ; le statut et l'accord des suivantes ne sont pas repris.
SELECT brief_id, application_id, count(*) AS copies,
  string_agg(id || ':' || association_status || coalesce(' accord ' || candidate_consent_at::date, ''), ', ' ORDER BY updated_at DESC, id) AS lignes
FROM client_brief_candidates GROUP BY brief_id, application_id HAVING count(*) > 1;

-- 2. Candidatures reçues plusieurs fois (même adresse, spécialité, pays visés et CV) : 0 ligne attendue,
--    sinon 0004 ne crée pas leur index unique et il faut décider lesquelles garder.
SELECT string_agg(tracking_id, ', ' ORDER BY id) AS references, count(*) AS copies
FROM cv_applications WHERE file_checksum IS NOT NULL
GROUP BY lower(email), lower(specialty), file_checksum, md5(target_countries) HAVING count(*) > 1;

-- 3. Documents du coffre sans compte : 0 ligne attendue, sinon la validation de la clé étrangère échoue
--    (document d'une personne effacée, à effacer avec son fichier chiffré dans Blob).
SELECT d.id, d.candidate_id, d.status, d.analysis_status, d.created_at FROM candidate_documents d
WHERE NOT EXISTS (SELECT 1 FROM candidate_accounts a WHERE a.id = d.candidate_id);

-- 4. Statuts de rendez-vous hors des valeurs du schéma : 0 ligne attendue, sinon la validation des CHECK échoue.
SELECT id, tracking_id, payment_status, appointment_status FROM appointments
WHERE payment_status NOT IN ('pending', 'completed', 'failed', 'refunded')
   OR appointment_status NOT IN ('held', 'confirmed', 'cancelled', 'completed', 'no_show');

-- 5. Associations à une mission ou une candidature disparue (n'empêchent pas 0004 ; l'application les refuse désormais).
SELECT c.id, c.brief_id, c.application_id FROM client_brief_candidates c
WHERE NOT EXISTS (SELECT 1 FROM client_briefs b WHERE b.id = c.brief_id)
   OR NOT EXISTS (SELECT 1 FROM cv_applications a WHERE a.id = c.application_id);
```

Après 0004, ces deux requêtes doivent renvoyer deux noms non nuls, puis trois lignes à `true`. Un nom nul pour `cv_applications_submission_unique` signifie que des candidatures reçues plusieurs fois l'ont empêché (contrôle 2) : une fois décidé ce qu'on en garde, réexécuter le fichier 0004 avec `psql` ou dans l'éditeur SQL de Neon, pas avec `drizzle-kit migrate`.

```sql
SELECT to_regclass('client_brief_candidates_pair_unique'), to_regclass('cv_applications_submission_unique');
SELECT conname, convalidated FROM pg_constraint
WHERE conname IN ('candidate_documents_candidate_id_fk', 'appointments_payment_status_check', 'appointments_appointment_status_check');
```

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

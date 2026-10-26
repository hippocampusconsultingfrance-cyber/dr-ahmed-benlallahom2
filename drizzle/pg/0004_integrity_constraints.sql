-- Integrity constraints held by the database itself (DATA-01, DATA-11).
-- Idempotent like 0001-0003: every step checks the catalogue or uses
-- IF NOT EXISTS, so a second run changes nothing. Read-only checks to run on
-- the production database first: drizzle/MIGRATION_SOURCE_OF_TRUTH.md.
-- The foreign key and the CHECKs are added NOT VALID (new rows are checked at
-- once, without scanning the table under lock), then validated by a separate
-- statement: a failing VALIDATE names the constraint whose rows to correct.
--
-- 1. One association per mission and candidate (client_brief_candidates).
-- Pairs already associated more than once (simultaneous associateCandidate
-- calls) are first merged into one row: the row kept is the one updated last
-- (the admin's latest decision or agreement date, each write setting
-- updated_at), then the oldest; it gets the earliest creation date, the first
-- score and breakdown found and every distinct note. The other copies' status
-- and agreement date are not kept: a date on another copy may be an agreement
-- withdrawn since on the kept one. The table is locked against writes until
-- the index exists, so no new copy slips in between.
DO $$
DECLARE
  merged integer;
BEGIN
  IF to_regclass('client_brief_candidates_pair_unique') IS NULL THEN
    LOCK TABLE client_brief_candidates IN SHARE ROW EXCLUSIVE MODE;
    WITH ranked AS (
      SELECT id, brief_id, application_id, match_score, match_breakdown, notes, created_at, updated_at,
        row_number() OVER (PARTITION BY brief_id, application_id ORDER BY updated_at DESC, id) AS position,
        count(*) OVER (PARTITION BY brief_id, application_id) AS copies
      FROM client_brief_candidates
    ), merged_values AS (
      SELECT brief_id, application_id, min(created_at) AS created_at, max(updated_at) AS updated_at,
        (array_agg(match_score ORDER BY position) FILTER (WHERE match_score IS NOT NULL))[1] AS match_score,
        (array_agg(match_breakdown ORDER BY position) FILTER (WHERE match_breakdown IS NOT NULL))[1] AS match_breakdown
      FROM ranked WHERE copies > 1 GROUP BY brief_id, application_id
    ), merged_notes AS (
      SELECT brief_id, application_id, string_agg(notes, E'\n\n' ORDER BY first_position) AS notes
      FROM (SELECT brief_id, application_id, notes, min(position) AS first_position FROM ranked WHERE copies > 1 AND notes IS NOT NULL GROUP BY brief_id, application_id, notes) AS distinct_notes
      GROUP BY brief_id, application_id
    ), kept AS (
      UPDATE client_brief_candidates AS association
      SET created_at = merged_values.created_at, updated_at = merged_values.updated_at, match_score = merged_values.match_score,
        match_breakdown = merged_values.match_breakdown, notes = merged_notes.notes
      FROM ranked JOIN merged_values USING (brief_id, application_id) LEFT JOIN merged_notes USING (brief_id, application_id)
      WHERE association.id = ranked.id AND ranked.position = 1
      RETURNING association.id
    )
    DELETE FROM client_brief_candidates AS association USING ranked
    WHERE association.id = ranked.id AND ranked.position > 1;
    GET DIAGNOSTICS merged = ROW_COUNT;
    IF merged > 0 THEN
      RAISE NOTICE 'client_brief_candidates: % duplicated association row(s) merged into the row kept for their mission and candidate', merged;
    END IF;
    CREATE UNIQUE INDEX client_brief_candidates_pair_unique ON client_brief_candidates USING btree (brief_id, application_id);
  END IF;
END $$;
--> statement-breakpoint
-- 2. A vault document never outlives its candidate account (ON DELETE
-- RESTRICT): the erasure deletes the documents first, and finds again one
-- uploaded while it ran (server/recruitmentErasure.ts).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('candidate_documents') AND conname = 'candidate_documents_candidate_id_fk') THEN
    ALTER TABLE candidate_documents ADD CONSTRAINT candidate_documents_candidate_id_fk
      FOREIGN KEY (candidate_id) REFERENCES candidate_accounts (id) ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE candidate_documents VALIDATE CONSTRAINT candidate_documents_candidate_id_fk;
--> statement-breakpoint
-- 3. Booking statuses within the values of drizzle/schema.ts (the columns
-- stay varchar).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('appointments') AND conname = 'appointments_payment_status_check') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_payment_status_check
      CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('appointments') AND conname = 'appointments_appointment_status_check') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_appointment_status_check
      CHECK (appointment_status IN ('held', 'confirmed', 'cancelled', 'completed', 'no_show')) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE appointments VALIDATE CONSTRAINT appointments_payment_status_check;
--> statement-breakpoint
ALTER TABLE appointments VALIDATE CONSTRAINT appointments_appointment_status_check;
--> statement-breakpoint
-- 4. One application per candidate, pathway, target countries and CV file
-- (DATA-11): /api/recruitment/apply answers a simultaneous copy like a
-- repeated sending. No application is ever deleted here: if some were already
-- received more than once, the index is not created, their references are
-- listed in a WARNING, and this file is to be run again once the owner has
-- decided what to do with them (it then creates the index): run the file
-- itself (psql or the Neon SQL editor), since drizzle-kit migrate has already
-- recorded 0004 as applied and never runs it again.
DO $$
DECLARE
  repeated integer;
  references_list text;
BEGIN
  IF to_regclass('cv_applications_submission_unique') IS NULL THEN
    LOCK TABLE cv_applications IN SHARE ROW EXCLUSIVE MODE;
    SELECT count(*), string_agg(tracking_ids, '; ' ORDER BY tracking_ids)
    INTO repeated, references_list
    FROM (
      SELECT string_agg(tracking_id, ', ' ORDER BY id) AS tracking_ids
      FROM cv_applications
      WHERE file_checksum IS NOT NULL
      GROUP BY lower(email), lower(specialty), file_checksum, md5(target_countries)
      HAVING count(*) > 1
    ) AS repeated_sendings;
    IF repeated > 0 THEN
      RAISE WARNING 'cv_applications_submission_unique NOT created: % application(s) received more than once (same address, specialty, target countries and CV): %', repeated, left(references_list, 2000)
        USING HINT = 'Nothing was deleted. Decide which copies to keep, then run this migration again.';
    ELSE
      CREATE UNIQUE INDEX cv_applications_submission_unique ON cv_applications USING btree (lower(email), lower(specialty), file_checksum, md5(target_countries)) WHERE file_checksum IS NOT NULL;
    END IF;
  END IF;
END $$;

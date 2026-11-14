-- candidate_consent_at (RGPD-03): date the candidate agreed to be presented
-- for a mission, entered by the admin; the shortlist export carries only the
-- candidates who have one. confirmed_at (IA-02): date an admin confirmed a
-- certification; only a confirmed one earns points in a mission's matching.
-- Both are nullable without default (existing rows read NULL). The application
-- also adds these columns at runtime with the same idempotent DDL
-- (server/languageColumns.ts, ensureLanguageColumns), so this migration is a
-- no-op where they already exist.
ALTER TABLE "client_brief_candidates" ADD COLUMN IF NOT EXISTS "candidate_consent_at" timestamp;--> statement-breakpoint
ALTER TABLE "cv_candidate_certifications" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp;

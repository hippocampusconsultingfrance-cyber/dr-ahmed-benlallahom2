-- language (EN-01, EN-02): language of the booking, of the application and of
-- the candidate account, 'fr' for every existing row. The application also adds
-- these columns at runtime with the same idempotent DDL
-- (server/languageColumns.ts, ensureLanguageColumns), so this migration is a
-- no-op where they already exist.
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "language" varchar(10) DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_accounts" ADD COLUMN IF NOT EXISTS "language" varchar(10) DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "cv_applications" ADD COLUMN IF NOT EXISTS "language" varchar(10) DEFAULT 'fr' NOT NULL;

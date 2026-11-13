-- admin_mfa_backup_codes (ADM-14): the administrator's ten single-use backup
-- codes, to open the administration without the emailed security code when
-- the mailbox is lost. Only a hash of each code is stored (server/adminMfa.ts,
-- regenerateAdminMfaBackupCodes); used_at marks a code used. A new table only:
-- nothing else is read or changed, and IF NOT EXISTS makes a second run a no-op.
CREATE TABLE IF NOT EXISTS "admin_mfa_backup_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(128) NOT NULL,
	"code_hash" varchar(128) NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_mfa_backup_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_mfa_backup_code_openid_idx" ON "admin_mfa_backup_codes" USING btree ("open_id");
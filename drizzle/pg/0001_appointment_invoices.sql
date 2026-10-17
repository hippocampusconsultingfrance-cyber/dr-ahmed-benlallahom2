-- appointment_invoices (B3): the application also creates this table at
-- runtime with the same idempotent DDL (server/invoiceNumbering.ts,
-- ensureInvoiceSchema), so this migration is a no-op where it already exists.
CREATE TABLE IF NOT EXISTS "appointment_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"appointment_id" integer NOT NULL,
	"invoice_series" varchar(16) NOT NULL,
	"invoice_sequence" integer NOT NULL,
	"invoice_number" varchar(32) NOT NULL,
	"issued_at" timestamp NOT NULL,
	"paid_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appointment_invoices_appointment_unique" ON "appointment_invoices" USING btree ("appointment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appointment_invoices_number_unique" ON "appointment_invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appointment_invoices_series_sequence_unique" ON "appointment_invoices" USING btree ("invoice_series","invoice_sequence");
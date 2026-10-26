import { eq, inArray, sql } from "drizzle-orm";
import { appointmentInvoices } from "../drizzle/schema";
import { getDb } from "./db";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type AppointmentInvoiceRecord = {
  invoiceNumber: string;
  issuedAt: Date;
  paidAt: Date;
};

const PARIS_TIME_ZONE = "Europe/Paris";
const INVOICE_NUMBER_PREFIX = "FAC";
const INVOICE_SEQUENCE_DIGITS = 6;
const MAX_ALLOCATION_ATTEMPTS = 5;

/**
 * Série annuelle (année civile de Paris) : FAC-2026, puis FAC-2027… La
 * numérotation reste chronologique et continue dans chaque série, l’année
 * figurant dans le numéro (FAC-2026-000001).
 */
export function invoiceSeriesFor(date: Date): string {
  const year = new Intl.DateTimeFormat("en-US", { timeZone: PARIS_TIME_ZONE, year: "numeric" }).format(date);
  return `${INVOICE_NUMBER_PREFIX}-${year}`;
}

export function formatInvoiceNumber(series: string, sequence: number): string {
  return `${series}-${String(sequence).padStart(INVOICE_SEQUENCE_DIGITS, "0")}`;
}

/**
 * DDL idempotente : la table est créée à l’exécution, sans étape de migration
 * manuelle en production. Elle reproduit exactement la déclaration
 * `appointmentInvoices` de drizzle/schema.ts.
 *
 * Pourquoi une table plutôt qu’une SEQUENCE PostgreSQL : une séquence
 * pré-journalise 32 valeurs et Neon reconstruit les pages depuis le WAL à
 * chaque redémarrage du compute (mise en veille), ce qui peut sauter jusqu’à
 * 32 numéros. Le numéro est ici calculé dans la même instruction que
 * l’insertion (MAX + 1 de la série), protégé par un index unique : aucun trou.
 */
export const APPOINTMENT_INVOICE_DDL = [
  sql`CREATE TABLE IF NOT EXISTS "appointment_invoices" (
    "id" serial PRIMARY KEY NOT NULL,
    "appointment_id" integer NOT NULL,
    "invoice_series" varchar(16) NOT NULL,
    "invoice_sequence" integer NOT NULL,
    "invoice_number" varchar(32) NOT NULL,
    "issued_at" timestamp NOT NULL,
    "paid_at" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "appointment_invoices_appointment_unique" ON "appointment_invoices" USING btree ("appointment_id")`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "appointment_invoices_number_unique" ON "appointment_invoices" USING btree ("invoice_number")`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "appointment_invoices_series_sequence_unique" ON "appointment_invoices" USING btree ("invoice_series","invoice_sequence")`,
] as const;

/** Relation créée par chaque instruction de APPOINTMENT_INVOICE_DDL, dans le même ordre. */
export const APPOINTMENT_INVOICE_SCHEMA_OBJECTS = [
  "appointment_invoices",
  "appointment_invoices_appointment_unique",
  "appointment_invoices_number_unique",
  "appointment_invoices_series_sequence_unique",
] as const;

/**
 * Codes PostgreSQL d’une création concurrente du même objet par une autre
 * instance : relation déjà existante, objet dupliqué, ou doublon dans le
 * catalogue (pg_class / pg_type) quand deux CREATE ... IF NOT EXISTS se croisent.
 */
const CONCURRENT_CREATION_CODES = new Set(["42P07", "42710", "23505"]);

function postgresErrorCode(error: unknown): string | null {
  for (let current: unknown = error, depth = 0; current && typeof current === "object" && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

async function existingInvoiceSchemaObjects(db: Database): Promise<Set<string>> {
  const names = sql.join(APPOINTMENT_INVOICE_SCHEMA_OBJECTS.map(name => sql`${name}`), sql`, `);
  const result = await db.execute(sql`SELECT name FROM unnest(ARRAY[${names}]::text[]) AS name WHERE to_regclass(name) IS NOT NULL`);
  const rows = (result as { rows?: Array<{ name?: unknown }> }).rows ?? [];
  return new Set(rows.map(row => String(row.name)));
}

let invoiceSchemaReady: Promise<void> | null = null;

/**
 * Mémoïsé par instance ; un échec est réessayé au prochain appel. Lit d’abord ce
 * qui existe et n’exécute que la DDL manquante : quand tout existe (cas normal,
 * ou 0001 appliquée par le propriétaire), aucune DDL n’est envoyée, donc aucun
 * droit CREATE ni propriété de la table n’est nécessaire au rôle applicatif.
 * Une création concurrente par une autre instance compte comme une réussite
 * dès que l’objet existe.
 */
export function ensureInvoiceSchema(db: Database): Promise<void> {
  invoiceSchemaReady ??= (async () => {
    const existing = await existingInvoiceSchemaObjects(db);
    for (let index = 0; index < APPOINTMENT_INVOICE_DDL.length; index += 1) {
      const statement = APPOINTMENT_INVOICE_DDL[index]!;
      const name = APPOINTMENT_INVOICE_SCHEMA_OBJECTS[index]!;
      if (existing.has(name)) continue;
      try {
        await db.execute(statement);
      } catch (error) {
        if (!CONCURRENT_CREATION_CODES.has(postgresErrorCode(error) ?? "")) throw error;
        if (!(await existingInvoiceSchemaObjects(db)).has(name)) throw error;
      }
    }
  })().catch(error => {
    invoiceSchemaReady = null;
    throw error;
  });
  return invoiceSchemaReady;
}

/** Test seam: forget the memoised DDL run. */
export function resetInvoiceSchemaMemo() {
  invoiceSchemaReady = null;
}

function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && typeof current === "object" && depth < 4; depth += 1) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function findAppointmentInvoice(db: Database, appointmentId: number): Promise<AppointmentInvoiceRecord | null> {
  const [row] = await db
    .select({ invoiceNumber: appointmentInvoices.invoiceNumber, issuedAt: appointmentInvoices.issuedAt, paidAt: appointmentInvoices.paidAt })
    .from(appointmentInvoices)
    .where(eq(appointmentInvoices.appointmentId, appointmentId))
    .limit(1);
  return row ?? null;
}

/**
 * Factures déjà émises pour ces rendez-vous, par rendez-vous. N’attribue
 * aucun numéro : le tableau de bord affiche et régénère une facture existante
 * sans jamais en créer une (EXPL-02).
 */
export async function findAppointmentInvoices(appointmentIds: number[]): Promise<Map<number, AppointmentInvoiceRecord>> {
  if (appointmentIds.length === 0) return new Map();
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await ensureInvoiceSchema(db);
  const rows = await db
    .select({ appointmentId: appointmentInvoices.appointmentId, invoiceNumber: appointmentInvoices.invoiceNumber, issuedAt: appointmentInvoices.issuedAt, paidAt: appointmentInvoices.paidAt })
    .from(appointmentInvoices)
    .where(inArray(appointmentInvoices.appointmentId, appointmentIds));
  return new Map(rows.map(({ appointmentId, ...record }) => [appointmentId, record]));
}

/**
 * Attribue au rendez-vous payé son numéro de facture, une seule fois.
 * Les appels suivants (reprise du job, double livraison du webhook) relisent le
 * numéro, la date d’émission et la date de paiement déjà enregistrés : la
 * facture régénérée est identique. Deux attributions concurrentes ne peuvent
 * pas obtenir le même numéro (index unique série + rang) ; la perdante réessaie.
 */
export async function allocateAppointmentInvoice(input: {
  appointmentId: number;
  paidAt: Date;
  now?: Date;
}): Promise<AppointmentInvoiceRecord> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await ensureInvoiceSchema(db);

  const existing = await findAppointmentInvoice(db, input.appointmentId);
  if (existing) return existing;

  const issuedAt = input.now ?? new Date();
  const series = invoiceSeriesFor(issuedAt);
  for (let attempt = 1; attempt <= MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
    try {
      // Timestamps are passed as ISO-8601 UTC strings: PostgreSQL drops the
      // offset for `timestamp` columns, so the stored value is UTC whatever the
      // process time zone.
      await db.execute(sql`
        INSERT INTO "appointment_invoices" ("appointment_id", "invoice_series", "invoice_sequence", "invoice_number", "issued_at", "paid_at")
        SELECT ${input.appointmentId}, ${series}, next_value.sequence,
               ${series} || '-' || lpad(next_value.sequence::text, GREATEST(${INVOICE_SEQUENCE_DIGITS}, length(next_value.sequence::text)), '0'),
               ${issuedAt.toISOString()}, ${input.paidAt.toISOString()}
        FROM (
          SELECT COALESCE(MAX("invoice_sequence"), 0) + 1 AS sequence
          FROM "appointment_invoices"
          WHERE "invoice_series" = ${series}
        ) AS next_value
        ON CONFLICT ("appointment_id") DO NOTHING
      `);
    } catch (error) {
      if (isUniqueViolation(error) && attempt < MAX_ALLOCATION_ATTEMPTS) continue;
      throw error;
    }
    const allocated = await findAppointmentInvoice(db, input.appointmentId);
    if (allocated) return allocated;
  }
  throw new Error("invoice_number_allocation_failed");
}

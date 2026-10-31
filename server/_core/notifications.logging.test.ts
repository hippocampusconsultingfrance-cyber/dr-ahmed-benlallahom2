import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDrizzle } from "../testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "../testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

// Les journaux du serveur ne recopient jamais l’adresse d’un patient ou d’un
// candidat, que l’email parte ou soit refusé. Seul le transport Resend est simulé.
const state = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: vi.fn(() => ({ emails: { send: state.send } })) }));
vi.mock("../db", () => ({ getDb: async () => createInMemoryDrizzle() }));
vi.mock("./notification", async importOriginal => ({ ...await importOriginal<typeof import("./notification")>(), notifyOwner: vi.fn(async () => true) }));

const { postPaymentDeliveryRetry, sendConfirmationEmail, sendCvApplicationConfirmationEmail, sendInvoiceEmail, sendReminderEmail } = await import("./notifications");

const PATIENT = "zoe.patiente@example.test";
const CANDIDATE = "camille.candidate@example.test";
const accepted = { data: { id: "email_ok" }, error: null, headers: {} };
const refused = { data: null, error: { name: "validation_error", statusCode: 422, message: `Invalid \`to\` field: ${PATIENT}` }, headers: {} };

const sends = [
  () => sendConfirmationEmail(PATIENT, "Zoé", "APTLOG000001", new Date("2026-11-20T09:00:00Z"), 100, undefined, { idempotencyKey: "appointment-confirmation-APTLOG000001" }),
  () => sendInvoiceEmail(PATIENT, "Zoé", "APTLOG000001", 100, Buffer.from("%PDF-1.7"), "FAC-2026-000001", { idempotencyKey: "appointment-invoice-APTLOG000001" }),
  () => sendReminderEmail(PATIENT, "Zoé", "APTLOG000001", new Date("2026-11-20T09:00:00Z")),
  () => sendCvApplicationConfirmationEmail(CANDIDATE, "Camille", "CVLOG000000000001"),
];

let logs: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  state.send.mockReset();
  vi.stubEnv("RESEND_API_KEY", "re_test_notification_logging");
  postPaymentDeliveryRetry.delaysMs = [0, 0];
  logs = (["log", "info", "warn", "error"] as const).map(method => vi.spyOn(console, method).mockImplementation(() => undefined));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const logged = () => JSON.stringify(logs.flatMap(spy => spy.mock.calls), (_key, value) => value instanceof Error ? `${value.name}: ${value.message}` : value);

describe("journaux des emails aux patients et aux candidats", () => {
  it("ne journalisent pas le destinataire d’un email envoyé", async () => {
    state.send.mockResolvedValue(accepted);
    for (const send of sends) await send();

    expect(state.send).toHaveBeenCalledTimes(sends.length);
    expect(logs.some(spy => spy.mock.calls.length > 0)).toBe(true);
    expect(logged()).not.toContain(PATIENT);
    expect(logged()).not.toContain(CANDIDATE);
  });

  it("ne journalisent pas le destinataire d’un email refusé, et ne le disent pas envoyé", async () => {
    state.send.mockResolvedValue(refused);
    for (const send of sends.slice(0, 3)) await expect(send()).rejects.toThrow(/_email_failed$/);
    expect(await sends[3]()).toMatchObject({ status: "failed" });

    expect(logged()).not.toContain(PATIENT);
    expect(logged()).not.toContain(CANDIDATE);
    expect(logged()).not.toMatch(/sent successfully/);
  });
});

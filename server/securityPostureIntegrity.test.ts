import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appointmentFulfillmentJobs, appointments, candidateAccounts, candidateDocumentProcessingJobs, candidateDocuments, candidateSecurityRateLimits,
  candidateSessions, contactMessages, cvApplications, cvGoogleDriveExportJobs, cvProcessingJobs, gdprRequests, googleDriveConnections, medicalQuestions, securityEvents,
} from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";

// DATA-14 — le bilan quotidien signale chaque jour, tant qu’ils durent, les
// écarts de la base que les passages automatiques auraient dû réparer.
const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async (_payload: { title: string; content: string }) => true) }));

const { PAID_APPOINTMENT_JOB_RECOVERY_SINCE, runSecurityPostureReview } = await import("./scheduledJobs");
const { notifyOwner } = await import("./_core/notification");

const HOUR = 60 * 60 * 1000;
// Three days after the recovery went live.
const NOW = new Date(PAID_APPOINTMENT_JOB_RECOVERY_SINCE.getTime() + 72 * HOUR);
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);
let memory: MemoryPg;
const report = () => vi.mocked(notifyOwner).mock.calls.at(-1)?.[0].content ?? "";

function seedAppointment(id: number, createdAt: Date) {
  memory.seed(appointments, [{
    id, tracking_id: `APT-${id}`, customer_name: "Patient", customer_email: `p${id}@example.test`, customer_phone: "+33600000000", request_details: "Avis",
    appointment_date: new Date(NOW.getTime() + 240 * HOUR), base_price: "100.00", final_price: "100.00", payment_status: "completed", appointment_status: "confirmed", createdAt, updatedAt: createdAt,
  }]);
}

function seedDocument(id: number, createdAt: Date, extra: Record<string, unknown> = {}) {
  memory.seed(candidateDocuments, [{
    id, candidate_id: 1, category: "diploma", original_name: "diplome.pdf", storage_key: `k${id}`, mime_type: "application/pdf", size_bytes: 10, checksum: `c${id}`,
    status: "uploaded", analysis_status: "queued", created_at: createdAt, ...extra,
  }]);
}

beforeEach(() => {
  memory = createMemoryPg([
    appointments, appointmentFulfillmentJobs, candidateAccounts, candidateSessions, candidateDocuments, candidateDocumentProcessingJobs, cvProcessingJobs, cvGoogleDriveExportJobs,
    candidateSecurityRateLimits, securityEvents, contactMessages, gdprRequests, medicalQuestions, cvApplications, googleDriveConnections,
  ]);
  state.memory = memory;
  vi.mocked(notifyOwner).mockClear();
  memory.seed(candidateAccounts, [{ id: 1, email: "vera@example.test", password_hash: "x" }, { id: 2, email: "closed@example.test", password_hash: "x", status: "erased" }]);
});

describe("bilan quotidien : contrôle de cohérence de la base (DATA-14)", () => {
  it("ne signale rien pour une base cohérente, ni ce qu’un passage peut encore réparer", async () => {
    // Paid yesterday without its jobs: the next post-payment run gives them back.
    seedAppointment(1, ago(20));
    // Waiting with its job; waiting without one since this morning.
    seedDocument(1, ago(60));
    memory.seed(candidateDocumentProcessingJobs, [{ document_id: 1, status: "queued" }]);
    seedDocument(2, ago(10));
    // Running for 20 minutes (the next worker takes it back), on an open account.
    memory.seed(cvProcessingJobs, [{ application_id: 1, job_status: "running", started_at: ago(0.3) }]);
    memory.seed(candidateSessions, [{ candidate_id: 1, token_hash: "h1", expires_at: new Date(NOW.getTime() + HOUR) }, { candidate_id: 2, token_hash: "h2", expires_at: ago(1) }]);

    const review = await runSecurityPostureReview(NOW);

    expect(review).toMatchObject({ dataIntegrity: { paidAppointmentsWithoutJobs: 0, documentsWithoutJob: 0, interruptedJobs: 0, jobsWithUnknownStatus: 0, sessionsOfClosedAccounts: 0, sessionsWithoutAccount: 0 } });
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("signale les écarts que les passages automatiques n’ont pas réparés, et leur nombre", async () => {
    seedAppointment(1, ago(60));
    memory.seed(appointmentFulfillmentJobs, [{ appointment_id: 1, job_type: "owner", status: "completed" }, { appointment_id: 1, job_type: "confirmation", status: "completed" }]);
    // Before the recovery went live: never counted.
    seedAppointment(2, new Date(PAID_APPOINTMENT_JOB_RECOVERY_SINCE.getTime() - HOUR));
    seedDocument(1, ago(60));
    memory.seed(candidateDocumentProcessingJobs, [{ document_id: 1, status: "completed" }]);
    memory.seed(appointmentFulfillmentJobs, [{ appointment_id: 1, job_type: "invoice", status: "running", started_at: ago(50) }]);
    memory.seed(cvGoogleDriveExportJobs, [{ application_id: 3, status: "running", started_at: ago(49) }]);
    memory.seed(cvProcessingJobs, [{ application_id: 4, job_status: "queue" }]);
    memory.seed(candidateSessions, [{ candidate_id: 2, token_hash: "h1", expires_at: new Date(NOW.getTime() + HOUR) }, { candidate_id: 9, token_hash: "h2", expires_at: ago(1) }]);

    const review = await runSecurityPostureReview(NOW);

    // The invoice job left running counts as a job, not as missing.
    expect(review).toMatchObject({ dataIntegrity: { paidAppointmentsWithoutJobs: 0, documentsWithoutJob: 1, interruptedJobs: 2, jobsWithUnknownStatus: 1, sessionsOfClosedAccounts: 1, sessionsWithoutAccount: 1 } });
    expect(report()).toContain("Contrôle de cohérence de la base : 1 document(s) du coffre en attente d’analyse depuis plus de 2 jours sans tâche pour l’analyser ; 2 tâche(s) restée(s) « en cours » depuis plus de 2 jours");
    expect(report()).toContain("1 session(s) candidat dont le compte n’existe plus");
    expect(report()).toContain("collez scripts/db-invariants.sql dans l’éditeur SQL de Neon");
  });

  it("signale un rendez-vous payé depuis plus de 2 jours resté sans facture en file", async () => {
    seedAppointment(1, ago(60));
    memory.seed(appointmentFulfillmentJobs, [{ appointment_id: 1, job_type: "confirmation", status: "completed" }]);

    await expect(runSecurityPostureReview(NOW)).resolves.toMatchObject({ dataIntegrity: { paidAppointmentsWithoutJobs: 1 } });
    expect(report()).toContain("1 rendez-vous payé(s) depuis plus de 2 jours sans confirmation ou facture en file");
  });

  it("un contrôle en échec n’empêche pas les autres", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    memory.seed(candidateSessions, [{ candidate_id: 9, token_hash: "h2", expires_at: ago(1) }]);
    memory.failNext(/from "candidate_documents"/);

    await expect(runSecurityPostureReview(NOW)).resolves.toMatchObject({ dataIntegrity: { documentsWithoutJob: null, sessionsWithoutAccount: 1 } });
    expect(report()).toContain("1 session(s) candidat dont le compte n’existe plus");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointmentInvoices, appointments, contactMessages, gdprRequests, medicalQuestionAuditLogs, medicalQuestions } from "../drizzle/schema";
import { createMemoryPg, pgTimestamp, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// ADM-01 — les listes de l’admin ne s’arrêtent plus à 50 lignes : décalage et
// total côté serveur, file « À traiter » des questions santé, messages non lus.

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("./adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));

import { appRouter } from "./routers";

let memory: MemoryPg;

function caller() {
  return appRouter.createCaller({
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  });
}

const day = (index: number) => new Date(Date.UTC(2026, 6, 1 + index, 9));

function seedQuestion(index: number, status: string, extra: Record<string, unknown> = {}) {
  return memory.seed(medicalQuestions, [{
    tracking_id: `QMED-TEST${String(index).padStart(4, "0")}-00000`,
    first_name: `Patient${index}`,
    last_name: "Test",
    email: `patient${index}@test.local`,
    phone: "+33600000000",
    question: "Peut-on boire de l’eau avant une anesthésie générale programmée ?",
    status,
    created_at: day(index),
    ...extra,
  }])[0]!;
}

beforeEach(() => {
  memory = createMemoryPg([medicalQuestions, medicalQuestionAuditLogs, contactMessages, gdprRequests, appointments, appointmentFulfillmentJobs, appointmentInvoices]);
  state.memory = memory;
});

describe("ADM-01 — questions santé à traiter", () => {
  it("liste les nouvelles et les brouillons, de la plus ancienne à la plus récente, page par page avec le total", async () => {
    seedQuestion(5, "submitted");
    seedQuestion(1, "drafting");
    seedQuestion(3, "answered", { response_sent_at: day(4) });
    seedQuestion(2, "submitted");
    seedQuestion(4, "rejected");
    seedQuestion(6, "submitted");
    const admin = caller().medicalQuestions.admin;
    const queue = { statuses: ["submitted", "drafting"] as const, order: "oldest" as const, limit: 2 };

    const first = await admin.list({ ...queue, statuses: [...queue.statuses], offset: 0 });
    const second = await admin.list({ ...queue, statuses: [...queue.statuses], offset: 2 });

    expect(first.total).toBe(4);
    expect(first.items.map(item => item.firstName)).toEqual(["Patient1", "Patient2"]);
    expect(second.items.map(item => item.firstName)).toEqual(["Patient5", "Patient6"]);
    // The reference quoted by the owner notification is part of each row.
    expect(first.items[0]?.trackingId).toBe("QMED-TEST0001-00000");
    // Without filter: every question, newest first.
    const all = await admin.list();
    expect(all.total).toBe(6);
    expect(all.items[0]?.firstName).toBe("Patient6");
  });

  it("classe sans suite une question non répondue, la sort de la file et garde son journal", async () => {
    const pending = seedQuestion(1, "submitted");
    const answered = seedQuestion(2, "answered", { response_sent_at: day(3) });
    const admin = caller().medicalQuestions.admin;

    await expect(admin.reject({ id: pending.id as number })).resolves.toEqual({ success: true });

    expect(memory.rows(medicalQuestions).find(row => row.id === pending.id)).toMatchObject({ status: "rejected" });
    expect(memory.rows(medicalQuestionAuditLogs)).toEqual([expect.objectContaining({ medical_question_id: pending.id, action: "rejected", actor_open_id: "user_owner" })]);
    expect((await admin.list({ statuses: ["submitted", "drafting"], order: "oldest" })).total).toBe(0);
    expect((await admin.list({ statuses: ["rejected"] })).items.map(item => item.id)).toEqual([pending.id]);
    await expect(admin.reject({ id: answered.id as number })).rejects.toThrow("déjà reçu une réponse");
    expect(memory.rows(medicalQuestions).find(row => row.id === answered.id)).toMatchObject({ status: "answered" });

    // Saving a draft puts it back in the queue.
    await admin.saveDraft({ id: pending.id as number, adminResponse: "Information générale relue par le médecin, sans urgence." });
    expect((await admin.list({ statuses: ["submitted", "drafting"], order: "oldest" })).items.map(item => item.id)).toEqual([pending.id]);
  });

  it("ne classe pas une question répondue entre-temps, et ne journalise qu’une fois un double classement", async () => {
    const racing = seedQuestion(1, "drafting");
    const admin = caller().medicalQuestions.admin;
    // The reply is sent between the read and the update of « Classer sans suite ».
    const update = memory.db.update.bind(memory.db);
    vi.spyOn(memory.db, "update").mockImplementationOnce(table => {
      Object.assign(memory.rows(medicalQuestions).find(row => row.id === racing.id)!, { status: "answered", response_sent_at: pgTimestamp(day(2)) });
      return update(table);
    });

    await expect(admin.reject({ id: racing.id as number })).rejects.toThrow("déjà reçu une réponse");
    expect(memory.rows(medicalQuestions).find(row => row.id === racing.id)).toMatchObject({ status: "answered" });
    expect(memory.rows(medicalQuestionAuditLogs)).toEqual([]);

    const pending = seedQuestion(2, "submitted");
    await admin.reject({ id: pending.id as number });
    await expect(admin.reject({ id: pending.id as number })).resolves.toEqual({ success: true });
    expect(memory.rows(medicalQuestionAuditLogs).filter(row => row.action === "rejected")).toHaveLength(1);
  });
});

describe("ADM-01 — messages, RGPD et rendez-vous au-delà de 50", () => {
  it("filtre les messages non lus, avec le total du filtre et le décalage", async () => {
    memory.seed(contactMessages, Array.from({ length: 120 }, (_, index) => ({
      tracking_id: `CTEST${String(index).padStart(5, "0")}`,
      name: `Contact ${index}`,
      email: `contact${index}@test.local`,
      message: "Bonjour",
      read: index % 3 === 0 ? 0 : 1,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    })));
    const admin = caller().admin;

    const unread = await admin.contacts.list({ unreadOnly: true, limit: 30, offset: 0 });
    const unreadNext = await admin.contacts.list({ unreadOnly: true, limit: 30, offset: 30 });
    const all = await admin.contacts.list({ offset: 50 });

    expect(unread.total).toBe(40);
    expect(unread.items.every(item => item.read === 0)).toBe(true);
    expect(unread.items[0]?.name).toBe("Contact 117");
    expect(unreadNext.items).toHaveLength(10);
    expect(new Set([...unread.items, ...unreadNext.items].map(item => item.id)).size).toBe(40);
    expect(all.total).toBe(120);
    expect(all.items).toHaveLength(50);
    expect(all.items[0]?.name).toBe("Contact 69");
  });

  it("donne le total des demandes RGPD et des rendez-vous en nombre, pour « 50 sur N »", async () => {
    memory.seed(gdprRequests, Array.from({ length: 55 }, (_, index) => ({ tracking_id: `GTEST${index}`, name: "Demandeur", email: `rgpd${index}@test.local`, request_type: "access" })));
    memory.seed(appointments, Array.from({ length: 52 }, (_, index) => ({
      tracking_id: `APTPAGE${String(index).padStart(5, "0")}`, customer_name: "Patient", customer_email: "patient@test.local", customer_phone: "+33600000000",
      request_details: "Avis", appointment_date: day(index), base_price: "100.00", final_price: "100.00",
    })));
    const admin = caller().admin;
    // This in-memory database cannot run the invoice table check: the list
    // still answers, without invoice numbers.
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const gdpr = await admin.gdprRequests.list({ offset: 50 });
    const appointmentsPage = await admin.appointments.list({ offset: 50 });

    expect(gdpr).toMatchObject({ total: 55 });
    expect(gdpr.items).toHaveLength(5);
    expect(appointmentsPage).toMatchObject({ total: 52 });
    expect(appointmentsPage.items.map(item => item.invoiceNumber)).toEqual([null, null]);
    expect(logged).toHaveBeenCalledWith("[Admin] Issued invoices could not be read", expect.any(String));
    logged.mockRestore();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { medicalQuestionAuditLogs, medicalQuestions } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// ADM-23 — questions santé de l’administration : un brouillon s’enregistre
// quelle que soit sa longueur (jamais vide), les 20 caractères restant exigés
// pour l’envoi ; « Classer sans suite » garde un motif facultatif dans le
// journal de la question, sans email au patient, et la question classée le
// montre.

const state = vi.hoisted(() => ({
  memory: null as null | { db: unknown },
  responseEmails: 0,
}));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({
  ...(await importOriginal<typeof import("./adminMfa")>()),
  isAdminMfaVerified: vi.fn(async () => true),
}));
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(async () => true),
}));
vi.mock("./medicalQuestionEmails", async importOriginal => ({
  ...(await importOriginal<typeof import("./medicalQuestionEmails")>()),
  sendMedicalQuestionResponseEmail: vi.fn(async () => {
    state.responseEmails += 1;
  }),
  sendMedicalQuestionAcknowledgementEmail: vi.fn(async () => {
    state.responseEmails += 1;
  }),
}));

import { appRouter } from "./routers";

let memory: MemoryPg;

function admin() {
  return appRouter.createCaller({
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  }).medicalQuestions.admin;
}

function seedQuestion(status = "submitted") {
  return memory.seed(medicalQuestions, [
    {
      tracking_id: "QMED-TRIAGE01-00000",
      first_name: "Jeanne",
      last_name: "Martin",
      email: "jeanne@test.local",
      phone: "+33600000000",
      question:
        "Peut-on boire de l’eau avant une anesthésie générale programmée ?",
      status,
      created_at: new Date(Date.UTC(2026, 9, 1, 9)),
    },
  ])[0]!.id as number;
}

const journal = () =>
  memory.rows(medicalQuestionAuditLogs).map(row => ({
    action: row.action,
    metadata: row.metadata ? JSON.parse(String(row.metadata)) : null,
  }));

beforeEach(() => {
  memory = createMemoryPg([medicalQuestions, medicalQuestionAuditLogs]);
  state.memory = memory;
  state.responseEmails = 0;
});

describe("ADM-23 — brouillon d’une réponse", () => {
  it("enregistre un brouillon de quelques caractères et remet la question à traiter", async () => {
    const id = seedQuestion();
    await expect(
      admin().saveDraft({ id, adminResponse: "  À revoir  " })
    ).resolves.toEqual({ success: true });

    expect(memory.rows(medicalQuestions)[0]).toMatchObject({
      admin_response: "À revoir",
      status: "drafting",
    });
    expect(journal()).toEqual([{ action: "draft_saved", metadata: null }]);
  });

  it("refuse un brouillon vide ou fait d’espaces, sans rien écrire", async () => {
    const id = seedQuestion();
    await expect(
      admin().saveDraft({ id, adminResponse: "   " })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(memory.rows(medicalQuestions)[0]).toMatchObject({
      admin_response: null,
      status: "submitted",
    });
    expect(journal()).toEqual([]);
  });

  it("exige toujours 20 caractères pour envoyer la réponse, sans email ni écriture", async () => {
    const id = seedQuestion();
    await admin().saveDraft({ id, adminResponse: "À revoir" });
    await expect(
      admin().sendValidatedResponse({
        id,
        adminResponse: "Oui, 2 h avant.",
        publish: false,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(state.responseEmails).toBe(0);
    expect(memory.rows(medicalQuestions)[0]).toMatchObject({
      admin_response: "À revoir",
      status: "drafting",
      response_sent_at: null,
    });
  });
});

describe("ADM-23 — classement sans suite avec un motif", () => {
  it("écrit le motif choisi dans le journal de la question, sans email au patient", async () => {
    const id = seedQuestion("drafting");
    await expect(
      admin().reject({ id, reason: "urgence_redirigee" })
    ).resolves.toEqual({ success: true });

    expect(memory.rows(medicalQuestions)[0]).toMatchObject({
      status: "rejected",
    });
    expect(journal()).toEqual([
      {
        action: "rejected",
        metadata: { previousStatus: "drafting", reason: "urgence_redirigee" },
      },
    ]);
    expect(state.responseEmails).toBe(0);
  });

  it("classe sans motif comme avant, et refuse un motif inconnu sans rien écrire", async () => {
    const id = seedQuestion();
    await expect(
      admin().reject({ id, reason: "spam" as never })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(memory.rows(medicalQuestions)[0]).toMatchObject({
      status: "submitted",
    });
    expect(journal()).toEqual([]);

    await admin().reject({ id });
    expect(journal()).toEqual([
      { action: "rejected", metadata: { previousStatus: "submitted" } },
    ]);
  });

  it("montre sur la question classée le motif de son dernier classement, et aucun une fois remise à traiter", async () => {
    const id = seedQuestion();
    await admin().reject({ id, reason: "abusif" });
    await expect(admin().get({ id })).resolves.toMatchObject({
      status: "rejected",
      rejectionReason: "abusif",
    });

    // Back in the queue by a draft: the reason of the earlier filing is no longer shown.
    await admin().saveDraft({ id, adminResponse: "À revoir" });
    await expect(admin().get({ id })).resolves.toMatchObject({
      status: "drafting",
      rejectionReason: null,
    });

    // Filed again without a reason: the earlier one does not come back.
    await admin().reject({ id });
    await expect(admin().get({ id })).resolves.toMatchObject({
      status: "rejected",
      rejectionReason: null,
    });
    expect(journal().map(entry => entry.action)).toEqual([
      "rejected",
      "draft_saved",
      "rejected",
    ]);
  });
});

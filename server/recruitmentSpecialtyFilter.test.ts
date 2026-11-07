import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateAccounts, cvApplications, cvCandidateCertifications, cvCandidateLanguages, cvGoogleDriveExportJobs, recruitmentEmailEvents, recruitmentMatchProfiles } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// INTL-12 — les filtres Spécialité (Candidatures, profil de matching, vivier,
// audience d’une campagne) et Disponibilité (vivier) ignorent la casse et les
// accents, et un % ou un _ saisi ne vaut que lui-même.

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("./adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));

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

function seed(index: number, extra: Record<string, unknown> = {}) {
  return memory.seed(cvApplications, [{
    tracking_id: `CVSPEC${String(index).padStart(5, "0")}`, first_name: "Dr", last_name: `Candidat${index}`, email: `specialty${index}@test.local`, specialty: "Anesthésie-réanimation",
    target_countries: JSON.stringify(["Qatar"]), languages: JSON.stringify(["Français"]), cv_file_key: `recruitment/cv/${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf",
    cv_size_bytes: 1000, marketing_consent: 1, createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)), ...extra,
  }])[0]!;
}

const lastNames = (items: Array<{ lastName: string }>) => items.map(item => item.lastName).sort();

beforeEach(() => {
  memory = createMemoryPg([cvApplications, cvCandidateCertifications, cvCandidateLanguages, recruitmentMatchProfiles, candidateAccounts, cvGoogleDriveExportJobs, recruitmentEmailEvents]);
  state.memory = memory;
});

describe("INTL-12 — filtres Spécialité et Disponibilité sans accents ni casse", () => {
  beforeEach(() => {
    seed(1, { specialty: "Anesthésie-réanimation", availability: "Immédiate" });
    // Composed differently: « e » + a combining accent, as pasted from a PDF.
    seed(2, { specialty: "Anésthésie pédiatrique", availability: "Dans 3 mois" });
    seed(3, { specialty: "Médecine d’urgence", availability: "Immédiate" });
  });

  it("dans Candidatures, avec ou sans accents, et un % ou un _ ne vaut que lui-même", async () => {
    const found = async (specialty: string) => lastNames((await caller().admin.recruitment.list({ specialty })).items);
    for (const typed of ["anesthesie", "ANESTHÉSIE", "Anesthésie", "anésthésie"]) expect(await found(typed), typed).toEqual(["Candidat1", "Candidat2"]);
    expect(await found("medecine")).toEqual(["Candidat3"]);
    expect(await found("a%e")).toEqual([]);
    expect(await found("m_decine")).toEqual([]);
  });

  it("trouve « Médecine d’urgence » (apostrophe typographique du formulaire) tapé avec l’apostrophe du clavier, et l’inverse", async () => {
    const found = async (specialty: string) => lastNames((await caller().admin.recruitment.list({ specialty })).items);
    for (const typed of ["medecine d'urgence", "Médecine d’urgence", "MEDECINE D‘URGENCE", "medecine dʼurgence", "medecine d′urgence"]) expect(await found(typed), typed).toEqual(["Candidat3"]);
    expect(lastNames(await caller().admin.recruitment.pool.list({ specialty: "d'urgence" }))).toEqual(["Candidat3"]);
    seed(4, { specialty: "Médecine d'urgence", last_name: "Candidat4" });
    expect(await found("d’urgence")).toEqual(["Candidat3", "Candidat4"]);
    // The search box folds them the same way (« O'Brien » finds « O’Brien »).
    seed(5, { last_name: "O’Brien" });
    expect(lastNames((await caller().admin.recruitment.list({ search: "o'brien" })).items)).toEqual(["O’Brien"]);
  });

  it("par un profil de matching dont la spécialité est saisie sans accent", async () => {
    const [profile] = memory.seed(recruitmentMatchProfiles, [{ name: "Anesthésie", minimum_score: 0, specialty: "anesthesie", active: 1 }]);
    const { items, total } = await caller().admin.recruitment.list({ profileId: profile!.id as number });
    expect(lastNames(items)).toEqual(["Candidat1", "Candidat2"]);
    expect(total).toBe(2);
  });

  it("dans le vivier, et dans l’audience filtrée d’une campagne", async () => {
    expect(lastNames(await caller().admin.recruitment.pool.list({ specialty: "anesthesie" }))).toEqual(["Candidat1", "Candidat2"]);
    expect(lastNames(await caller().admin.recruitment.pool.list({ availability: "immediate" }))).toEqual(["Candidat1", "Candidat3"]);
    expect(lastNames(await caller().admin.recruitment.pool.list({ specialty: "a%e" }))).toEqual([]);
    expect(lastNames(await caller().admin.recruitment.campaigns.previewAudience({ mode: "filtered", specialty: "ANESTHESIE" }))).toEqual(["Candidat1", "Candidat2"]);
  });
});

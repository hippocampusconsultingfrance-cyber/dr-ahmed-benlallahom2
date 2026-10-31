import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateAccounts, cvApplications, cvCandidateCertifications, cvGoogleDriveExportJobs, recruitmentEmailEvents, recruitmentMatchProfiles } from "../drizzle/schema";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "./recruitmentAnalysis";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({
  ...await importOriginal<typeof import("./adminMfa")>(),
  isAdminMfaVerified: vi.fn(async () => true),
}));

import { appRouter } from "./routers";

let memory: MemoryPg;

function admin() {
  const ctx: TrpcContext = {
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

function seedCandidate(lastName: string, extra: Record<string, unknown>) {
  return memory.seed(cvApplications, [{
    tracking_id: `CVSCORE${lastName.toUpperCase()}`, first_name: "Dr", last_name: lastName, email: `${lastName.toLowerCase()}@test.local`, specialty: "Anesthésie-réanimation", target_countries: JSON.stringify(["Émirats arabes unis"]),
    cv_file_key: `recruitment/cv/${lastName}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, marketing_consent: 1, ...extra,
  }])[0]!;
}

describe("INTL-02 — un seuil de score n’écarte plus les dossiers sans score", () => {
  beforeEach(() => {
    memory = createMemoryPg([cvApplications, cvCandidateCertifications, recruitmentMatchProfiles, candidateAccounts, cvGoogleDriveExportJobs, recruitmentEmailEvents]);
    state.memory = memory;
    seedCandidate("Scored", { ai_score: 85, analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION, analysis_status: "completed" });
    seedCandidate("Below", { ai_score: 40, analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION, analysis_status: "completed" });
    // CV in British English analysed before the equivalents: no trustworthy score.
    seedCandidate("Unscored", { ai_score: null, ai_summary: "Consultant Anaesthetist", analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION, analysis_status: "needs_review" });
    seedCandidate("Pending", { ai_score: null, analysis_status: "queued" });
    // Scored by an older analysis version: shown as « Score à recalculer », not as 90.
    seedCandidate("Outdated", { ai_score: 90, analysis_prompt_version: "recruitment-v6", analysis_status: "completed" });
  });

  const names = (items: Array<{ lastName: string }>) => items.map(item => item.lastName).sort();

  it("garde, au-dessus du score IA minimum, les dossiers sans score vérifié et écarte seulement les scores plus bas", async () => {
    const result = await admin().admin.recruitment.list({ minimumScore: 80 });
    expect(names(result.items)).toEqual(["Outdated", "Pending", "Scored", "Unscored"]);
    expect(result.total).toBe(4);
    expect(result.items.find(item => item.lastName === "Outdated")?.aiScore).toBeNull();
  });

  it("un profil de matching au score minimum de 0 ne filtre pas par score ; au-dessus, il garde les dossiers sans score", async () => {
    const [open] = memory.seed(recruitmentMatchProfiles, [{ name: "Golfe – tout score", minimum_score: 0, specialty: "anesthésie", active: 1 }]);
    const [demanding] = memory.seed(recruitmentMatchProfiles, [{ name: "Golfe – 80+", minimum_score: 80, specialty: "anesthésie", active: 1 }]);

    expect(names((await admin().admin.recruitment.list({ profileId: open!.id as number })).items)).toEqual(["Below", "Outdated", "Pending", "Scored", "Unscored"]);
    expect(names((await admin().admin.recruitment.list({ profileId: demanding!.id as number })).items)).toEqual(["Outdated", "Pending", "Scored", "Unscored"]);
  });

  it("fait de même dans le vivier filtré par score minimum", async () => {
    expect(names(await admin().admin.recruitment.pool.list({ minimumScore: 80 }))).toEqual(["Outdated", "Pending", "Scored", "Unscored"]);
    expect(names(await admin().admin.recruitment.pool.list({ minimumScore: 0 }))).toEqual(["Below", "Outdated", "Pending", "Scored", "Unscored"]);
  });
});

describe("INTL-02 — les dossiers notés passent avant les dossiers sans score, même quand la liste est coupée", () => {
  beforeEach(() => {
    memory = createMemoryPg([cvApplications, cvCandidateCertifications, recruitmentMatchProfiles, candidateAccounts, cvGoogleDriveExportJobs, recruitmentEmailEvents]);
    state.memory = memory;
    // The scored dossiers are the oldest: sorted by date alone, the unscored ones would fill the first rows.
    seedCandidate("High", { ai_score: 92, analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION, createdAt: "2026-01-01 08:00:00" });
    seedCandidate("Good", { ai_score: 81, analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION, createdAt: "2026-01-02 08:00:00" });
    for (const [index, lastName] of ["Waiting", "Foreign", "Legacy"].entries()) {
      seedCandidate(lastName, { ai_score: lastName === "Legacy" ? 95 : null, analysis_prompt_version: lastName === "Legacy" ? "recruitment-v6" : RECRUITMENT_ANALYSIS_PROMPT_VERSION, createdAt: `2026-03-0${index + 1} 08:00:00` });
    }
  });

  it("le vivier trié par score garde les profils notés en tête quand il y a plus de profils sans score que la limite", async () => {
    expect((await admin().admin.recruitment.pool.list({ minimumScore: 80, limit: 2 })).map(item => item.lastName)).toEqual(["High", "Good"]);
    expect((await admin().admin.recruitment.pool.list({ minimumScore: 80 })).map(item => item.lastName)).toEqual(["High", "Good", "Legacy", "Foreign", "Waiting"]);
  });

  it("la liste des candidatures avec un score minimum montre tous les dossiers notés avant ceux sans score, d’une page à l’autre", async () => {
    const firstPage = await admin().admin.recruitment.list({ minimumScore: 80, limit: 2, offset: 0 });
    expect(firstPage.items.map(item => item.lastName)).toEqual(["Good", "High"]);
    expect((await admin().admin.recruitment.list({ minimumScore: 80, limit: 2, offset: 2 })).items.map(item => item.lastName)).toEqual(["Legacy", "Foreign"]);
    // Without a threshold the list stays in date order.
    expect((await admin().admin.recruitment.list({ limit: 2 })).items.map(item => item.lastName)).toEqual(["Legacy", "Foreign"]);
  });
});

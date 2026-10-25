import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateAccounts, cvApplications, cvGoogleDriveExportJobs, recruitmentEmailEvents, recruitmentMatchProfiles } from "../drizzle/schema";
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
    memory = createMemoryPg([cvApplications, recruitmentMatchProfiles, candidateAccounts, cvGoogleDriveExportJobs, recruitmentEmailEvents]);
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

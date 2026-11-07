import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { candidateAccounts, cvApplications, cvCandidateCertifications, cvCandidateLanguages, cvGoogleDriveExportJobs, recruitmentEmailEvents, recruitmentMatchProfiles } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// ADM-20 — la liste des candidatures n’envoie plus que ce que la carte affiche,
// et l’analyse du CV arrive à l’ouverture de la carte par une procédure à part.

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

const ANALYSIS = {
  ai_summary: "Lecture automatisée du CV : anesthésiste au bloc.",
  ai_strengths: JSON.stringify(["Expérience au bloc"]),
  ai_weaknesses: JSON.stringify(["Disponibilité à confirmer"]),
  ai_extracted_skills: JSON.stringify({ professionalTitle: "Anesthésiste", fieldEvidence: [{ field: "title", value: "Anesthésiste", evidence: "Anesthésiste-réanimateur, CHU" }] }),
  ai_match_reasoning: "Score calculé sur des faits trouvés dans le texte lu.",
  extraction_warnings: JSON.stringify(["low_text_density"]),
  normalized_experiences: JSON.stringify([{ role: "Anesthésiste", evidence: "Citation du CV" }]),
  normalized_languages: JSON.stringify([{ language: "French", evidence: "Français courant" }]),
};

function seed(index: number, extra: Record<string, unknown> = {}) {
  return memory.seed(cvApplications, [{
    tracking_id: `CVLIST${String(index).padStart(5, "0")}`, first_name: "Dr", last_name: `Candidat${index}`, email: `list${index}@test.local`, specialty: "Anesthésie-réanimation",
    target_countries: JSON.stringify(["Qatar"]), languages: JSON.stringify(["Français"]), cv_file_key: `recruitment/cv/${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf",
    cv_size_bytes: 1000, marketing_consent: 1, createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)), ...extra,
  }])[0]!;
}

const lastNames = (items: Array<{ lastName: string }>) => items.map(item => item.lastName).sort();

beforeEach(() => {
  memory = createMemoryPg([cvApplications, cvCandidateCertifications, cvCandidateLanguages, recruitmentMatchProfiles, candidateAccounts, cvGoogleDriveExportJobs, recruitmentEmailEvents]);
  state.memory = memory;
});

describe("ADM-20 — résumé dans la liste, analyse du CV à l’ouverture", () => {
  it("garde dans la liste ce que la carte affiche, sans l’analyse ni les lectures du CV", async () => {
    const analysed = seed(1, { ...ANALYSIS, ai_score: 82, analysis_status: "completed", message: "Disponible en janvier", admin_notes: "Rappeler lundi", phone: "+21651000010" });
    seed(2);
    const { items } = await caller().admin.recruitment.list({});
    const item = items.find(entry => entry.id === analysed.id)!;

    expect(item).toMatchObject({ firstName: "Dr", lastName: "Candidat1", specialty: "Anesthésie-réanimation", status: "new", analysisStatus: "completed", message: "Disponible en janvier", adminNotes: "Rappeler lundi", phone: "+21651000010", hasAiSummary: true });
    for (const field of ["aiSummary", "aiStrengths", "aiWeaknesses", "aiExtractedSkills", "aiMatchReasoning", "extractionWarnings", "normalizedExperiences", "normalizedLanguages", "normalizedCertifications"]) {
      expect(item, field).not.toHaveProperty(field);
    }
    expect(items.find(entry => entry.lastName === "Candidat2")).toMatchObject({ hasAiSummary: false });
  });

  it("donne l’analyse d’un dossier à l’ouverture de sa carte, et refuse un dossier inconnu", async () => {
    const analysed = seed(1, ANALYSIS);
    await expect(caller().admin.recruitment.detail({ id: analysed.id as number })).resolves.toEqual({
      id: analysed.id,
      aiSummary: ANALYSIS.ai_summary,
      aiStrengths: ANALYSIS.ai_strengths,
      aiWeaknesses: ANALYSIS.ai_weaknesses,
      aiExtractedSkills: ANALYSIS.ai_extracted_skills,
      aiMatchReasoning: ANALYSIS.ai_match_reasoning,
      extractionWarnings: ANALYSIS.extraction_warnings,
    });
    const missing = caller().admin.recruitment.detail({ id: 999 });
    await expect(missing).rejects.toBeInstanceOf(TRPCError);
    await expect(missing).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

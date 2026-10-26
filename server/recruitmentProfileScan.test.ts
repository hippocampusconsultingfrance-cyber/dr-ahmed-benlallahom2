import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateAccounts, cvApplications, cvCandidateCertifications, cvGoogleDriveExportJobs, recruitmentEmailEvents, recruitmentMatchProfiles } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// Candidatures filtrées par un profil de matching : les langues et compétences
// du profil sont vérifiées sur tous les dossiers retenus par les autres filtres,
// pas seulement sur les 1 000 premiers, et le total est exact. La borne de
// sécurité (abaissée ici à 1 100 dossiers) est signalée quand elle est atteinte.

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("./adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));
vi.mock("./recruitmentAudit", async importOriginal => ({ ...await importOriginal<typeof import("./recruitmentAudit")>(), RECRUITMENT_PROFILE_SCAN_LIMIT: 1_100 }));

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

/** Dossiers numbered from the oldest; the `arabic` first ones list Arabic among their languages. */
function seedCandidates(from: number, to: number, arabic: number) {
  memory.seed(cvApplications, Array.from({ length: to - from }, (_, offset) => {
    const index = from + offset;
    return {
      tracking_id: `CVSCAN${String(index).padStart(5, "0")}`, first_name: "Dr", last_name: `Candidat${index}`, email: `scan${index}@test.local`, specialty: "Anesthésie-réanimation",
      target_countries: JSON.stringify(["France"]), languages: JSON.stringify(index < arabic ? ["Français", "Arabe"] : ["Français"]),
      cv_file_key: `recruitment/cv/${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    };
  }));
}

let profileId = 0;

beforeEach(() => {
  memory = createMemoryPg([cvApplications, cvCandidateCertifications, recruitmentMatchProfiles, candidateAccounts, cvGoogleDriveExportJobs, recruitmentEmailEvents]);
  state.memory = memory;
  profileId = memory.seed(recruitmentMatchProfiles, [{ name: "Anesthésie arabophone", minimum_score: 0, specialty: "anesthésie", target_country: "France", required_languages: JSON.stringify(["arabe"]), active: 1 }])[0]!.id as number;
});

const lastNames = (items: Array<{ lastName: string }>) => items.map(item => item.lastName);

describe("Candidatures — profil de matching au-delà des 1 000 premiers dossiers", () => {
  it("vérifie le profil sur tous les dossiers et donne le total exact, page par page", async () => {
    // 1 030 dossiers: the 30 Arabic speakers are the oldest, after the first 1 000 of the list.
    seedCandidates(0, 1_030, 30);
    const list = caller().admin.recruitment.list;

    const first = await list({ profileId, limit: 20, offset: 0 });
    const second = await list({ profileId, limit: 20, offset: 20 });

    expect(first.total).toBe(30);
    expect(second.total).toBe(30);
    expect(lastNames(first.items)).toEqual(Array.from({ length: 20 }, (_, index) => `Candidat${29 - index}`));
    expect(lastNames(second.items)).toEqual(Array.from({ length: 10 }, (_, index) => `Candidat${9 - index}`));
    expect(first).not.toHaveProperty("profileScanLimit");

    // With the search, the same dossiers; without profile, every dossier.
    expect((await list({ profileId, search: "candidat7" })).items.map(item => item.lastName).sort()).toEqual(["Candidat7"]);
    expect((await list({ limit: 1 })).total).toBe(1_030);
  });

  it("vérifie les compétences lues par l’IA quand le profil en exige", async () => {
    seedCandidates(0, 3, 3);
    memory.rows(cvApplications)[1]!.ai_extracted_skills = JSON.stringify({ verifiedSkills: ["Échographie cardiaque"] });
    const [skilled] = memory.seed(recruitmentMatchProfiles, [{ name: "Échographie", minimum_score: 0, required_skills: JSON.stringify(["échographie"]), active: 1 }]);

    const result = await caller().admin.recruitment.list({ profileId: skilled!.id as number });

    expect(lastNames(result.items)).toEqual(["Candidat1"]);
    expect(result.total).toBe(1);
  });

  it("dit que le profil n’a porté que sur les premiers dossiers quand la borne de sécurité est atteinte", async () => {
    seedCandidates(0, 1_130, 30);

    const limited = await caller().admin.recruitment.list({ profileId });

    // The 30 Arabic speakers are past the first 1 100 dossiers: not found, and the answer says why.
    expect(limited).toMatchObject({ items: [], total: 0, profileScanLimit: 1_100 });
    // Another filter narrows the dossiers checked under the bound: the signal goes.
    const narrowed = await caller().admin.recruitment.list({ profileId, search: "candidat1" });
    expect(narrowed).not.toHaveProperty("profileScanLimit");
    expect(narrowed.total).toBe(11);
  });
});

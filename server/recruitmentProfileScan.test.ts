import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateAccounts, clientBriefCandidates, clientBriefs, cvApplications, cvCandidateCertifications, cvCandidateLanguages, cvGoogleDriveExportJobs, recruitmentEmailEvents, recruitmentMatchProfiles } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "./recruitmentAnalysis";

// Candidatures filtrées par un profil de matching : les langues et compétences
// du profil sont vérifiées sur tous les dossiers retenus par les autres filtres,
// pas seulement sur les 1 000 premiers, et le total est exact. La borne de
// sécurité (abaissée ici à 1 100 dossiers) est signalée quand elle est atteinte.
// Le pays cible et les langues du profil se comparent comme les filtres de la
// liste, accents et casse à part.

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
  memory = createMemoryPg([cvApplications, cvCandidateCertifications, cvCandidateLanguages, recruitmentMatchProfiles, candidateAccounts, cvGoogleDriveExportJobs, recruitmentEmailEvents, clientBriefs, clientBriefCandidates]);
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

describe("Candidatures — profil de matching et filtres de la liste (IA-02)", () => {
  it("garde les dossiers que les filtres de la liste trouvent, accents et casse à part (IA-02)", async () => {
    const dossiers = [
      { lastName: "Golfe", countries: ["Émirats arabes unis"], languages: ["Français", "Anglais"] },
      { lastName: "Doha", countries: ["Qatar"], languages: ["Français"] },
      { lastName: "Dubai", countries: ["Émirats arabes unis"], languages: ["Anglais"] },
    ];
    memory.seed(cvApplications, dossiers.map(({ lastName, countries, languages }, index) => ({
      tracking_id: `CVFOLD${index}`, first_name: "Dr", last_name: lastName, email: `fold${index}@test.local`, specialty: "Anesthésie-réanimation",
      target_countries: JSON.stringify(countries), languages: JSON.stringify(languages),
      cv_file_key: `recruitment/cv/fold${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000,
    })));
    const [gulf] = memory.seed(recruitmentMatchProfiles, [{ name: "Golfe francophone", minimum_score: 0, target_country: "emirats", required_languages: JSON.stringify(["FRANCAIS"]), active: 1 }]);
    const [written] = memory.seed(recruitmentMatchProfiles, [{ name: "Émirats", minimum_score: 0, target_country: "Emirats arabes unis", required_languages: JSON.stringify(["francais"]), active: 1 }]);

    // The dossier the Pays cible and Langue filters find, the profile keeps too.
    expect(lastNames((await caller().admin.recruitment.list({ country: "emirats", language: "FRANCAIS" })).items)).toEqual(["Golfe"]);
    for (const profile of [gulf, written]) {
      const result = await caller().admin.recruitment.list({ profileId: profile!.id as number });
      expect(lastNames(result.items)).toEqual(["Golfe"]);
      expect(result.total).toBe(1);
    }
  });

  it("garde les dossiers dont le formulaire a enregistré les langues en anglais, et ceux dont le CV les donne, comme le filtre « Langue » (IA-02)", async () => {
    const dossier = (lastName: string, index: number, extra: Record<string, unknown> = {}) => ({
      tracking_id: `CVLANG${index}`, first_name: "Dr", last_name: lastName, email: `lang${index}@test.local`, specialty: "Anesthésie-réanimation",
      target_countries: JSON.stringify(["Émirats arabes unis"]), languages: "[]",
      cv_file_key: `recruitment/cv/lang${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, ...extra,
    });
    const readInCv = JSON.stringify([{ language: "Français", proficiency: "native", evidence: "Langues : français", sourceLocation: "page 1", confidence: 90, evidenceVerified: true }]);
    const [, , , readCurrent, readOlder] = memory.seed(cvApplications, [
      // From its French page as from its English one, the form records « French », « Arabic ».
      dossier("Formfr", 0, { languages: JSON.stringify(["French", "Arabic"]), language: "fr" }),
      dossier("Formen", 1, { languages: JSON.stringify(["French", "Arabic"]), language: "en" }),
      dossier("Anglophone", 2, { languages: JSON.stringify(["English"]) }),
      // Nothing declared: French read in the CV by an analysis of the current version, then of an older one.
      dossier("LuDansLeCv", 3, { normalized_languages: readInCv, analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION }),
      dossier("AncienneAnalyse", 4, { normalized_languages: readInCv, analysis_prompt_version: "ancienne-version" }),
    ]);
    // The analysis stores each language it reads as a row too, in the same batch.
    memory.seed(cvCandidateLanguages, [readCurrent, readOlder].map(application => ({ application_id: application!.id, language: "Français", evidence: "Langues : français", source: "extracted" })));
    const profiled = async (requiredLanguages: string[]) => {
      const [profile] = memory.seed(recruitmentMatchProfiles, [{ name: requiredLanguages.join(" + "), minimum_score: 0, required_languages: JSON.stringify(requiredLanguages), active: 1 }]);
      const result = await caller().admin.recruitment.list({ profileId: profile!.id as number });
      expect(result.total).toBe(result.items.length);
      return lastNames(result.items).sort();
    };
    const filtered = async (language: string) => lastNames((await caller().admin.recruitment.list({ language })).items).sort();

    for (const required of [["Français"], ["francais"], ["French"], ["Französisch"]]) expect(await profiled(required)).toEqual(["Formen", "Formfr", "LuDansLeCv"]);
    for (const required of [["arabe"], ["Français", "Arabe"], ["العربية"]]) expect(await profiled(required)).toEqual(["Formen", "Formfr"]);
    expect(await profiled(["Anglais"])).toEqual(["Anglophone"]);
    expect(await profiled(["Français", "Anglais"])).toEqual([]);
    // The Langue filter finds the same dossiers, whatever the name typed.
    for (const language of ["Français", "francais", "法语"]) expect(await filtered(language)).toEqual(["Formen", "Formfr", "LuDansLeCv"]);
    for (const language of ["arabe", "Arabisch", "阿拉伯语"]) expect(await filtered(language)).toEqual(["Formen", "Formfr"]);
    expect(await filtered("anglais")).toEqual(["Anglophone"]);
  });

  it("garde, pour un filtre « Langue » qui nomme plusieurs langues, les dossiers qui les ont toutes, comme un profil (IA-02)", async () => {
    memory.seed(cvApplications, [["Bilingue", ["English", "Arabic"]], ["Arabophone", ["Arabic"]], ["Anglophone", ["English"]], ["Francophone", ["French"]]].map(([lastName, languages], index) => ({
      tracking_id: `CVBOTH${index}`, first_name: "Dr", last_name: lastName as string, email: `both${index}@test.local`, specialty: "Anesthésie-réanimation",
      target_countries: JSON.stringify(["France"]), languages: JSON.stringify(languages),
      cv_file_key: `recruitment/cv/both${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000,
    })));
    const filtered = async (language: string) => lastNames((await caller().admin.recruitment.list({ language })).items).sort();
    const [profile] = memory.seed(recruitmentMatchProfiles, [{ name: "Anglais et arabe", minimum_score: 0, required_languages: JSON.stringify(["anglais, arabe"]), active: 1 }]);

    for (const language of ["anglais, arabe", "Anglais et arabe", "English Arabic"]) expect(await filtered(language), language).toEqual(["Bilingue"]);
    expect(lastNames((await caller().admin.recruitment.list({ profileId: profile!.id as number })).items)).toEqual(["Bilingue"]);
    expect(await filtered("arabe")).toEqual(["Arabophone", "Bilingue"]);
  });

  it("compare des langues entières, jamais les citations du CV, et garde les mêmes dossiers que le profil et la mission (IA-02)", async () => {
    const dossier = (lastName: string, languages: string[]) => ({
      tracking_id: `CVWHOLE${lastName}`, first_name: "Dr", last_name: lastName, email: `${lastName.toLowerCase()}@test.local`, specialty: "Anesthésie-réanimation",
      target_countries: JSON.stringify(["Émirats arabes unis"]), languages: JSON.stringify(languages), analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION,
      cv_file_key: `recruitment/cv/${lastName}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000,
    });
    const [polished, , , cvArabic, , , unknown] = memory.seed(cvApplications, [
      dossier("Polished", ["English (polished)"]),
      dossier("Germanyonly", ["Germany"]),
      dossier("Deutschdecl", ["Deutsch"]),
      dossier("Cvarabisch", ["English"]),
      dossier("Enarboth", ["English", "Arabic"]),
      dossier("Anglaisseul", ["Anglais"]),
      dossier("Wolofcourant", ["French"]),
    ]);
    // What an analysis read in the CV: the language, its quote apart (« lived in Germany »).
    const read = (application: typeof polished, language: string, evidence: string) => ({ application_id: application!.id, language, evidence, source: "extracted" });
    memory.seed(cvCandidateLanguages, [read(polished, "English", "English (polished), lived in Germany"), read(cvArabic, "Arabisch", "Arabisch fließend"), read(unknown, "Wolof courant", "Wolof courant")]);
    for (const [application, languages] of [[polished, ["English"]], [cvArabic, ["Arabisch"]], [unknown, ["Wolof courant"]]] as const) {
      application!.normalized_languages = JSON.stringify(languages.map(language => ({ language, proficiency: "fluent", evidence: `${language}, lived in Germany`, evidenceVerified: true })));
    }
    // The dossier names of a filter, of a profile requiring the term, and of a mission giving all its language points.
    const filtered = async (language: string) => lastNames((await caller().admin.recruitment.list({ language })).items).sort();
    const profiled = async (language: string) => {
      const [profile] = memory.seed(recruitmentMatchProfiles, [{ name: language, minimum_score: 0, required_languages: JSON.stringify([language]), active: 1 }]);
      return lastNames((await caller().admin.recruitment.list({ profileId: profile!.id as number })).items).sort();
    };
    const missioned = async (language: string) => {
      const [brief] = memory.seed(clientBriefs, [{ brief_id: `BRIEF-${memory.rows(clientBriefs).length}`, organization_name: "Hôpital", contact_name: "RH", email: "rh@test.local", target_environment: "Hôpital", specialty_needed: "Anesthésie-réanimation", country: "Émirats arabes unis", required_languages: language }]);
      const result = await caller().admin.clientBriefs.candidates({ briefId: brief!.id as number, limit: 50 });
      return result.candidates.filter(candidate => candidate.match.breakdown.languages === 15).map(candidate => candidate.lastName).sort();
    };

    const expected: Array<[string, string[]]> = [
      ["polonais", []], ["Polish", []],
      ["allemand", ["Deutschdecl"]], ["German", ["Deutschdecl"]], ["Deutsch", ["Deutschdecl"]],
      ["anglais, arabe", ["Cvarabisch", "Enarboth"]], ["Anglais/Arabe", ["Cvarabisch", "Enarboth"]], ["anglais et arabe", ["Cvarabisch", "Enarboth"]],
      ["arabe", ["Cvarabisch", "Enarboth"]],
      // A language the table does not know: its words, whole, among the languages and not their quotes,
      // or the words of one of these languages whole in the term, what it says between brackets aside.
      ["wolof", ["Wolofcourant"]], ["germany", ["Germanyonly"]], ["lived", []], ["Wolof (natif)", ["Wolofcourant"]], ["wolof courant", ["Wolofcourant"]],
      // A choice: any one of its languages.
      ["anglais ou arabe", ["Anglaisseul", "Cvarabisch", "Enarboth", "Polished"]], ["Allemand et/ou wolof", ["Deutschdecl", "Wolofcourant"]],
      // What follows a dash qualifies the language before it, unless it names a language, of the table or not.
      ["Anglais – obligatoire", ["Anglaisseul", "Cvarabisch", "Enarboth", "Polished"]], ["English – required", ["Anglaisseul", "Cvarabisch", "Enarboth", "Polished"]],
      ["英语 – 必须", ["Anglaisseul", "Cvarabisch", "Enarboth", "Polished"]], ["Deutsch – erforderlich", ["Deutschdecl"]],
      ["Arabe – Golfe", ["Cvarabisch", "Enarboth"]], ["Anglais – obligatoire, Arabe – souhaité", ["Cvarabisch", "Enarboth"]],
      ["Wolof – Anglais", []], ["Serbo-croate – Anglais", []], ["Wolof – Français", ["Wolofcourant"]],
      // Also a language outside the table under its usual name, which Intl.DisplayNames gives otherwise
      // (Twi: « Akan », Luganda: « Ganda ») or has no ISO 639-1 code (Cantonese, Dari): before, it qualified English.
      ["Cantonais – Anglais", []], ["粤语 – 英语", []], ["Twi – English", []], ["Luganda – English", []], ["Sotho – English", []],
      ["Dari – Anglais", []], ["Créole – Français", []], ["Cantonais / Anglais", []],
    ];
    for (const [language, names] of expected) {
      expect(await filtered(language), `filtre ${language}`).toEqual(names);
      expect(await profiled(language), `profil ${language}`).toEqual(names);
      expect(await missioned(language), `mission ${language}`).toEqual(names);
    }

    // As the admin types, the filter finds a language from the third letter of one of its names,
    // where a profile or a mission requires the name whole; a term with no letter finds nothing.
    for (const language of ["angl", "Engl", "anglais"]) expect(await filtered(language), language).toEqual(["Anglaisseul", "Cvarabisch", "Enarboth", "Polished"]);
    expect(await filtered("arab")).toEqual(["Cvarabisch", "Enarboth"]);
    expect(await filtered("angl, arab")).toEqual(["Cvarabisch", "Enarboth"]);
    expect(await filtered("pol")).toEqual([]);
    expect(await profiled("angl")).toEqual([]);
    for (const language of ["-", "()", "an"]) expect(await filtered(language), language).toEqual([]);
  });

  it("reconnaît une langue hors table sous chacun de ses noms, déclarée dans la langue de la page : le profil, la mission et le filtre Langue la comparent par son code (IA-02)", async () => {
    const dossier = (lastName: string, languages: string[]) => ({
      tracking_id: `CVCODE${lastName}`, first_name: "Dr", last_name: lastName, email: `${lastName.toLowerCase()}@test.local`, specialty: "Anesthésie-réanimation",
      target_countries: JSON.stringify(["Émirats arabes unis"]), languages: JSON.stringify(languages), analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION,
      cv_file_key: `recruitment/cv/${lastName}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000,
    });
    // The form records « Other language: Cantonese » in English; the admin writes the mission in French.
    memory.seed(cvApplications, [
      dossier("Cantonese", ["English", "Cantonese"]),
      dossier("Yueyu", ["English", "粤语"]),
      dossier("Cantonais", ["English", "Cantonais"]),
      dossier("Chinacanto", ["Chinese", "Cantonese"]),
      dossier("Gaelic", ["English", "Gaelic"]),
      dossier("Frisian", ["English", "Frisian"]),
      dossier("Dyula", ["French", "Dyula"]),
      dossier("Englishonly", ["English"]),
    ]);
    const filtered = async (language: string) => lastNames((await caller().admin.recruitment.list({ language })).items).sort();
    const profiled = async (language: string) => {
      const [profile] = memory.seed(recruitmentMatchProfiles, [{ name: language, minimum_score: 0, required_languages: JSON.stringify([language]), active: 1 }]);
      return lastNames((await caller().admin.recruitment.list({ profileId: profile!.id as number })).items).sort();
    };
    const missioned = async (language: string) => {
      const [brief] = memory.seed(clientBriefs, [{ brief_id: `BRIEF-CODE-${memory.rows(clientBriefs).length}`, organization_name: "Hôpital", contact_name: "RH", email: "rh@test.local", target_environment: "Hôpital", specialty_needed: "Anesthésie-réanimation", country: "Émirats arabes unis", required_languages: language }]);
      const result = await caller().admin.clientBriefs.candidates({ briefId: brief!.id as number, limit: 50 });
      return result.candidates.filter(candidate => candidate.match.breakdown.languages === 15).map(candidate => candidate.lastName).sort();
    };
    // Before: only « Cantonais » written in French met « Cantonais – Anglais »; the others had 8 language points of 15.
    const expected: Array<[string, string[]]> = [
      ["Cantonais – Anglais", ["Cantonais", "Cantonese", "Yueyu"]], ["Cantonais / Anglais", ["Cantonais", "Cantonese", "Yueyu"]],
      ["Chinois – Cantonais", ["Chinacanto"]], ["Gaélique – Anglais", ["Gaelic"]], ["Frison – Anglais", ["Frisian"]], ["Dioula – Français", ["Dyula"]],
    ];
    for (const [language, names] of expected) {
      expect(await filtered(language), `filtre ${language}`).toEqual(names);
      expect(await profiled(language), `profil ${language}`).toEqual(names);
      expect(await missioned(language), `mission ${language}`).toEqual(names);
    }
  });

  it("reconnaît une langue hors table sous ses noms usuels et une macrolangue par chacun de ses membres : le profil, la mission et le filtre Langue (IA02-R3-NOMS-BIS)", async () => {
    const dossier = (lastName: string, languages: string[]) => ({
      tracking_id: `CVNAME${lastName}`, first_name: "Dr", last_name: lastName, email: `${lastName.toLowerCase()}@test.local`, specialty: "Anesthésie-réanimation",
      target_countries: JSON.stringify(["Émirats arabes unis"]), languages: JSON.stringify(languages), analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION,
      cv_file_key: `recruitment/cv/${lastName}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000,
    });
    memory.seed(cvApplications, [
      dossier("Sorani", ["English", "Sorani"]), dossier("Kurmanji", ["English", "Kurmanji"]), dossier("Serbian", ["English", "Serbian"]),
      dossier("Bosnian", ["English", "Bosnian"]), dossier("Pushto", ["English", "Pushto"]), dossier("Kabyle", ["French", "Kabyle"]),
      dossier("Fulani", ["French", "Fulani"]), dossier("Englishonly", ["English"]), dossier("Frenchonly", ["French"]),
    ]);
    const filtered = async (language: string) => lastNames((await caller().admin.recruitment.list({ language })).items).sort();
    const profiled = async (language: string) => {
      const [profile] = memory.seed(recruitmentMatchProfiles, [{ name: language, minimum_score: 0, required_languages: JSON.stringify([language]), active: 1 }]);
      return lastNames((await caller().admin.recruitment.list({ profileId: profile!.id as number })).items).sort();
    };
    const missioned = async (language: string) => {
      const [brief] = memory.seed(clientBriefs, [{ brief_id: `BRIEF-NAME-${memory.rows(clientBriefs).length}`, organization_name: "Hôpital", contact_name: "RH", email: "rh@test.local", target_environment: "Hôpital", specialty_needed: "Anesthésie-réanimation", country: "Émirats arabes unis", required_languages: language }]);
      const result = await caller().admin.clientBriefs.candidates({ briefId: brief!.id as number, limit: 50 });
      return result.candidates.filter(candidate => candidate.match.breakdown.languages === 15).map(candidate => candidate.lastName).sort();
    };
    // Before (ddcc047): 8 language points of 15, neither the profile nor the filter, for each of these candidates.
    const expected: Array<[string, string[]]> = [
      ["Kurde – Anglais", ["Kurmanji", "Sorani"]], ["Serbo-croate – Anglais", ["Bosnian", "Serbian"]], ["Pachto – Anglais", ["Pushto"]],
      ["Berbère – Français", ["Kabyle"]], ["Peul – Français", ["Fulani"]],
    ];
    for (const [language, names] of expected) {
      expect(await filtered(language), `filtre ${language}`).toEqual(names);
      expect(await profiled(language), `profil ${language}`).toEqual(names);
      expect(await missioned(language), `mission ${language}`).toEqual(names);
    }
  });

  it("garde comme exigence une langue écrite avec d’autres mots après les lieux qu’un tiret ouvre : la mission, le profil saisi avec des virgules et le filtre Langue (IA02-R6-LANGUE-APRES-LIEUX)", async () => {
    const dossier = (lastName: string, languages: string[]) => ({
      tracking_id: `CVPLACE${lastName}`, first_name: "Dr", last_name: lastName, email: `${lastName.toLowerCase()}@test.local`, specialty: "Anesthésie-réanimation",
      target_countries: JSON.stringify(["Émirats arabes unis"]), languages: JSON.stringify(languages), analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION,
      cv_file_key: `recruitment/cv/${lastName}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000,
    });
    memory.seed(cvApplications, [
      dossier("Francophone", ["Français"]), dossier("Creolophone", ["Français", "Créole martiniquais"]),
      dossier("Anglophone", ["English"]), dossier("Swahiliphone", ["English", "Swahili"]), dossier("Tagalophone", ["English", "Tagalog"]),
    ]);
    const filtered = async (language: string) => lastNames((await caller().admin.recruitment.list({ language })).items).sort();
    // The page splits a profile's languages at its commas.
    const profiled = async (language: string) => {
      const [profile] = memory.seed(recruitmentMatchProfiles, [{ name: language, minimum_score: 0, required_languages: JSON.stringify(language.split(",").map(term => term.trim())), active: 1 }]);
      return lastNames((await caller().admin.recruitment.list({ profileId: profile!.id as number })).items).sort();
    };
    const missioned = async (language: string) => {
      const [brief] = memory.seed(clientBriefs, [{ brief_id: `BRIEF-PLACE-${memory.rows(clientBriefs).length}`, organization_name: "Hôpital", contact_name: "RH", email: "rh@test.local", target_environment: "Hôpital", specialty_needed: "Anesthésie-réanimation", country: "Émirats arabes unis", required_languages: language }]);
      const result = await caller().admin.clientBriefs.candidates({ briefId: brief!.id as number, limit: 50 });
      return result.candidates.filter(candidate => candidate.match.breakdown.languages === 15).map(candidate => candidate.lastName).sort();
    };
    // Before (b1544cf): Francophone and Anglophone met these requirements whole (15 language points of 15, the profile and the filter).
    const expected: Array<[string, string[]]> = [
      ["Français – Martinique, créole martiniquais", ["Creolophone"]],
      ["Anglais – Dubaï, swahili pour les patients", ["Swahiliphone"]],
      ["English – Dubai, Tagalog for patient communication", ["Tagalophone"]],
      // The places a dash opened, words no list knows, still qualify the language at their head.
      ["Anglais – Riyad, Dubaï", ["Anglophone", "Swahiliphone", "Tagalophone"]],
    ];
    for (const [language, names] of expected) {
      expect(await filtered(language), `filtre ${language}`).toEqual(names);
      expect(await profiled(language), `profil ${language}`).toEqual(names);
      expect(await missioned(language), `mission ${language}`).toEqual(names);
    }
  });

  it("lit les mêmes mots de qualification dans les quatre langues, les autres noms d’une langue de la table et une partie qui a son propre tiret comme une exigence : la mission, le profil saisi avec des virgules et le filtre Langue (IA02-R7)", async () => {
    const dossier = (lastName: string, languages: string[]) => ({
      tracking_id: `CVQUAL${lastName}`, first_name: "Dr", last_name: lastName, email: `${lastName.toLowerCase()}@test.local`, specialty: "Anesthésie-réanimation",
      target_countries: JSON.stringify(["Émirats arabes unis"]), languages: JSON.stringify(languages), analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION,
      cv_file_key: `recruitment/cv/${lastName}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000,
    });
    memory.seed(cvApplications, [
      dossier("Anglophone", ["English"]), dossier("Darijaphone", ["English", "Darija"]), dossier("Teochewphone", ["English", "Teochew"]),
      dossier("Shanghaiphone", ["English", "上海话"]), dossier("Hispanophone", ["English", "Spanish"]),
      dossier("Arabromani", ["Arabic", "Romani"]), dossier("Arabwolofromani", ["Arabic", "Wolof", "Romani"]),
    ]);
    const filtered = async (language: string) => lastNames((await caller().admin.recruitment.list({ language })).items).sort();
    // The page splits a profile's languages at its commas.
    const profiled = async (language: string) => {
      const [profile] = memory.seed(recruitmentMatchProfiles, [{ name: language, minimum_score: 0, required_languages: JSON.stringify(language.split(",").map(term => term.trim())), active: 1 }]);
      return lastNames((await caller().admin.recruitment.list({ profileId: profile!.id as number })).items).sort();
    };
    const missioned = async (language: string) => {
      const [brief] = memory.seed(clientBriefs, [{ brief_id: `BRIEF-QUAL-${memory.rows(clientBriefs).length}`, organization_name: "Hôpital", contact_name: "RH", email: "rh@test.local", target_environment: "Hôpital", specialty_needed: "Anesthésie-réanimation", country: "Émirats arabes unis", required_languages: language }]);
      const result = await caller().admin.clientBriefs.candidates({ briefId: brief!.id as number, limit: 50 });
      return result.candidates.filter(candidate => candidate.match.breakdown.languages === 15).map(candidate => candidate.lastName).sort();
    };
    // Before (daf844a): Anglophone, or Arabromani, met these requirements whole (15 language points of 15, the profile and the filter).
    const expected: Array<[string, string[]]> = [
      ["English – read, written, spoken, Darija", ["Darijaphone"]],
      ["Englisch – gelesen, geschrieben, gesprochen, Darija", ["Darijaphone"]],
      ["English – two years, Teochew", ["Teochewphone"]],
      ["英语 – 两年以上，上海话", ["Shanghaiphone"]],
      ["English – Dubai, Castilian", ["Hispanophone"]],
      ["Arabe – courant ; Wolof – Dakar ; Romani – notions", ["Arabwolofromani"]],
      // A qualifier alone, in any of the four languages, is still met by the language it qualifies.
      ["English – read, written, spoken", ["Anglophone", "Darijaphone", "Hispanophone", "Shanghaiphone", "Teochewphone"]],
    ];
    for (const [language, names] of expected) {
      expect(await filtered(language), `filtre ${language}`).toEqual(names);
      expect(await profiled(language), `profil ${language}`).toEqual(names);
      expect(await missioned(language), `mission ${language}`).toEqual(names);
    }
  });

  // IA02-R7-PARITE: each concept of the closed list in French, English, German and Chinese, after a dash, then a language no list
  // knows. Before (ac75d5a), in at least one of the four languages, the qualifier was no word of the list and the language written
  // after it went on with the « places » it opened: Anglophone met the whole text (15 language points of 15, the profile and the filter).
  const QUALIFIER_CONCEPTS: ReadonlyArray<readonly [concept: string, phrases: readonly (readonly [fr: string, en: string, de: string, zh: string])[]]> = [
    ["les verbes lire, écrire, parler, comprendre", [["lire, écrire, parler", "read, write, speak", "lesen, schreiben, sprechen", "读，写，说"], ["comprendre", "understand", "verstehen", "听懂"], ["savoir lire et écrire", "able to read and write", "lesen und schreiben können", "能读写"]]],
    ["les compétences", [["compétences orales", "oral skills", "mündliche Kenntnisse", "口语能力"], ["compétences linguistiques", "language skills", "Sprachkenntnisse", "语言能力"], ["compétence", "competence", "Kompetenz", "能力"]]],
    ["au moins, minimum", [["au moins trois ans", "at least three years", "mindestens drei Jahre", "至少三年"], ["trois ans minimum", "three years minimum", "drei Jahre mindestens", "最少三年"]]],
    ["plus de, more than, mehr als, 以上", [["plus de deux ans", "more than two years", "mehr als zwei Jahre", "两年以上"], ["plus de 2 ans", "over 2 years", "über 2 Jahre", "超过2年"], ["plusieurs années", "several years", "mehrere Jahre", "多年"]]],
    ["la pratique et l’expérience, et de quoi", [["5 ans de pratique", "5 years of practice", "5 Jahre Praxis", "五年实践"], ["expérience de 3 ans", "experience of 3 years", "Erfahrung von 3 Jahren", "3年的经验"]]],
    ["l’usage professionnel et quotidien", [["usage professionnel", "professional use", "beruflicher Gebrauch", "工作使用"], ["usage quotidien", "daily use", "täglicher Gebrauch", "日常使用"], ["au quotidien", "everyday", "im Alltag", "日常"]]],
    ["les niveaux de LinkedIn, élevé, à l’aise", [
      ["notions", "elementary proficiency", "Grundkenntnisse", "初级"], ["compétence professionnelle limitée", "limited working proficiency", "gute Kenntnisse", "有限工作能力"],
      ["compétence professionnelle", "professional working proficiency", "fließend", "专业工作能力"], ["capacité professionnelle complète", "full professional proficiency", "verhandlungssicher", "全面专业工作能力"],
      ["niveau élevé", "high level", "hohes Niveau", "高水平"], ["niveau soutenu", "high level", "hohes Niveau", "高水平"], ["à l'aise", "comfortable", "sicher", "自如"],
      ["à l'aise en conversation", "comfortable in conversation", "sicher im Gespräch", "会话自如"],
    ]],
  ];
  const QUALIFIED_LANGUAGES = [["Anglais", ", ", "Darija", "Darijaphone"], ["English", ", ", "Teochew", "Teochewphone"], ["Englisch", ", ", "Tigrinisch", "Tigrinophone"], ["英语", "，", "上海话", "Shanghaiphone"]] as const;
  const seedSpeakers = (prefix: string, others: ReadonlyArray<readonly [lastName: string, languages: string[]]> = []) => {
    const dossier = (lastName: string, languages: string[]) => ({
      tracking_id: `${prefix}${lastName}`, first_name: "Dr", last_name: lastName, email: `${prefix.toLowerCase()}${lastName.toLowerCase()}@test.local`, specialty: "Anesthésie-réanimation",
      target_countries: JSON.stringify(["Émirats arabes unis"]), languages: JSON.stringify(languages), analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION,
      cv_file_key: `recruitment/cv/${prefix}${lastName}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000,
    });
    memory.seed(cvApplications, [
      dossier("Anglophone", ["English"]), ...QUALIFIED_LANGUAGES.map(([, , name, speaker]) => dossier(speaker, ["English", name])),
      dossier("Sinophone", ["English", "中文"]), dossier("Neerlandophone", ["English", "Français", "Nederlands"]), dossier("Arabophone", ["English", "Français", "Arabic"]),
      ...others.map(([lastName, languages]) => dossier(lastName, languages)),
    ]);
  };
  // The Langue filter, a profile as the page splits it at its commas, a mission: the dossiers each keeps, by their names.
  const kept = async (language: string) => {
    const filtered = lastNames((await caller().admin.recruitment.list({ language })).items).sort();
    const [profile] = memory.seed(recruitmentMatchProfiles, [{ name: language, minimum_score: 0, required_languages: JSON.stringify(language.split(",").map(term => term.trim())), active: 1 }]);
    const profiled = lastNames((await caller().admin.recruitment.list({ profileId: profile!.id as number })).items).sort();
    const [brief] = memory.seed(clientBriefs, [{ brief_id: `BRIEF-R72-${memory.rows(clientBriefs).length}`, organization_name: "Hôpital", contact_name: "RH", email: "rh@test.local", target_environment: "Hôpital", specialty_needed: "Anesthésie-réanimation", country: "Émirats arabes unis", required_languages: language }]);
    const result = await caller().admin.clientBriefs.candidates({ briefId: brief!.id as number, limit: 50 });
    const missioned = result.candidates.filter(candidate => candidate.match.breakdown.languages === 15).map(candidate => candidate.lastName).sort();
    return { filtered, profiled, missioned };
  };
  const expectKept = async (language: string, names: string[]) => {
    expect(await kept(language), language).toEqual({ filtered: [...names].sort(), profiled: [...names].sort(), missioned: [...names].sort() });
  };

  it.each(QUALIFIER_CONCEPTS)("lit %s dans les quatre langues : un nom de langue écrit après eux reste une exigence, pour la mission, le profil et le filtre Langue (IA02-R7-PARITE)", async (_, phrases) => {
    seedSpeakers("CVR72P");
    for (const phrase of phrases) {
      for (let index = 0; index < QUALIFIED_LANGUAGES.length; index += 1) {
        const [lead, separator, name, speaker] = QUALIFIED_LANGUAGES[index]!;
        await expectKept(`${lead} – ${phrase[index]}${separator}${name}`, [speaker]);
      }
    }
    // A qualifier alone is still met by the language it qualifies, in each of the four languages.
    for (let index = 0; index < QUALIFIED_LANGUAGES.length; index += 1) {
      await expectKept(`${QUALIFIED_LANGUAGES[index]![0]} – ${phrases[0]![index]}`, ["Anglophone", "Arabophone", "Darijaphone", "Neerlandophone", "Shanghaiphone", "Sinophone", "Teochewphone", "Tigrinophone"]);
    }
  });

  it("lit un autre nom d’une langue de la table comme un nom à lui seulement, et 和, 及, 与 comme « et » : la mission, le profil et le filtre Langue (IA02-R7-ALIAS-DANS-LIEU, IA02-R7-CONJONCTION-CHINOISE)", async () => {
    seedSpeakers("CVR72A");
    const everyone = ["Anglophone", "Arabophone", "Darijaphone", "Neerlandophone", "Shanghaiphone", "Sinophone", "Teochewphone", "Tigrinophone"];
    // Before (ac75d5a): Mandarin, Dutch or Arabic was required, and only Sinophone, Neerlandophone or Arabophone met the text.
    await expectKept("英语 – 所在国语言", everyone);
    await expectKept("英语 – 熟悉该国语言", everyone);
    await expectKept("Français – Brabant flamand", ["Arabophone", "Neerlandophone"]);
    await expectKept("English – Flemish Region", everyone);
    await expectKept("Français – MSA", ["Arabophone", "Neerlandophone"]);
    // Before (ac75d5a): Sinophone met « the host country's language preferred » as if it were Mandarin.
    await expectKept("英语，所在国语言优先", []);
    // Before (ac75d5a, daf844a, 749519f): 上海话 and 潮州话 were lost after 和, 及, 与, and everyone met these texts.
    await expectKept("英语和上海话", ["Shanghaiphone"]);
    await expectKept("英语 – 流利和上海话", ["Shanghaiphone"]);
    await expectKept("英语 – 流利及上海话", ["Shanghaiphone"]);
    // What the language is used for, after 与 (with), still qualifies it.
    await expectKept("英语 – 与患者沟通", everyone);
    // Before (ac75d5a, daf844a): a language's Chinese name, after the places a dash opened, went on with them.
    await expectKept("英语 – 迪拜，上海话", ["Shanghaiphone"]);
    await expectKept("英语 – 迪拜，医学术语", everyone);
  });

  it("ne lit un mot chinois qui finit par 话, 文 ou 言 comme un nom de langue qu’après un nom connu de langue, de peuple ou de lieu : la mission, le profil et le filtre Langue (IA02-R7B-NOM-CHINOIS-FAUX-POSITIF)", async () => {
    seedSpeakers("CVR7BZ");
    const everyone = ["Anglophone", "Arabophone", "Darijaphone", "Neerlandophone", "Shanghaiphone", "Sinophone", "Teochewphone", "Tigrinophone"];
    // Before (b81633b): 电话 (the phone), 论文 (a paper), 方言 (a dialect)... were a language nobody spoke after the places a dash
    // opened or after 和: nobody met these texts, where daf844a and ac75d5a, and the French, English and German texts, keep everyone.
    for (const required of [
      "英语 – 迪拜，接听电话", "英语 – 利雅得，撰写论文", "英语 – 听说读写和打电话", "英语 – 阅读和翻译医学论文", "英语 – 迪拜，方言", "英语 – 多哈，会议发言", "英语 – 流利及电话沟通",
      "Anglais – Dubaï, réponse au téléphone", "English – Dubai, answering the phone", "Englisch – Dubai, Telefonate",
    ]) {
      await expectKept(required, everyone);
    }
    // After the name of a place, a language or a people, still a language's name: a requirement of its own.
    await expectKept("英语 – 迪拜，上海话", ["Shanghaiphone"]);
    await expectKept("英语 – 听说读写和上海话", ["Shanghaiphone"]);
    await expectKept("英语 – 迪拜，中文", ["Sinophone"]);
    await expectKept("英语 – 迪拜，潮州话", []);
    await expectKept("英语和白话", []);
  });

  it("lit le nom chinois en 文 ou 话 d’une langue qu’Intl.DisplayNames nomme hors des listes comme une exigence, et un mot courant en 话 comme un mot : la mission, le profil et le filtre Langue (IA02-R8-NOM-CHINOIS-HORS-LISTES-PERDU, IA02-R8-MOTS-ORDINAIRES-RESTANTS)", async () => {
    seedSpeakers("CVR8ZH", [["Latiniste", ["English", "拉丁文"]], ["Sanskritiste", ["English", "梵文"]]]);
    const everyone = ["Anglophone", "Arabophone", "Darijaphone", "Latiniste", "Neerlandophone", "Sanskritiste", "Shanghaiphone", "Sinophone", "Teochewphone", "Tigrinophone"];
    // Before (ebc5768): 拉丁文 (Latin) and 梵文 (Sanskrit) were everyday words after the places a dash opened or after 和, and the
    // speaker of English alone met the texts; b81633b kept them, as 拉丁语 and 梵语 still are.
    await expectKept("英语 – 迪拜，拉丁文", ["Latiniste"]);
    await expectKept("英语和梵文", ["Sanskritiste"]);
    await expectKept("英语 – 利雅得，医学拉丁文", ["Latiniste"]);
    await expectKept("英语 – 听说读写和巴利文", []);
    await expectKept("英语 – 迪拜，平话", []);
    // Before (ebc5768, as b81633b): 恭维话 (compliments), 大白话 and 明白话 (plain words) were a language nobody spoke.
    await expectKept("英语 – 迪拜，恭维话", everyone);
    await expectKept("英语和大白话", everyone);
    await expectKept("英语 – 听说读写和明白话", everyone);
    // 维文, 白话 and 官话 starting a word, or after a place, are still a language's name.
    await expectKept("英语 – 迪拜，维文", []);
    await expectKept("英语 – 迪拜，广东白话", []);
    await expectKept("英语和官话", []);
  });

  it("ne lit les langues tirées du CV, et leurs citations, que pour un profil qui exige des langues (IA-02)", async () => {
    seedCandidates(0, 3, 3);
    const [byCountry, byLanguage] = memory.seed(recruitmentMatchProfiles, [
      { name: "France", minimum_score: 0, target_country: "France", active: 1 },
      { name: "Arabophone", minimum_score: 0, required_languages: JSON.stringify(["arabe"]), active: 1 },
    ]);
    // The scan reads the few columns a profile needs, up to the bound plus one.
    const scanOf = async (profileId: number) => {
      const before = memory.statements.length;
      expect((await caller().admin.recruitment.list({ profileId })).total).toBe(3);
      return memory.statements.slice(before).filter(statement => statement.params.includes(1_101)).map(statement => statement.sql);
    };

    const [countryScan] = await scanOf(byCountry!.id as number);
    expect(countryScan).toBeDefined();
    expect(countryScan).not.toContain("normalized_languages");
    expect(countryScan).not.toContain("ai_extracted_skills");
    expect((await scanOf(byLanguage!.id as number))[0]).toContain("normalized_languages");
  });
});

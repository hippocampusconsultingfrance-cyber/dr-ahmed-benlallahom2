import { beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications, cvCandidateCertifications, cvCandidateLanguages, recruitmentAuditLogs, recruitmentCampaignRecipients, recruitmentCampaigns, recruitmentFollowUpTasks } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({
  memory: null as null | { db: unknown },
  sendEmail: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: state.sendEmail } })),
}));
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({
  ...await importOriginal<typeof import("./adminMfa")>(),
  isAdminMfaVerified: vi.fn(async () => true),
}));

import { appRouter } from "./routers";

// MAIL-01: names planted through the public application form. The admin later
// emails these addresses (campaign, template), which nobody has verified.
const TRAP_CANDIDATES = [
  { first_name: "Votre colis est bloqué, payez sur https://colis-phish.example/fr", last_name: "Service client", email: "camp.victim@test.local" },
  { first_name: "Votre dossier est incomplet, appelez le +33 1 23 45 67 89 ou allez sur https://recrut-phish.example", last_name: "RH", email: "victim2@test.local" },
  { first_name: "Payez sur www.colis-phish.example", last_name: "Nom", email: "victim3@test.local" },
  { first_name: "Camille", last_name: "appelez le 01 23 45 67 89 ou allez sur https://nom-phish.example", email: "victim4@test.local" },
];
const TRAP_FRAGMENTS = ["phish", "colis", "+33", "01 23", "dossier est incomplet", "Payez", "Service client"];

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

function seedCandidates(candidates: Array<{ first_name: string; last_name: string; email: string }>) {
  return memory.seed(cvApplications, candidates.map((candidate, index) => ({
    tracking_id: `CVGREET${String(index).padStart(5, "0")}`, specialty: "Anesthésie", target_countries: "[]",
    cv_file_key: `recruitment/cv/g${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, marketing_consent: 1, ...candidate,
  })));
}

function urls(content: string) {
  return content.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
}

function sentPayloads() {
  return state.sendEmail.mock.calls.map(([payload]) => payload as { to: string[]; subject: string; html: string });
}

function expectNoTrapText(html: string) {
  for (const fragment of TRAP_FRAGMENTS) expect(html).not.toContain(fragment);
  expect(urls(html).filter(url => !url.startsWith("https://drahmedbenlallahom.com/"))).toEqual([]);
}

describe("emails envoyés depuis l’admin aux adresses saisies dans le formulaire public (MAIL-01)", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_admin_recruitment_emails");
    memory = createMemoryPg([cvApplications, cvCandidateCertifications, cvCandidateLanguages, recruitmentAuditLogs, recruitmentCampaigns, recruitmentCampaignRecipients, recruitmentFollowUpTasks]);
    state.memory = memory;
    state.sendEmail.mockReset();
    state.sendEmail.mockResolvedValue({ data: { id: "email-admin" }, error: null });
  });

  it("une campagne à tous les profils éligibles salue sans recopier un nom piégé, et garde son contenu", async () => {
    seedCandidates([...TRAP_CANDIDATES, { first_name: "Zoë", last_name: "N'Diaye", email: "zoe@test.local" }]);
    const result = await admin().admin.recruitment.campaigns.send({ title: "Mission à Genève", subject: "Offre Suisse", body: "Une mission à Genève, répondez par email.", language: "fr", mode: "all_eligible", confirmed: true });
    expect(result).toMatchObject({ total: 5, sent: 5, failed: 0 });

    const byRecipient = new Map(sentPayloads().map(payload => [payload.to[0], payload]));
    for (const candidate of TRAP_CANDIDATES) {
      const payload = byRecipient.get(candidate.email)!;
      if (candidate.first_name === "Camille") expect(payload.html).toContain("<p>Bonjour Camille,</p>");
      else expect(payload.html).toContain("<p>Bonjour,</p>");
      expect(payload.subject).toBe("Offre Suisse");
      expect(payload.html).toContain("Mission à Genève");
      expect(payload.html).toContain("Une mission à Genève, répondez par email.");
      expect(payload.html).toContain("/recruitment/unsubscribe?token=");
      expectNoTrapText(payload.html);
    }
    expect(byRecipient.get("zoe@test.local")!.html).toContain("<p>Bonjour Zoë,</p>");
  });

  it("une campagne en anglais salue par « Hello, » quand le nom est piégé", async () => {
    seedCandidates([TRAP_CANDIDATES[0]!]);
    await admin().admin.recruitment.campaigns.send({ title: "Geneva assignment", subject: "Swiss offer", body: "An assignment in Geneva, reply by email.", language: "en", mode: "all_eligible", confirmed: true });
    const [payload] = sentPayloads();
    expect(payload!.html).toContain("<p>Hello,</p>");
    expect(payload!.html).toContain("Unsubscribe from future recruitment opportunities");
    expectNoTrapText(payload!.html);
  });

  it("un modèle de recrutement salue sans recopier un nom piégé, en français comme en anglais", async () => {
    const [trapped, , , lastNameTrap] = seedCandidates(TRAP_CANDIDATES);
    await admin().admin.recruitment.sendTemplateEmail({ id: trapped!.id as number, template: "profile_interest", language: "en" });
    await admin().admin.recruitment.sendTemplateEmail({ id: trapped!.id as number, template: "additional_information", language: "fr", customRequest: "Merci de joindre votre attestation." });
    await admin().admin.recruitment.sendTemplateEmail({ id: lastNameTrap!.id as number, template: "profile_interest", language: "fr" });
    const [english, french, firstNameOnly] = sentPayloads();

    expect(english!.to).toEqual(["camp.victim@test.local"]);
    expect(english!.html).toContain("<p>Hello,</p>");
    expect(english!.html).toContain("Reference:</strong> CVGREET00000");
    expect(french!.html).toContain("<p>Bonjour,</p>");
    expect(french!.html).toContain("Merci de joindre votre attestation.");
    expect(firstNameOnly!.html).toContain("<p>Bonjour Camille,</p>");
    for (const payload of [english!, french!, firstNameOnly!]) expectNoTrapText(payload.html);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointmentInvoices, appointments, candidateAccounts, contactMessages, cvApplications, cvCandidateCertifications, cvGoogleDriveExportJobs, medicalQuestionAuditLogs, medicalQuestions, recruitmentEmailEvents, recruitmentMatchProfiles } from "../drizzle/schema";
import { adminSearchPatterns } from "./adminSearch";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// ADM-02 — recherche par nom, email ou référence dans les listes de l’admin,
// sans tenir compte des majuscules ni des accents, combinée aux filtres et à
// la pagination « Charger plus » du lot 3.

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

const minute = (index: number) => new Date(Date.UTC(2026, 6, 1, 9, index));

function seedCandidate(index: number, firstName: string, lastName: string, extra: Record<string, unknown> = {}) {
  return memory.seed(cvApplications, [{
    tracking_id: `CVSEARCH${String(index).padStart(4, "0")}`, first_name: firstName, last_name: lastName, email: `cand${index}@test.local`, specialty: "Anesthésie-réanimation",
    cv_file_key: `recruitment/cv/${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, createdAt: minute(index), ...extra,
  }])[0]!;
}

function seedAppointment(index: number, customerName: string, extra: Record<string, unknown> = {}) {
  return memory.seed(appointments, [{
    tracking_id: `APTVOL${String(index).padStart(6, "0")}`, customer_name: customerName, customer_email: `patient${index}@test.local`, customer_phone: "+33600000000",
    request_details: "Avis", appointment_date: minute(index), base_price: "100.00", final_price: "100.00", createdAt: minute(index), ...extra,
  }])[0]!;
}

beforeEach(() => {
  memory = createMemoryPg([cvApplications, cvCandidateCertifications, recruitmentMatchProfiles, candidateAccounts, cvGoogleDriveExportJobs, recruitmentEmailEvents, appointments, appointmentFulfillmentJobs, appointmentInvoices, medicalQuestions, medicalQuestionAuditLogs, contactMessages]);
  state.memory = memory;
});

afterEach(() => vi.restoreAllMocks());

const lastNames = (items: Array<{ lastName: string }>) => items.map(item => item.lastName).sort();

describe("ADM-02 — termes de recherche", () => {
  it("cherche chaque mot sans accent, et %, _ et \\ comme des caractères ordinaires", () => {
    expect(adminSearchPatterns("  Hélène   DUPONT hélène ")).toEqual(["%Helene%", "%DUPONT%", "%helene%"]);
    expect(adminSearchPatterns("50%_off a\\b")).toEqual(["%50\\%\\_off%", "%a\\\\b%"]);
    expect(adminSearchPatterns("Łukasz Søren")).toEqual(["%Łukasz%", "%Søren%"]);
    // Typed decomposed, or a lone accent: compared without it.
    expect(adminSearchPatterns("Hélène".normalize("NFD"))).toEqual(["%Helene%"]);
    expect(adminSearchPatterns("q\u0303 \u0301")).toEqual(["%q%"]);
    expect(adminSearchPatterns("   ")).toEqual([]);
    expect(adminSearchPatterns(undefined)).toEqual([]);
  });
});

describe("ADM-02 — Candidatures", () => {
  beforeEach(() => {
    seedCandidate(1, "Hélène", "DUPONT", { email: "h.dupont@test.local" });
    seedCandidate(2, "Jean", "Martin", { email: "jean_martin@test.local", status: "rejected" });
    seedCandidate(3, "Jean", "Martinez", { email: "jeanxmartin@test.local" });
    seedCandidate(4, "Ana", "Müller");
    seedCandidate(5, "Søren", "Dupond", { email: "soren@test.local" });
  });

  it("retrouve un dossier par prénom et nom dans n’importe quel ordre, sans majuscules ni accents", async () => {
    const list = caller().admin.recruitment.list;
    expect(lastNames((await list({ search: "helene dupont" })).items)).toEqual(["DUPONT"]);
    expect(lastNames((await list({ search: "DUPONT Hélène" })).items)).toEqual(["DUPONT"]);
    expect(lastNames((await list({ search: "muller" })).items)).toEqual(["Müller"]);
    expect(lastNames((await list({ search: "MÜLLER" })).items)).toEqual(["Müller"]);
    // A letter without accented form is compared as typed.
    expect(lastNames((await list({ search: "søren" })).items)).toEqual(["Dupond"]);
    expect(lastNames((await list({ search: "dupon" })).items)).toEqual(["DUPONT", "Dupond"]);
  });

  it("retrouve un nom enregistré décomposé (accents combinants, collé depuis un PDF)", async () => {
    seedCandidate(6, "Hélène".normalize("NFD"), "Moreau");
    const list = caller().admin.recruitment.list;
    expect(lastNames((await list({ search: "helene" })).items)).toEqual(["DUPONT", "Moreau"]);
    expect(lastNames((await list({ search: "Hélène moreau" })).items)).toEqual(["Moreau"]);
    expect(lastNames((await list({ search: "Hélène moreau".normalize("NFD") })).items)).toEqual(["Moreau"]);
  });

  it("retrouve un dossier par email ou par référence, et prend % et _ au pied de la lettre", async () => {
    const list = caller().admin.recruitment.list;
    expect(lastNames((await list({ search: "cvsearch0004" })).items)).toEqual(["Müller"]);
    expect(lastNames((await list({ search: "H.DUPONT@TEST.LOCAL" })).items)).toEqual(["DUPONT"]);
    expect(lastNames((await list({ search: "jean_martin" })).items)).toEqual(["Martin"]);
    const percent = await list({ search: "%" });
    expect(percent).toEqual({ items: [], total: 0 });
    // Spaces only: no search, every dossier.
    expect((await list({ search: "   " })).total).toBe(5);
  });

  it("se combine au statut et au profil de matching, avec le total de la recherche", async () => {
    const list = caller().admin.recruitment.list;
    const jean = await list({ search: "jean" });
    expect(jean.total).toBe(2);
    const rejectedJean = await list({ search: "jean", status: "rejected" });
    expect(lastNames(rejectedJean.items)).toEqual(["Martin"]);
    expect(rejectedJean.total).toBe(1);

    const [profile] = memory.seed(recruitmentMatchProfiles, [{ name: "Anesthésie", minimum_score: 0, specialty: "anesthésie", active: 1 }]);
    const matched = await list({ search: "dupon", profileId: profile!.id as number });
    expect(lastNames(matched.items)).toEqual(["DUPONT", "Dupond"]);
    expect(matched.total).toBe(2);
  });

  it("pagine les résultats de la recherche par 50 et refuse une recherche de plus de 100 caractères", async () => {
    for (let index = 10; index < 75; index += 1) seedCandidate(index, "Camille", `Lefèvre${index}`);
    const list = caller().admin.recruitment.list;

    const first = await list({ search: "lefevre", limit: 50, offset: 0 });
    const second = await list({ search: "lefevre", limit: 50, offset: 50 });

    expect(first.total).toBe(65);
    expect(first.items).toHaveLength(50);
    expect(first.items[0]?.lastName).toBe("Lefèvre74");
    expect(second.total).toBe(65);
    expect(second.items).toHaveLength(15);
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(65);

    await expect(list({ search: "a".repeat(101) })).rejects.toThrow();
    await expect(list({ search: `  ${"a".repeat(100)}  ` })).resolves.toEqual({ items: [], total: 0 });
  });
});

describe("ADM-02 — Réservations", () => {
  beforeEach(() => {
    // This in-memory database cannot run the invoice table check: the list
    // still answers, without invoice numbers.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("retrouve une réservation par référence, nom ou email, avec le filtre de paiement et le total", async () => {
    for (let index = 0; index < 60; index += 1) seedAppointment(index, index % 2 ? `Patient ${index}` : `Élodie Bérénice ${index}`, { payment_status: index % 4 === 0 ? "completed" : "pending" });
    const list = caller().admin.appointments.list;

    expect((await list({ search: "aptvol000010" })).items.map(item => item.trackingId)).toEqual(["APTVOL000010"]);
    expect((await list({ search: "PATIENT11@test.local" })).items.map(item => item.trackingId)).toEqual(["APTVOL000011"]);

    const elodie = await list({ search: "elodie berenice", limit: 20, offset: 20 });
    expect(elodie.total).toBe(30);
    expect(elodie.items).toHaveLength(10);
    expect(elodie.items.every(item => item.customerName.startsWith("Élodie Bérénice"))).toBe(true);

    const paidElodie = await list({ search: "ÉLODIE", status: "completed" });
    expect(paidElodie.total).toBe(15);
    expect(paidElodie.items.every(item => item.paymentStatus === "completed" && item.customerName.startsWith("Élodie"))).toBe(true);
  });
});

describe("ADM-02 — Questions santé et messages", () => {
  it("retrouve une question par la référence QMED-… de l’email de notification, dans la file choisie", async () => {
    memory.seed(medicalQuestions, [
      { tracking_id: "QMED-SEARCH01-00000", first_name: "Zoé", last_name: "Lambert", email: "zoe@test.local", phone: "+33600000000", question: "Question de test assez longue pour être valide.", status: "submitted", created_at: minute(1) },
      { tracking_id: "QMED-SEARCH02-00000", first_name: "Zoe", last_name: "Durand", email: "durand@test.local", phone: "+33600000000", question: "Question de test assez longue pour être valide.", status: "answered", created_at: minute(2) },
      { tracking_id: "QMED-OTHER003-00000", first_name: "Louis", last_name: "Petit", email: "louis@test.local", phone: "+33600000000", question: "Question de test assez longue pour être valide.", status: "submitted", created_at: minute(3) },
    ]);
    const list = caller().medicalQuestions.admin.list;

    expect((await list({ search: "qmed-search02-00000" })).items.map(item => item.lastName)).toEqual(["Durand"]);
    const zoe = await list({ search: "ZOE" });
    expect(zoe.total).toBe(2);
    const todoZoe = await list({ search: "zoé", statuses: ["submitted", "drafting"], order: "oldest" });
    expect(todoZoe.items.map(item => item.lastName)).toEqual(["Lambert"]);
    expect(todoZoe.total).toBe(1);
  });

  it("retrouve un message par expéditeur, email ou référence, avec le filtre « non lus »", async () => {
    memory.seed(contactMessages, [
      { tracking_id: "CSEARCH00001", name: "François Côté", email: "fcote@test.local", message: "Bonjour", read: 0, createdAt: minute(1) },
      { tracking_id: "CSEARCH00002", name: "Francois Cote", email: "cote2@test.local", message: "Bonjour", read: 1, createdAt: minute(2) },
      { tracking_id: "CSEARCH00003", name: "Marie Curie", email: "marie@test.local", message: "Bonjour", read: 0, createdAt: minute(3) },
    ]);
    const list = caller().admin.contacts.list;

    expect((await list({ search: "francois cote" })).total).toBe(2);
    const unread = await list({ search: "FRANÇOIS", unreadOnly: true });
    expect(unread.items.map(item => item.trackingId)).toEqual(["CSEARCH00001"]);
    expect(unread.total).toBe(1);
    expect((await list({ search: "csearch00003" })).items.map(item => item.name)).toEqual(["Marie Curie"]);
  });
});

import { createTRPCClient } from "@trpc/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppRouter } from "../../../server/routers";
import { createTrpcLinks, querySentAsPost } from "./trpcLinks";

// ADM-02 — the names, emails and tokens typed in the administration or carried
// by the candidate links must not be in the URLs of the API calls (recorded by
// Vercel and its log drains with each request): they go in a POST body.

type SentRequest = { url: string; method: string; body: string; credentials?: RequestCredentials };

function recordRequests() {
  const sent: SentRequest[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    sent.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : "", credentials: init?.credentials });
    // One empty answer per call of the batch (paths separated by commas).
    const calls = decodeURIComponent(new URL(url).pathname.split("/api/trpc/")[1]!).split(",");
    return new Response(JSON.stringify(calls.map(() => ({ result: { data: { json: null } } }))), { headers: { "content-type": "application/json" } });
  }));
  return { sent, client: createTRPCClient<AppRouter>({ links: createTrpcLinks("http://localhost/api/trpc") }) };
}

/** The URL as written and as a server would decode it. */
const urlTexts = (request: SentRequest) => [request.url, decodeURIComponent(request.url)];

afterEach(() => vi.unstubAllGlobals());

describe("ADM-02 — requêtes privées envoyées en POST", () => {
  it("met les recherches de l’administration et l’email de l’écran RGPD dans le corps, jamais dans l’URL", async () => {
    const { sent, client } = recordRequests();
    await client.admin.appointments.list.query({ search: "Hélène Dupont" });
    await client.admin.recruitment.list.query({ search: "cand10@test.local" });
    await client.admin.contacts.list.query({ search: "helene.dupont@test.local" });
    await client.medicalQuestions.admin.list.query({ search: "Nguyễn" });
    await client.admin.personalData.find.query({ email: "Helene.Dupont@TEST.local" });

    const terms = ["Hélène Dupont", "cand10@test.local", "helene.dupont@test.local", "Nguyễn", "Helene.Dupont@TEST.local"];
    expect(sent).toHaveLength(terms.length);
    sent.forEach((request, index) => {
      expect(request.method).toBe("POST");
      expect(request.url).not.toContain("input=");
      for (const text of urlTexts(request)) expect(text).not.toContain(terms[index]!.split(" ")[0]);
      expect(request.body).toContain(terms[index]);
      expect(request.credentials).toBe("include");
    });
    expect(new URL(sent[0]!.url).pathname).toBe("/api/trpc/admin.appointments.list");
  });

  it("envoie aussi en POST l’email et le jeton des liens de l’espace candidat", async () => {
    const { sent, client } = recordRequests();
    const token = "jeton-secret-de-test-0123456789abcdef";
    await client.candidatePortal.activationDetails.query({ email: "candidat@test.local", token });
    await client.candidatePortal.resolveInvitation.query({ token });

    expect(sent.map(request => request.method)).toEqual(["POST", "POST"]);
    for (const request of sent) {
      for (const text of urlTexts(request)) {
        expect(text).not.toContain(token);
        expect(text).not.toContain("candidat@test.local");
      }
      expect(request.body).toContain(token);
    }
  });

  it("laisse les requêtes des pages publiques en GET, et les mutations en POST comme avant", async () => {
    const { sent, client } = recordRequests();
    await client.blog.list.query({ language: "en", limit: 3 });
    await client.candidatePortal.me.query();
    await client.contact.submit.mutate({ name: "Test", email: "t@test.local", message: "Bonjour" } as never).catch(() => undefined);

    expect(sent.map(request => request.method)).toEqual(["GET", "GET", "POST"]);
    expect(decodeURIComponent(sent[0]!.url)).toContain('"language":"en"');
  });

  it("classe chaque chemin : toute l’administration, les deux liens candidats, rien d’autre", () => {
    for (const path of ["admin.appointments.list", "admin.recruitment.candidate.detail", "adminSecurity.events", "medicalQuestions.admin.list", "medicalQuestions.admin.get", "candidatePortal.activationDetails", "candidatePortal.resolveInvitation"]) {
      expect(querySentAsPost(path)).toBe(true);
    }
    for (const path of ["blog.list", "appointments.publicStatus", "medicalQuestions.published", "candidatePortal.me", "candidatePortal.documents", "system.health", "testimonials.list", "administration.list"]) {
      expect(querySentAsPost(path)).toBe(false);
    }
  });
});

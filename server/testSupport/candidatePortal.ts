/**
 * TEST-ONLY helpers shared by the candidate-portal behavioural tests: an
 * in-memory database, cookie-aware tRPC callers and captured emails.
 * Never import this module from production code.
 */
import { candidateAccounts, cvApplications } from "../../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./inMemoryDrizzle";

export const TEST_PEPPER = "candidate-portal-behaviour-test-pepper-0123456789";

export type CapturedCandidateEmail = { to: string; kind: string; firstName: string; actionUrl: string };

export function freshCandidateDb(): InMemoryDrizzle {
  return createInMemoryDrizzle();
}

export function seedApplication(db: InMemoryDrizzle, input: { email: string; firstName?: string; lastName?: string; trackingId?: string }) {
  return db.seed(cvApplications, {
    trackingId: input.trackingId ?? `CV-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    firstName: input.firstName ?? "Vera",
    lastName: input.lastName ?? "Victime",
    email: input.email,
    specialty: "Anesthésie-réanimation",
    targetCountries: "Canada",
    cvFileKey: "recruitment/quarantine/cv.pdf",
    cvOriginalName: "cv.pdf",
    cvMimeType: "application/pdf",
    cvSizeBytes: 1024,
  });
}

export function accountByEmail(db: InMemoryDrizzle, email: string) {
  return db.rows(candidateAccounts).find(row => row.email === email) as (typeof candidateAccounts.$inferSelect) | undefined;
}

type CallerFactory<T> = (ctx: unknown) => T;

/** A browser-like client: keeps the candidate session cookie between calls. */
export class CandidateClient<T> {
  cookie: string | null = null;

  constructor(private readonly createCaller: CallerFactory<T>, readonly ip: string) {}

  context() {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, "user-agent": "vitest" };
    if (this.cookie) headers.cookie = `candidate_portal_session=${this.cookie}`;
    return {
      user: null,
      req: { protocol: "https", headers },
      res: {
        cookie: (_name: string, value: string) => { this.cookie = value; },
        clearCookie: () => { this.cookie = null; },
      },
    };
  }

  get api(): T {
    return this.createCaller(this.context());
  }
}

export function linkParams(email: CapturedCandidateEmail) {
  const url = new URL(email.actionUrl);
  return { email: url.searchParams.get("email") ?? "", token: url.searchParams.get("token") ?? "", invite: url.searchParams.get("invite") ?? "" };
}

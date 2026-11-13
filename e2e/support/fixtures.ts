import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test as base, expect, type APIRequestContext } from "@playwright/test";
import pg from "pg";
import { COOKIE_CONSENT_STORAGE_KEY, createCookieConsent } from "../../client/src/components/cookieConsentState";
import type { LocalEmail } from "../../server/_core/localServices";
import type { DoubleCall } from "./doubles";
import { E2E } from "./doubles";
import { e2eSettings } from "./settings";

const settings = e2eSettings();

/** A token Turnstile's double accepts (the server checks it with the siteverify double). */
export const TURNSTILE_TOKEN = "e2e-turnstile-token-accepted-by-the-double";

/** Cloudflare's script in the browser, replaced by one that passes the challenge at once. */
const FAKE_TURNSTILE_SCRIPT = `window.turnstile = {
  render: (element, options) => { setTimeout(() => options.callback(${JSON.stringify(TURNSTILE_TOKEN)})); return "e2e-widget"; },
  remove: () => {},
  reset: () => {},
  getResponse: () => ${JSON.stringify(TURNSTILE_TOKEN)},
};`;

type DoublesSnapshot = { emails: LocalEmail[]; calls: DoubleCall[]; blobs: string[]; unexpected: string[] };

export async function doublesState(): Promise<DoublesSnapshot> {
  return (await fetch(`${process.env.E2E_DOUBLES_ORIGIN}/__doubles/state`)).json();
}

const recipients = (email: LocalEmail) => [email.to ?? []].flat().map(address => String(address).toLowerCase());

/** The emails sent to `address` so far, waited for until `count` of them have arrived. */
export async function emailsTo(address: string, count = 1): Promise<LocalEmail[]> {
  let found: LocalEmail[] = [];
  await expect.poll(async () => {
    found = (await doublesState()).emails.filter(email => recipients(email).includes(address.toLowerCase()));
    return found.length;
  }, { timeout: 15_000, message: `emails to ${address}` }).toBeGreaterThanOrEqual(count);
  return found;
}

/** A tRPC call as the site's client sends it (superjson, a query sent as POST). */
export async function trpc<T = unknown>(request: APIRequestContext, procedure: string, input?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; data: T | null; error: { message: string; code: string } | null }> {
  const response = await request.post(`/api/trpc/${procedure}`, { headers: { "content-type": "application/json", ...headers }, data: input === undefined ? {} : { json: input } });
  const body = await response.json() as { result?: { data?: { json?: T } }; error?: { json?: { message: string; data?: { code: string } } } };
  return { status: response.status(), data: body.result?.data?.json ?? null, error: body.error?.json ? { message: body.error.json.message, code: body.error.json.data?.code ?? "" } : null };
}

/**
 * A Clerk session token of the administrator, signed with the key whose public half the
 * server reads in CLERK_JWT_KEY, as Clerk would sign it: checked without any request to Clerk.
 */
export function adminSessionToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT", kid: "ins_e2e" })}.${encode({ sub: E2E.ownerUserId, sid: "sess_e2e", azp: settings.appOrigin, iss: "https://clerk.example.com", iat: now - 5, nbf: now - 5, exp: now + 600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(process.env.E2E_CLERK_SIGNING_KEY!, "base64url");
  return `${unsigned}.${signature}`;
}

type Fixtures = { db: pg.Pool; blockedRequests: string[]; noRealService: void };

/**
 * Every scenario: a browser that reaches only the site and the doubles (Turnstile's
 * script replaced, any other address blocked and reported), cookies already chosen, French;
 * after it, no request the doubles could not answer and no outbound connection refused by
 * the built server (e2e/support/egress.mjs).
 */
export const test = base.extend<Fixtures>({
  blockedRequests: async ({}, use) => {
    await use([]);
  },
  context: async ({ context, blockedRequests }, use) => {
    await context.addInitScript(({ key, value }) => {
      localStorage.setItem(key, value);
      localStorage.setItem("language", "fr");
    }, { key: COOKIE_CONSENT_STORAGE_KEY, value: JSON.stringify(createCookieConsent(false)) });
    const doubles = new URL(process.env.E2E_DOUBLES_ORIGIN!).host;
    const app = new URL(settings.appOrigin).host;
    await context.route(/^https?:\/\//, route => {
      const url = new URL(route.request().url());
      if (url.host === app || url.host === doubles) return route.continue();
      if (url.host === "challenges.cloudflare.com") return route.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_TURNSTILE_SCRIPT });
      blockedRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
      return route.abort("blockedbyclient");
    });
    await use(context);
  },
  db: async ({}, use) => {
    const pool = new pg.Pool({ connectionString: settings.databaseUrl, max: 2 });
    await use(pool);
    await pool.end();
  },
  noRealService: [async ({ blockedRequests }, use) => {
    await use();
    const { unexpected } = await doublesState();
    const refused = (await readFile(settings.serverLog, "utf8")).split("\n").filter(line => line.includes("[e2e] outbound connection refused"));
    expect({ unexpected, refused, blockedRequests }, "requests that would have left this machine").toEqual({ unexpected: [], refused: [], blockedRequests: [] });
  }, { auto: true }],
});

export { expect };

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SECURITY_EVENT_LABELS, securityEventLabel, type SecurityEventLabelLanguage } from "../shared/securityEventLabels";
import { RESEND_QUOTA_SECURITY_CATEGORY } from "./_core/resendDelivery";
import { ADMIN_MFA_RATE_LIMITS } from "./adminMfa";
import { PUBLIC_EMAIL_IP_RATE_LIMITS } from "./publicFormRateLimit";
import { GDPR_REQUEST_EMAIL_CONFIRMED } from "./routers/gdpr";
import { PUBLIC_FORM_RATE_LIMITS, type enforcePublicFormIpLimit, type verifyPublicFormTurnstile } from "./routers/publicForms";

/**
 * ADM-15 promises that the Sécurité tab and the owner's alert name every
 * category of security_events in a sentence, in the admin's four languages.
 * The localization test checks the sentences that exist; this one reads the
 * categories the server writes (every logSecurityEvent and securityEventInsert
 * call), so that a category added on one side without its sentence on the
 * other, as gdpr_request_email_confirmed was (RGPD-13), fails here.
 */

const LANGUAGES: readonly SecurityEventLabelLanguage[] = ["fr", "en", "de", "zh"];
const OUTCOMES = ["allowed", "blocked", "failed", "alert"] as const;
const SERVER_ROOT = import.meta.dirname;
const REPOSITORY_ROOT = path.resolve(SERVER_ROOT, "..");

// Every form each function is typed for: a kind added to the type and missing here fails pnpm check.
const TURNSTILE_FORMS: Record<Parameters<typeof verifyPublicFormTurnstile>[0], true> = { contact: true, gdpr: true };
const IP_LIMITED_FORMS: Record<Parameters<typeof enforcePublicFormIpLimit>[0], true> = { contact: true, gdpr: true };

/**
 * The categories built from a value rather than written out, keyed by file and
 * expression, computed from the policies they are built from. An expression
 * the scan cannot read and that is not listed here fails the test.
 */
const BUILT_CATEGORIES: Record<string, () => string[]> = {
  "server/adminMfa.ts|`${policy.action}_rate_limited`": () => Object.values(ADMIN_MFA_RATE_LIMITS).map(policy => `${policy.action}_rate_limited`),
  "server/routers/publicForms.ts|`${policy.action}_rate_limit`": () => Object.values(PUBLIC_FORM_RATE_LIMITS).map(policy => `${policy.action}_rate_limit`),
  "server/routers/publicForms.ts|category": () => (Object.keys(TURNSTILE_FORMS) as (keyof typeof TURNSTILE_FORMS)[])
    .flatMap(kind => [`${PUBLIC_FORM_RATE_LIMITS[kind].action}_turnstile`, `${PUBLIC_FORM_RATE_LIMITS[kind].action}_turnstile_unavailable`]),
  "server/routers/publicForms.ts|`${PUBLIC_EMAIL_IP_RATE_LIMITS[kind].action}_rate_limit`": () => (Object.keys(IP_LIMITED_FORMS) as (keyof typeof IP_LIMITED_FORMS)[])
    .map(kind => `${PUBLIC_EMAIL_IP_RATE_LIMITS[kind].action}_rate_limit`),
  // logCandidateEmailDelivery's category, typed as a union of literals in the same file.
  "server/candidatePortalRouter.ts|input.category": () => {
    const source = readFileSync(path.join(SERVER_ROOT, "candidatePortalRouter.ts"), "utf8");
    const union = /async function logCandidateEmailDelivery\(input: \{[^}]*?\bcategory: ((?:"[a-z0-9_]+"\s*\|\s*)*"[a-z0-9_]+");/.exec(source)?.[1];
    expect(union, "logCandidateEmailDelivery's category union").toBeDefined();
    return [...union!.matchAll(/"([a-z0-9_]+)"/g)].map(match => match[1]!);
  },
};

function serverSources(directory = SERVER_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "testSupport" ? [] : serverSources(full);
    return entry.name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(entry.name) ? [full] : [];
  });
}

/** The index of the quote closing the string opened at `open`, ${…} placeholders of a template skipped. */
function stringEnd(text: string, open: number): number {
  const quote = text[open];
  for (let index = open + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\") index += 1;
    else if (char === quote) return index;
    else if (quote === "`" && char === "$" && text[index + 1] === "{") index = closing(text, index + 1, "{", "}");
  }
  throw new Error(`unclosed string at ${open}`);
}

/** The index of the bracket closing the one at `open`, strings skipped. */
function closing(text: string, open: number, opening: string, closingChar: string): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === "\"" || char === "'" || char === "`") index = stringEnd(text, index);
    else if (char === opening) depth += 1;
    else if (char === closingChar && --depth === 0) return index;
  }
  throw new Error(`unclosed ${opening} at ${open}`);
}

/** The expression after `category:` (or « category » written alone), up to the comma or bracket that ends it at its own depth. */
function categoryExpression(args: string): string | null {
  const start = /\bcategory\s*([:,}])/.exec(args);
  if (!start) return null;
  if (start[1] !== ":") return "category";
  const from = start.index + start[0].length;
  let depth = 0;
  for (let index = from; index < args.length; index += 1) {
    const char = args[index]!;
    if (char === "\"" || char === "'" || char === "`") index = stringEnd(args, index);
    else if ("([{".includes(char)) depth += 1;
    else if (")]}".includes(char) && depth-- === 0) return args.slice(from, index).trim();
    else if (char === "," && depth === 0) return args.slice(from, index).trim();
  }
  return args.slice(from).trim();
}

/** Calls that pass on an event built by their caller, whose own call is read. */
const FORWARDING_CALLS = new Set(["server/candidateSecurity.ts|db, input"]);

/** Every category the server writes to security_events, with where. */
function writtenCategories() {
  const sources = serverSources();
  const texts = new Map(sources.map(file => [file, readFileSync(file, "utf8")]));
  const constants = new Map<string, string>();
  for (const text of texts.values()) {
    for (const match of text.matchAll(/\bconst ([A-Z][A-Z0-9_]*) = "([a-z0-9_]+)";/g)) constants.set(match[1]!, match[2]!);
  }
  const found = new Map<string, string>();
  const unread: string[] = [];
  const builtUsed = new Set<string>();
  const forwardingUsed = new Set<string>();
  let calls = 0;
  for (const [file, text] of texts) {
    const relative = path.relative(REPOSITORY_ROOT, file).split(path.sep).join("/");
    for (const call of text.matchAll(/(?<!function )\b(?:logSecurityEvent|securityEventInsert)\(/g)) {
      calls += 1;
      const open = call.index + call[0].length - 1;
      const args = text.slice(open + 1, closing(text, open, "(", ")"));
      if (FORWARDING_CALLS.has(`${relative}|${args.trim()}`)) { forwardingUsed.add(`${relative}|${args.trim()}`); continue; }
      const expression = categoryExpression(args);
      const where = `${relative}:${text.slice(0, call.index).split("\n").length}`;
      if (expression === null) { unread.push(`${where} (no category)`); continue; }
      const key = `${relative}|${expression}`;
      let categories: string[];
      if (BUILT_CATEGORIES[key]) {
        builtUsed.add(key);
        categories = BUILT_CATEGORIES[key]();
      } else if (/^[A-Z][A-Z0-9_]*$/.test(expression)) {
        categories = constants.has(expression) ? [constants.get(expression)!] : [];
      } else if (!expression.includes("`") && /^[\w.!\s?:"]+$/.test(expression) && expression.includes("\"")) {
        // A literal, or a choice between literals (« refused ? "a" : "b" »).
        categories = [...expression.matchAll(/"([^"]+)"/g)].map(match => match[1]!);
      } else categories = [];
      if (!categories.length) unread.push(`${where} ${expression}`);
      for (const category of categories) if (!found.has(category)) found.set(category, where);
    }
  }
  return { found, unread, calls, unusedBuilt: Object.keys(BUILT_CATEGORIES).filter(key => !builtUsed.has(key)), unusedForwarding: [...FORWARDING_CALLS].filter(key => !forwardingUsed.has(key)) };
}

function expectSentence(category: string) {
  expect(Object.hasOwn(SECURITY_EVENT_LABELS, category), `${category} has its own sentence`).toBe(true);
  for (const language of LANGUAGES) {
    for (const outcome of OUTCOMES) {
      const label = securityEventLabel(category, outcome, language);
      expect(label.trim(), `${category}:${outcome} (${language})`).not.toHaveLength(0);
      expect(label, `${category}:${outcome} (${language})`).not.toContain("_");
      expect(label, `${category}:${outcome} (${language})`).not.toBe(category.replaceAll("_", " "));
    }
  }
}

describe("catégories écrites au journal de sécurité (ADM-15)", () => {
  it("nomme par une phrase, dans les quatre langues, la confirmation d’adresse d’une demande RGPD (RGPD-13)", () => {
    expect(GDPR_REQUEST_EMAIL_CONFIRMED).toBe("gdpr_request_email_confirmed");
    expectSentence(GDPR_REQUEST_EMAIL_CONFIRMED);
    expect(securityEventLabel(GDPR_REQUEST_EMAIL_CONFIRMED, "allowed", "fr")).toBe("Adresse d’une demande RGPD confirmée par le lien de l’accusé de réception");
    expect(securityEventLabel(GDPR_REQUEST_EMAIL_CONFIRMED, "allowed", "en")).toBe("GDPR request address confirmed through the acknowledgement link");
  });

  it("nomme par une phrase chaque catégorie que le serveur écrit, dans chaque langue, jamais par son code", () => {
    const { found, unread, calls, unusedBuilt, unusedForwarding } = writtenCategories();
    // Every call is read, and every built category or forwarding call listed still matches a call.
    expect(unread).toEqual([]);
    expect(unusedBuilt).toEqual([]);
    expect(unusedForwarding).toEqual([]);
    expect(calls).toBeGreaterThan(40);
    // The constants of the server are resolved, as literals are.
    expect([...found.keys()]).toEqual(expect.arrayContaining([GDPR_REQUEST_EMAIL_CONFIRMED, RESEND_QUOTA_SECURITY_CATEGORY, "public_booking_hold_created", "admin_mfa_verify_rate_limited", "public_gdpr_submit_ip_rate_limit", "public_contact_submit_turnstile_unavailable", "candidate_password_reset_delivery"]));
    const unnamed = [...found].filter(([category]) => !Object.hasOwn(SECURITY_EVENT_LABELS, category)).map(([category, where]) => `${category} (${where})`);
    expect(unnamed).toEqual([]);
    for (const category of found.keys()) expectSentence(category);
  });
});

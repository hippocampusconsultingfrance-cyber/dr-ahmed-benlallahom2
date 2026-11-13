import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { localServicesHandler, sendJson, type LocalEmail, type LocalServiceEvent } from "../../server/_core/localServices";

/**
 * Doubles of every service the built server calls (CODE-22), on one local port. The
 * built server reaches them through e2e/support/egress.mjs, which sends each request
 * meant for one of these hosts to `/<host>/<path>` here; Resend and Stripe Checkout are
 * those of the local mode (server/_core/localServices.ts), at their own paths. A request
 * no double answers is recorded as unexpected, and the tests fail on it.
 */
export const E2E = {
  /** Owner of the administration: the Clerk user the admin scenario signs in as. */
  ownerUserId: "user_e2e_owner",
  ownerEmail: "owner@e2e.test",
  /** Vercel Blob store named by BLOB_READ_WRITE_TOKEN (vercel_blob_rw_<store>_<secret>). */
  blobStore: "e2estore",
} as const;

export type DoubleCall = { host: string; method: string; path: string; body: string };

export type DoublesState = {
  emails: LocalEmail[];
  payments: LocalServiceEvent[];
  calls: DoubleCall[];
  blobs: Map<string, { body: Buffer; contentType: string; uploadedAt: string }>;
  unexpected: string[];
};

const blobHost = `${E2E.blobStore}.private.blob.vercel-storage.com`;
const blobUrl = (pathname: string) => `https://${blobHost}/${pathname}`;
const blobKey = (urlOrPathname: string) => decodeURIComponent(urlOrPathname.replace(/^https:\/\/[^/]+\//, "").replace(/\?.*$/, ""));

/**
 * A minimal CV analysis as the AI Gateway returns it for the CV analysis: valid against
 * the server's schema, quoting nothing, so that no fact and no score is presented without
 * a human looking at the CV.
 */
export const AI_ANALYSIS = {
  summary: "Analyse de test produite par le double local de l'IA.",
  professionalTitle: "",
  specialties: [],
  skills: [],
  languages: [],
  normalizedLanguages: [],
  certifications: [],
  countriesOfInterest: [],
  yearsExperience: null,
  normalizedExperiences: [],
  strengths: [],
  gaps: [],
  dataQualityWarnings: [],
  requiredFollowUps: ["Vérifier le CV (double local de l'IA)."],
  fieldEvidence: [],
  contradictions: [],
  confidence: 10,
  scoreBreakdown: { specialtyMatch: 0, experienceEvidence: 0, skillsEvidence: 0, languageReadiness: 0, credentialReadiness: 0 },
  reasoning: "Double local de l'IA : aucune donnée n'est déduite du CV.",
};

/** A Clerk user as the Backend API returns it, with a verified primary email. */
function clerkUser(id: string, email: string) {
  const now = Date.now();
  return {
    object: "user", id, first_name: "Admin", last_name: "E2E", username: null, image_url: "", has_image: false,
    primary_email_address_id: "idn_e2e", primary_phone_number_id: null, primary_web3_wallet_id: null,
    email_addresses: [{ object: "email_address", id: "idn_e2e", email_address: email, verification: { status: "verified", strategy: "admin" }, linked_to: [] }],
    phone_numbers: [], web3_wallets: [], external_accounts: [], saml_accounts: [], enterprise_accounts: [], passkeys: [],
    public_metadata: {}, private_metadata: {}, unsafe_metadata: {},
    password_enabled: false, two_factor_enabled: false, totp_enabled: false, backup_code_enabled: false,
    banned: false, locked: false, created_at: now, updated_at: now, last_sign_in_at: now,
  };
}

/** The doubles of the services other than Resend and Stripe; false when the request is none of theirs. */
function answerOtherService(state: DoublesState, req: IncomingMessage, res: ServerResponse, url: URL, body: Buffer): boolean {
  const [, host = "", ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;
  const method = req.method ?? "GET";
  const text = body.toString("utf8");
  const answer = (status: number, json?: unknown, raw?: { contentType: string; body: Buffer | string }) => {
    state.calls.push({ host, method, path: `${path}${url.search}`, body: raw ? "" : text });
    if (raw) res.writeHead(status, { "content-type": raw.contentType }).end(raw.body);
    else if (json === undefined) res.writeHead(status).end();
    else sendJson(res, status, json);
    return true;
  };

  // Cloudflare Turnstile: every token is accepted but « refused », for the forms' own checks.
  if (host === "challenges.cloudflare.com" && path === "/turnstile/v0/siteverify") {
    const accepted = new URLSearchParams(text).get("response") !== "refused";
    return answer(200, accepted ? { success: true, hostname: "127.0.0.1" } : { success: false, "error-codes": ["invalid-input-response"] });
  }

  // Clerk Backend API (CLERK_API_URL): the user the session tokens name.
  if (host === "api.clerk.com") {
    const user = /^\/v1\/users\/([\w-]+)$/.exec(path)?.[1];
    return user === E2E.ownerUserId ? answer(200, clerkUser(user, E2E.ownerEmail)) : answer(404, { errors: [{ code: "resource_not_found", message: "not found" }] });
  }

  // Vercel Blob API (VERCEL_BLOB_API_URL = <doubles>/blob), then the store's own host.
  if (host === "blob") {
    const pathname = url.searchParams.get("pathname");
    if (method === "PUT" && pathname) {
      if (state.blobs.has(pathname) && req.headers["x-allow-overwrite"] !== "1") return answer(400, { error: { code: "bad_request", message: "This blob already exists" } });
      const contentType = String(req.headers["x-content-type"] ?? "application/octet-stream");
      state.blobs.set(pathname, { body, contentType, uploadedAt: new Date().toISOString() });
      return answer(200, { url: blobUrl(pathname), downloadUrl: `${blobUrl(pathname)}?download=1`, pathname, contentType, contentDisposition: "inline" });
    }
    if (path === "/signed-token") {
      const scope = JSON.parse(text || "{}") as Record<string, unknown>;
      return answer(200, { clientSigningToken: "e2e-signing-key", delegationToken: `${Buffer.from(JSON.stringify({ storeId: E2E.blobStore, ...scope })).toString("base64url")}.e2e` });
    }
    if (path === "/delete") {
      for (const target of (JSON.parse(text || "{}") as { urls?: string[] }).urls ?? []) state.blobs.delete(blobKey(target));
      return answer(200, {});
    }
    const target = url.searchParams.get("url");
    if (target !== null) {
      const key = blobKey(target);
      const stored = state.blobs.get(key);
      if (!stored) return answer(404, { error: { code: "not_found", message: "The requested blob does not exist" } });
      return answer(200, { url: blobUrl(key), downloadUrl: `${blobUrl(key)}?download=1`, pathname: key, size: stored.body.length, contentType: stored.contentType, contentDisposition: "inline", cacheControl: "public, max-age=60", uploadedAt: stored.uploadedAt, etag: `"${key}"` });
    }
    const prefix = url.searchParams.get("prefix");
    if (prefix !== null) {
      const blobs = [...state.blobs].filter(([key]) => key.startsWith(prefix)).map(([key, stored]) => ({ url: blobUrl(key), downloadUrl: blobUrl(key), pathname: key, size: stored.body.length, uploadedAt: stored.uploadedAt, etag: `"${key}"` }));
      return answer(200, { blobs, hasMore: false });
    }
  }
  if (host === blobHost) {
    const stored = state.blobs.get(blobKey(path.slice(1)));
    return stored ? answer(200, undefined, { contentType: stored.contentType, body: stored.body }) : answer(404);
  }

  // Vercel AI Gateway: the CV analysis, its structured output as text.
  if (host === "ai-gateway.vercel.sh" && path === "/v4/ai/language-model") {
    return answer(200, {
      content: [{ type: "text", text: JSON.stringify(AI_ANALYSIS) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 1200, noCache: 1200, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 300, text: 300, reasoning: 0 } },
      warnings: [],
    });
  }

  // Google OAuth and Drive: a refresh token for any code, an empty folder, an accepted upload.
  if (host === "oauth2.googleapis.com" && path === "/token") {
    return answer(200, { access_token: "ya29.e2e-access", refresh_token: "1//e2e-refresh", expires_in: 3600, token_type: "Bearer", scope: "https://www.googleapis.com/auth/drive.file" });
  }
  if (host === "www.googleapis.com") {
    if (method === "GET" && path === "/drive/v3/files") return answer(200, { files: [] });
    if (method === "POST" && path === "/upload/drive/v3/files") return answer(200, { id: `drive-file-${state.calls.length + 1}`, name: "cv.pdf", mimeType: "application/pdf", webViewLink: "https://drive.google.com/file/d/e2e/view" });
    if (method === "DELETE") return answer(204);
  }

  // Have I Been Pwned (candidate passwords): no known leak.
  if (host === "api.pwnedpasswords.com") return answer(200, undefined, { contentType: "text/plain", body: "" });
  return false;
}

/** Starts the doubles on `port` (0: any free port) for the application at `appOrigin`. */
export async function startDoubles({ port, appOrigin, stripeWebhookSecret }: { port: number; appOrigin: string; stripeWebhookSecret: string }) {
  const state: DoublesState = { emails: [], payments: [], calls: [], blobs: new Map(), unexpected: [] };
  // eslint-disable-next-line prefer-const -- set once the doubles listen, from the port they got; the handler above reads it
  let handleLocal: ReturnType<typeof localServicesHandler> | undefined;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://doubles.invalid");
      if (url.pathname === "/__doubles/state") {
        return sendJson(res, 200, { emails: state.emails, payments: state.payments, calls: state.calls, blobs: [...state.blobs.keys()], unexpected: state.unexpected });
      }
      if (await handleLocal!(req, res)) return;
      // Read as bytes, so that a stored file keeps them.
      const body = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", chunk => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
      });
      if (answerOtherService(state, req, res, url, body)) return;
      state.unexpected.push(`${req.method} ${url.pathname}${url.search}`);
      sendJson(res, 501, { error: { message: `e2e: no double for ${req.method} ${url.pathname}` } });
    } catch (error) {
      state.unexpected.push(`${req.method} ${req.url}: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) sendJson(res, 500, { error: { message: "e2e double failure" } });
    }
  });
  await new Promise<void>(resolve => server.listen(port, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  handleLocal = localServicesHandler({
    origin,
    appOrigin,
    stripeWebhookSecret,
    onEvent: event => {
      if (event.service === "resend") state.emails.push(event.email);
      else state.payments.push(event);
    },
  });
  return { origin, state, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

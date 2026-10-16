/**
 * TEST-ONLY helpers to call the real Express upload/download routes of the
 * candidate vault with an authenticated candidate session. The test file must
 * mock `./db`, `./storage`, `./candidateTurnstile`, `./_core/notification` and
 * `@clerk/express`, and set VERCEL=1 before importing `./_core/index`.
 * Never import this module from production code.
 */
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { candidateAccounts, candidateSessions } from "../../drizzle/schema";
import { hashCandidateToken } from "../candidateAuth";
import type { InMemoryDrizzle } from "./inMemoryDrizzle";

export function validPdfBuffer(size = 2048): Buffer {
  const content = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF\n", "utf8");
  return Buffer.concat([content, Buffer.alloc(Math.max(0, size - content.length), 0x20)]);
}

export function seedVerifiedCandidate(db: InMemoryDrizzle, input: { email: string; sessionToken: string }) {
  const account = db.seed(candidateAccounts, {
    email: input.email,
    firstName: "Vera",
    lastName: "Victime",
    passwordHash: "scrypt$unused-in-this-test",
    emailVerifiedAt: new Date(),
    termsAcceptedAt: new Date(),
    documentConsentAt: new Date(),
  });
  db.seed(candidateSessions, {
    candidateId: account.id,
    tokenHash: hashCandidateToken(input.sessionToken, "session"),
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  return account;
}

export async function listen(app: (req: never, res: never) => void): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app as never);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

export async function uploadDocument(baseUrl: string, sessionToken: string, input: { category: string; buffer: Buffer; name?: string; type?: string; otherLabel?: string }) {
  const form = new FormData();
  form.set("category", input.category);
  form.set("turnstileToken", "turnstile-token-accepted-by-the-mock");
  if (input.otherLabel) form.set("categoryOtherLabel", input.otherLabel);
  form.set("document", new Blob([new Uint8Array(input.buffer)], { type: input.type ?? "application/pdf" }), input.name ?? "document.pdf");
  const response = await fetch(`${baseUrl}/api/candidate/documents`, {
    method: "POST",
    body: form,
    headers: { cookie: `candidate_portal_session=${sessionToken}`, "x-forwarded-for": "203.0.113.9" },
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { body = { raw: text }; }
  return { status: response.status, body };
}

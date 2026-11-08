import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingHttpHeaders } from "node:http";

type RequestWithHeaders = { headers?: IncomingHttpHeaders };

export type LogErrorOptions = {
  /** The short reference the caller was given (internalErrorReference). */
  ref?: string;
  /** The request served, for its x-vercel-id. */
  req?: RequestWithHeaders;
  level?: "error" | "warn";
};

const MESSAGE_LIMIT = 300;
// Where a library prints the values it was given after its text: Drizzle's
// query parameters (emails, password or session hashes), neon's connection
// string (the database password).
const PRINTED_VALUES = /\s*(?:\bparams:|Connection string:)/;
const EMAIL_ADDRESS = /[^\s@<>()[\]"'`,;:]+@[^\s@<>()[\]"'`,;:]+\.[a-z]{2,}/gi;

const requestLogStorage = new AsyncLocalStorage<{ vercelId?: string }>();

function vercelIdOf(req: RequestWithHeaders | undefined): string | undefined {
  const value = req?.headers?.["x-vercel-id"];
  const id = Array.isArray(value) ? value[0] : value;
  return id ? id.slice(0, 128) : undefined;
}

/**
 * Runs `run` with the x-vercel-id of `req` for the lines logged meanwhile by
 * code that has no request at hand (database, candidate portal): the tRPC
 * procedures and the scheduled jobs run inside it.
 */
export function runWithRequestLog<T>(req: RequestWithHeaders | undefined, run: () => T): T {
  return requestLogStorage.run({ vercelId: vercelIdOf(req) }, run);
}

function safeMessage(message: string): string {
  return message.split(PRINTED_VALUES)[0].replace(EMAIL_ADDRESS, "[email]").slice(0, MESSAGE_LIMIT);
}

function errorCode(error: unknown): string | undefined {
  for (let current: unknown = error, depth = 0; current && typeof current === "object" && depth < 4; depth += 1) {
    const { code, providerErrorName, providerError } = current as { code?: unknown; providerErrorName?: unknown; providerError?: { name?: unknown } | null };
    if (typeof code === "string" && code) return code;
    // Resend answers an error name (validation_error, rate_limit_exceeded), kept by notifications.ts.
    const resendName = providerErrorName ?? providerError?.name;
    if (typeof resendName === "string" && resendName) return resendName;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * The server's error log line (EXPL-11): one JSON object on one line, whose
 * fields Vercel's logs and a log drain read. `label` says where it failed (a
 * constant, never data); then `ref`, the error's `name` and `code`
 * (PostgreSQL's SQLSTATE, Stripe's or Node's code, the error name Resend
 * answered), its `message` and `cause` cut before the values printed after
 * them and without any email address, and the request's `vercelId`, from
 * `req` or the tRPC call or scheduled job under way. Never the error object
 * itself: its fields (Drizzle's params, PostgreSQL's detail) hold the rows' values.
 */
export function logError(label: string, error: unknown, options: LogErrorOptions = {}): void {
  const line: Record<string, string> = { label };
  if (options.ref) line.ref = options.ref;
  line.name = error instanceof Error ? error.name : "UnknownError";
  const code = errorCode(error);
  if (code) line.code = code;
  if (error instanceof Error) {
    if (error.message) line.message = safeMessage(error.message);
    if (error.cause instanceof Error) line.cause = `${error.cause.name}: ${safeMessage(error.cause.message)}`;
  }
  const vercelId = options.req ? vercelIdOf(options.req) : requestLogStorage.getStore()?.vercelId;
  if (vercelId) line.vercelId = vercelId;
  console[options.level ?? "error"](JSON.stringify(line));
}

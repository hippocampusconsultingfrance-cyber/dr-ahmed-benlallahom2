import { neon } from "@neondatabase/serverless";
import { DrizzleQueryError } from "drizzle-orm";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestContext } from "../testSupport/trpcContext";
import { logError, runWithRequestLog } from "./logError";
import { formatTrpcErrorShape, publicProcedure, router } from "./trpc";

// EXPL-11 : une seule forme de ligne d’erreur pour tout le serveur, en JSON sur
// une ligne, assez riche pour dire quoi réparer, sans les paramètres d’une
// requête SQL, une adresse email ni un mot de passe.

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function loggedLines(spy: ReturnType<typeof vi.spyOn> = consoleError) {
  return spy.mock.calls.map(call => {
    expect(call).toHaveLength(1);
    const [line] = call as [string];
    expect(line).not.toContain("\n");
    return JSON.parse(line) as Record<string, string>;
  });
}

/** The error Drizzle throws for a refused query: the SQL, then its parameters, in its message. */
function failedQuery() {
  const lockTimeout = Object.assign(
    new Error("canceling statement due to lock timeout"),
    { code: "55P03" }
  );
  return new DrizzleQueryError(
    'select "id" from "candidate_accounts" where "candidate_accounts"."email" = $1 and "candidate_accounts"."password_hash" = $2',
    ["camille.candidate@example.test", "scrypt$synthetic-password-hash"],
    lockTimeout
  );
}

describe("logError", () => {
  it("écrit une ligne JSON : libellé, référence, nom, SQLSTATE, requête sans ses paramètres et cause", () => {
    logError("[Reminder] Vercel cron error", failedQuery(), {
      ref: "ab12cd34",
    });
    expect(loggedLines()).toEqual([
      {
        label: "[Reminder] Vercel cron error",
        ref: "ab12cd34",
        name: "Error",
        code: "55P03",
        message:
          'Failed query: select "id" from "candidate_accounts" where "candidate_accounts"."email" = $1 and "candidate_accounts"."password_hash" = $2',
        cause: "Error: canceling statement due to lock timeout",
      },
    ]);
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(
      /camille|synthetic-password-hash|params:/
    );
  });

  it("garde le code d’une erreur Stripe et le nom d’erreur répondu par Resend", () => {
    logError(
      "Stripe webhook processing failed",
      new Stripe.errors.StripeInvalidRequestError({
        message: "No such checkout.session: 'cs_test_123'",
        code: "resource_missing",
        type: "invalid_request_error",
      })
    );
    // As notifications.ts keeps Resend's answer (PostPaymentEmailError.providerError).
    const resendRefusal = Object.assign(
      new Error("confirmation_email_rejected:rate limited"),
      { providerError: { name: "rate_limit_exceeded", statusCode: 429 } }
    );
    logError(
      "[AppointmentFulfillment] Delivery failed",
      new Error("confirmation_email_failed", { cause: resendRefusal })
    );
    expect(loggedLines()).toEqual([
      {
        label: "Stripe webhook processing failed",
        name: "Error",
        code: "resource_missing",
        message: "No such checkout.session: 'cs_test_123'",
      },
      {
        label: "[AppointmentFulfillment] Delivery failed",
        name: "Error",
        code: "rate_limit_exceeded",
        message: "confirmation_email_failed",
        cause: "Error: confirmation_email_rejected:rate limited",
      },
    ]);
  });

  it("laisse de côté les adresses email d’un message et la chaîne de connexion que neon() répète", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logError(
      "Resend refusal",
      new Error(
        "You can only send testing emails to your own email address (owner.synthetic@example.test)."
      )
    );
    let refused: unknown;
    try {
      neon(
        "postgresql://app_user:synthetic-db-password@db host.example.test/app"
      );
    } catch (error) {
      refused = error;
    }
    logError("[Database] Failed to connect", refused, { level: "warn" });
    expect(loggedLines()).toEqual([
      {
        label: "Resend refusal",
        name: "Error",
        message:
          "You can only send testing emails to your own email address ([email]).",
      },
    ]);
    expect(loggedLines(warn)).toEqual([
      {
        label: "[Database] Failed to connect",
        name: "Error",
        message:
          "Database connection string provided to `neon()` is not a valid URL.",
      },
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(
      /synthetic-db-password|app_user/
    );
  });

  it("garde lisibles les chemins d’un paquet scopé ou du store pnpm, où « @ » n’est pas une adresse", () => {
    logError(
      "[Reminder] Vercel cron error",
      new Error(
        "Cannot find module '/var/task/node_modules/@vercel/blob/dist/index.js' imported from /var/task/api/index.js"
      )
    );
    logError(
      "Invoice font unreadable",
      new Error(
        "ENOENT: no such file or directory, open '/var/task/node_modules/.pnpm/pdfkit@0.17.2/node_modules/pdfkit/js/data/Helvetica.afm'"
      )
    );
    expect(loggedLines().map(line => line.message)).toEqual([
      "Cannot find module '/var/task/node_modules/@vercel/blob/dist/index.js' imported from /var/task/api/index.js",
      "ENOENT: no such file or directory, open '/var/task/node_modules/.pnpm/pdfkit@0.17.2/node_modules/pdfkit/js/data/Helvetica.afm'",
    ]);
  });

  it("traite en un temps borné un très long message sans espace (jeton, corps base64)", () => {
    const startedAt = performance.now();
    logError("long token", new Error(`invalid token ${"A".repeat(50_000)}`));
    logError("long spaces", new Error(`${" ".repeat(50_000)}x`));
    // Read whole, these took seconds (quadratic patterns); read from their start, a few milliseconds.
    expect(performance.now() - startedAt).toBeLessThan(100);
    expect(loggedLines().map(line => line.message.length)).toEqual([300, 300]);
  });

  it("coupe un message trop long et ne lit rien d’une valeur qui n’est pas une erreur", () => {
    logError("long", new Error("x".repeat(5_000)));
    logError("not an error", {
      message: "camille.candidate@example.test",
      params: ["secret"],
    });
    const [long, notAnError] = loggedLines();
    expect(long.message).toHaveLength(300);
    expect(notAnError).toEqual({ label: "not an error", name: "UnknownError" });
  });

  it("donne le x-vercel-id de la requête servie, ou de l’appel en cours", async () => {
    logError("webhook", new Error("a"), {
      req: { headers: { "x-vercel-id": "cdg1::iad1::abcde-1" } },
    });
    logError("long id", new Error("b"), {
      req: { headers: { "x-vercel-id": `cdg1::${"z".repeat(500)}` } },
    });
    await runWithRequestLog(
      { headers: { "x-vercel-id": "cdg1::iad1::call-2" } },
      async () => {
        await Promise.resolve();
        logError("inside", new Error("c"));
      }
    );
    logError("outside", new Error("d"));
    const [webhook, longId, inside, outside] = loggedLines();
    expect(webhook.vercelId).toBe("cdg1::iad1::abcde-1");
    expect(longId.vercelId).toHaveLength(128);
    expect(inside.vercelId).toBe("cdg1::iad1::call-2");
    expect(outside).not.toHaveProperty("vercelId");
  });
});

describe("logError dans tRPC", () => {
  it("une procédure journalise avec le x-vercel-id de sa requête, sans le recevoir", async () => {
    const appRouter = router({
      lookup: publicProcedure.query(async () => {
        await Promise.resolve();
        logError("[Test] Lookup failed", failedQuery());
        return "refused";
      }),
    });
    const caller = appRouter.createCaller(
      createTestContext({
        req: { headers: { "x-vercel-id": "fra1::iad1::trpc-3" } },
      })
    );
    await expect(caller.lookup()).resolves.toBe("refused");
    expect(loggedLines()).toEqual([
      expect.objectContaining({
        label: "[Test] Lookup failed",
        code: "55P03",
        vercelId: "fra1::iad1::trpc-3",
      }),
    ]);
  });

  it("une erreur interne est journalisée sous la référence donnée à l’appelant, avec le x-vercel-id", () => {
    const shape = {
      message: "Failed query: select 1 params: camille.candidate@example.test",
      code: -32603,
      data: { code: "INTERNAL_SERVER_ERROR" },
    };
    const req = createTestContext({
      req: { headers: { "x-vercel-id": "fra1::iad1::trpc-4" } },
    }).req;
    const formatted = formatTrpcErrorShape(
      shape,
      { code: "INTERNAL_SERVER_ERROR", cause: failedQuery() },
      () => "ref12345",
      req
    );
    expect(formatted.message).toContain("(réf. ref12345)");
    expect(loggedLines()).toEqual([
      expect.objectContaining({
        label: "[tRPC] Internal error",
        ref: "ref12345",
        code: "55P03",
        vercelId: "fra1::iad1::trpc-4",
      }),
    ]);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("camille");
  });
});

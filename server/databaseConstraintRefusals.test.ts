import { afterEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TrpcContext } from "./_core/context";
import { DATABASE_DUPLICATE_MESSAGE, DATABASE_REFERENCE_MESSAGE, formatTrpcErrorShape, PublicErrorReason, publicProcedure, router } from "./_core/trpc";

// DATA-01 — a write a database constraint refuses, and that the procedure did
// not handle itself, reaches the caller as a refusal with a stable reason
// instead of a generic internal error.

/** A PostgreSQL refusal as drizzle-orm throws it: SQL and parameters in its message, the code in its cause. */
function failedQuery(code: string, constraint: string) {
  return Object.assign(new Error("Failed query: insert into \"client_brief_candidates\" (…)\nparams: 4242,patient@example.test"), {
    cause: Object.assign(new Error(`violates constraint "${constraint}"`), { code, constraint, detail: "Key (email)=(patient@example.test) already exists." }),
  });
}

const testRouter = router({
  write: publicProcedure
    .input(z.object({ code: z.string(), constraint: z.string() }))
    .mutation(({ input }) => { throw failedQuery(input.code, input.constraint); }),
  deliberate: publicProcedure.mutation(() => {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "La réservation n’a pas pu être enregistrée. Veuillez réessayer dans quelques instants." });
  }),
});

const caller = testRouter.createCaller({
  user: null,
  mfaVerified: false,
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
} as TrpcContext);

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (thrown: unknown) => thrown);
  expect(error).toBeInstanceOf(TRPCError);
  const trpcError = error as TRPCError;
  return { code: trpcError.code, message: trpcError.message, reason: trpcError.cause instanceof PublicErrorReason ? trpcError.cause.reason : null, error: trpcError };
}

afterEach(() => vi.restoreAllMocks());

describe("refus des contraintes de la base (DATA-01)", () => {
  it("un doublon (23505) devient un conflit avec un motif stable, sans SQL ni valeurs, et seul le nom de la contrainte est journalisé", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await refusal(caller.write({ code: "23505", constraint: "client_brief_candidates_pair_unique" }));
    expect(result).toMatchObject({ code: "CONFLICT", message: DATABASE_DUPLICATE_MESSAGE, reason: "duplicate_record" });
    expect(warn).toHaveBeenCalledWith("[tRPC] Database constraint refusal 23505", "client_brief_candidates_pair_unique");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("example.test");
    // What the client receives: the French message and the reason, nothing of the query.
    const shape = formatTrpcErrorShape({ message: result.message, code: -32009, data: { code: result.code } }, result.error);
    expect(shape).toEqual({ message: DATABASE_DUPLICATE_MESSAGE, code: -32009, data: { code: "CONFLICT", reason: "duplicate_record" } });
  });

  it("une clé étrangère (23503) devient une demande refusée avec un motif stable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await refusal(caller.write({ code: "23503", constraint: "candidate_documents_candidate_id_fk" })))
      .toMatchObject({ code: "BAD_REQUEST", message: DATABASE_REFERENCE_MESSAGE, reason: "related_record_invalid" });
  });

  it("laisse les autres erreurs et les refus voulus tels quels", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await refusal(caller.write({ code: "57P01", constraint: "" }))).toMatchObject({ code: "INTERNAL_SERVER_ERROR", reason: null });
    expect(await refusal(caller.deliberate())).toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "La réservation n’a pas pu être enregistrée. Veuillez réessayer dans quelques instants.", reason: null });
    expect(warn).not.toHaveBeenCalled();
  });
});

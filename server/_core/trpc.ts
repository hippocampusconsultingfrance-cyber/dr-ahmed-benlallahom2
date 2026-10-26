import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { randomUUID } from "node:crypto";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { isAdminMfaVerified } from "../adminMfa";
import { FOREIGN_KEY_VIOLATION, postgresConstraintName, UNIQUE_VIOLATION } from "../databaseConstraints";
import { postgresErrorCode } from "../languageColumns";

export const GENERIC_INTERNAL_ERROR_MESSAGE = "Une erreur interne est survenue. Veuillez réessayer dans quelques instants.";

// Generic server messages, in French like GENERIC_INTERNAL_ERROR_MESSAGE, for
// refusals no procedure answers itself (reasons duplicate_record and
// related_record_invalid): a public page in another language shows its own
// generic message for a reason it does not know, the admin shows this one.
export const DATABASE_DUPLICATE_MESSAGE = "Cet enregistrement existe déjà : rechargez la page pour voir son état actuel.";
export const DATABASE_REFERENCE_MESSAGE = "Cette opération vise un élément qui n’existe plus, ou qui est encore utilisé ailleurs : rechargez la page, puis réessayez.";

/**
 * Stable, language-neutral reason of a deliberate refusal (EN-06), passed as
 * the `cause` of a TRPCError and sent to the client as `data.reason`: the page
 * shows its own translation, the French message stays for any other client.
 */
export class PublicErrorReason extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "PublicErrorReason";
  }
}

type ErrorShapeWithReason<TShape extends { data: object }> = TShape & { data: TShape["data"] & { reason?: string } };

/** Short reference of an unexpected error, given to the caller and logged with the error. */
export function internalErrorReference(): string {
  return randomUUID().slice(0, 8);
}

/** Log line of an unexpected error: name and message, without the query parameters (personal data). */
export function internalErrorSummary(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message.split("\nparams:")[0].slice(0, 500)}` : "UnknownError";
}

/**
 * Unexpected errors (anything that is not a deliberate TRPCError: database,
 * provider, programming errors) reach the client as a generic French message
 * with a short reference; the original is only logged on the server. tRPC
 * wraps such errors as INTERNAL_SERVER_ERROR with the original as `cause`;
 * deliberate TRPCErrors carry no cause and keep their message, or a
 * PublicErrorReason cause whose reason is added to the data.
 */
export function formatTrpcErrorShape<TShape extends { message: string; data: { code: string; stack?: string } }>(
  shape: TShape,
  error: { code: string; cause?: unknown },
  reference: () => string = internalErrorReference,
): ErrorShapeWithReason<TShape> {
  if (error.cause instanceof PublicErrorReason) return { ...shape, data: { ...shape.data, reason: error.cause.reason } };
  if (error.code !== "INTERNAL_SERVER_ERROR" || error.cause === undefined) return shape as ErrorShapeWithReason<TShape>;
  const ref = reference();
  console.error(`[tRPC] Internal error ref=${ref}`, internalErrorSummary(error.cause));
  return {
    ...shape,
    message: `${GENERIC_INTERNAL_ERROR_MESSAGE} (réf. ${ref})`,
    data: { ...shape.data, stack: undefined },
  };
}

/**
 * A write refused by a database constraint the procedure did not handle
 * itself (DATA-01): a duplicate (23505) or a row missing or still referenced
 * (23503) is a refusal with a stable reason, not an internal error. Only
 * errors tRPC wrapped (thrown by the database) are concerned: a deliberate
 * TRPCError, even INTERNAL_SERVER_ERROR, has no database cause and is kept.
 */
export function databaseConstraintRefusal(error: TRPCError): TRPCError | null {
  if (error.code !== "INTERNAL_SERVER_ERROR") return null;
  const code = postgresErrorCode(error.cause);
  if (code !== UNIQUE_VIOLATION && code !== FOREIGN_KEY_VIOLATION) return null;
  // The constraint's name only: the error's detail holds the row's values.
  console.warn(`[tRPC] Database constraint refusal ${code}`, postgresConstraintName(error.cause) ?? "");
  return code === UNIQUE_VIOLATION
    ? new TRPCError({ code: "CONFLICT", message: DATABASE_DUPLICATE_MESSAGE, cause: new PublicErrorReason("duplicate_record") })
    : new TRPCError({ code: "BAD_REQUEST", message: DATABASE_REFERENCE_MESSAGE, cause: new PublicErrorReason("related_record_invalid") });
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => formatTrpcErrorShape(shape, error),
});

const databaseConstraintRefusals = t.middleware(async ({ next }) => {
  const result = await next();
  const refusal = result.ok ? null : databaseConstraintRefusal(result.error);
  if (refusal) throw refusal;
  return result;
});

const procedure = t.procedure.use(databaseConstraintRefusals);

export const router = t.router;
export const publicProcedure = procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = procedure.use(requireUser);

export const adminProcedure = procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    if (!(await isAdminMfaVerified(ctx.req, ctx.user.openId))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Validation de sécurité administrateur requise (10003)" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

import { publicProcedure, router } from "../_core/trpc";
import { revokeCurrentAdminMfaSession } from "../adminMfa";

export const authRouter = router({
  me: publicProcedure.query(opts => opts.ctx.user ? { ...opts.ctx.user, mfaVerified: opts.ctx.mfaVerified } : null),
  // Clerk ends the first factor in the browser; the server-side MFA proof
  // (8 h) must not survive it on a shared computer.
  logout: publicProcedure.mutation(async ({ ctx }) => {
    await revokeCurrentAdminMfaSession({ req: ctx.req, res: ctx.res, openId: ctx.user?.openId ?? null });
    return { success: true } as const;
  }),
});

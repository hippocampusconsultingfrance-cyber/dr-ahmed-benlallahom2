import { adminProcedure, router } from "../../_core/trpc";
import { z } from "zod";

// Everything kept under one email address in the patient and contact
// tables: listing, JSON export and erasure (RGPD-12, docs/PROCEDURE_DEMANDES_RGPD.md).
export const adminPersonalDataRouter = router({
  find: adminProcedure
    .input(z.object({ email: z.string().trim().email().max(320) }))
    .query(async ({ input }) => {
      const { findPersonalData } = await import("../../personalDataAdmin");
      return findPersonalData(input.email);
    }),

  export: adminProcedure
    .input(z.object({ email: z.string().trim().email().max(320) }))
    .mutation(async ({ input, ctx }) => {
      const { exportPersonalData } = await import("../../personalDataAdmin");
      return exportPersonalData({ email: input.email, actorOpenId: ctx.user.openId });
    }),

  erase: adminProcedure
    .input(z.object({ email: z.string().trim().email().max(320) }))
    .mutation(async ({ input, ctx }) => {
      const { erasePersonalData } = await import("../../personalDataAdmin");
      return erasePersonalData({ email: input.email, actorOpenId: ctx.user.openId });
    }),
});

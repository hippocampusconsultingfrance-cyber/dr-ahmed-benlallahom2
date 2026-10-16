import { z } from "zod";
import { getEnvironmentConfigurationStatus } from "./env";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  /**
   * Noms des variables critiques manquantes (jamais leurs valeurs), affichés en bandeau
   * dans le tableau de bord admin (OPS-01). Même source que GET /api/health.
   */
  configurationStatus: adminProcedure.query(() => getEnvironmentConfigurationStatus()),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});

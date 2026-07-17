import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { contactMessages, gdprRequests } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  contact: router({
    submit: publicProcedure
      .input(
        z.object({
          name: z.string().min(1, "Le nom est requis").max(255),
          email: z.string().email("Email invalide").max(320),
          phone: z.string().max(50).optional(),
          message: z.string().min(1, "Le message est requis").max(5000),
          gdprConsent: z.number().int().min(0).max(1),
        })
      )
      .mutation(async ({ input }) => {
        // Save the message to the database
        const db = await getDb();
        if (db) {
          await db.insert(contactMessages).values({
            name: input.name,
            email: input.email,
            phone: input.phone || null,
            message: input.message,
            gdprConsent: input.gdprConsent,
          });
        }

        // Notify the owner via Manus notification system
        await notifyOwner({
          title: `Nouveau message de contact de ${input.name}`,
          content: `**De:** ${input.name}\n**Email:** ${input.email}\n**Téléphone:** ${input.phone || "Non renseigné"}\n\n**Message:**\n${input.message}`,
        });

        return { success: true } as const;
      }),
  }),

  gdpr: router({
    submit: publicProcedure
      .input(
        z.object({
          name: z.string().min(1, "Le nom est requis").max(255),
          email: z.string().email("Email invalide").max(320),
          phone: z.string().max(50).optional(),
          requestType: z.enum(["access", "rectification", "deletion", "portability", "objection"]),
          description: z.string().min(1, "La description est requise").max(5000).optional(),
        })
      )
      .mutation(async ({ input }) => {
        // Save the GDPR request to the database
        const db = await getDb();
        if (db) {
          await db.insert(gdprRequests).values({
            name: input.name,
            email: input.email,
            phone: input.phone || null,
            requestType: input.requestType,
            description: input.description || null,
            status: "pending",
          });
        }

        // Notify the owner via Manus notification system
        const requestTypeLabels: Record<string, string> = {
          access: "Accès aux données",
          rectification: "Rectification de données",
          deletion: "Suppression de données (droit à l'oubli)",
          portability: "Portabilité des données",
          objection: "Opposition au traitement",
        };

        await notifyOwner({
          title: `Nouvelle demande RGPD de ${input.name}`,
          content: `**Type de demande:** ${requestTypeLabels[input.requestType]}\n**De:** ${input.name}\n**Email:** ${input.email}\n**Téléphone:** ${input.phone || "Non renseigné"}\n\n**Description:**\n${input.description || "Aucune description fournie"}`,
        });

        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;

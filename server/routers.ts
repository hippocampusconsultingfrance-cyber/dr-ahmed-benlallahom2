import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "../shared/const";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { contactMessages, gdprRequests, testimonials, appointments } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";
import { eq, and } from "drizzle-orm";
import Stripe from "stripe";
import {
  sendConfirmationEmail,
  sendOwnerNotificationEmail,
  sendOwnerNotificationSMS,
  sendCustomerConfirmationSMS,
} from "./_core/notifications";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");



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
        // Generate a unique tracking ID
        const trackingId = `CNT-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

        // Save the message to the database
        const db = await getDb();
        if (db) {
          await db.insert(contactMessages).values({
            trackingId,
            name: input.name,
            email: input.email,
            phone: input.phone || null,
            message: input.message,
            gdprConsent: input.gdprConsent,
          });
        }

        // Notify the owner via Manus notification system
        await notifyOwner({
          title: `Nouveau message de contact de ${input.name} (${trackingId})`,
          content: `**Numéro de suivi:** ${trackingId}\n**De:** ${input.name}\n**Email:** ${input.email}\n**Téléphone:** ${input.phone || "Non renseigné"}\n**Consentement RGPD:** ${input.gdprConsent === 1 ? "✅ Accepté" : "❌ Refusé"}\n\n**Message:**\n${input.message}`,
        });

        return { success: true, trackingId } as const;
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
        // Generate a unique tracking ID
        const trackingId = `GDPR-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

        // Save the GDPR request to the database
        const db = await getDb();
        if (db) {
          await db.insert(gdprRequests).values({
            trackingId,
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
          title: `Nouvelle demande RGPD de ${input.name} (${trackingId})`,
          content: `**Numéro de suivi:** ${trackingId}\n**Type de demande:** ${requestTypeLabels[input.requestType]}\n**De:** ${input.name}\n**Email:** ${input.email}\n**Téléphone:** ${input.phone || "Non renseigné"}\n\n**Description:**\n${input.description || "Aucune description fournie"}`,
        });

        return { success: true, trackingId } as const;
      }),
  }),

  testimonials: router({
    list: publicProcedure
      .input(
        z.object({
          language: z.string().optional().default("fr"),
          featured: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const conditions = [
          eq(testimonials.language, input.language),
          eq(testimonials.status, "approved"),
        ];

        if (input.featured !== undefined) {
          conditions.push(eq(testimonials.featured, input.featured));
        }

        return await db
          .select()
          .from(testimonials)
          .where(and(...conditions));
      }),
  }),

  appointments: router({
    calculatePrice: publicProcedure
      .input(
        z.object({
          appointmentDate: z.string(),
        })
      )
      .query(({ input }) => {
        const date = new Date(input.appointmentDate);
        const hours = date.getHours();
        const basePrice = 100;
        const isNightRate = hours >= 18 || hours < 8;
        const finalPrice = isNightRate ? basePrice * 1.5 : basePrice;

        return {
          basePrice,
          finalPrice,
          isNightRate,
        };
      }),

    create: publicProcedure
      .input(
        z.object({
          customerName: z.string().min(1).max(255),
          customerEmail: z.string().email().max(320),
          customerPhone: z.string().min(1).max(50),
          appointmentDate: z.string(),
          requestDetails: z.string().min(1).max(5000),
        })
      )
      .mutation(async ({ input }) => {
        const date = new Date(input.appointmentDate);
        const hours = date.getHours();
        const basePrice = "100.00";
        const isNightRate = hours >= 18 || hours < 8;
        const finalPrice = isNightRate ? "150.00" : "100.00";

        const trackingId = `APT-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

        const db = await getDb();
        if (db) {
          await db.insert(appointments).values({
            trackingId,
            customerName: input.customerName,
            customerEmail: input.customerEmail,
            customerPhone: input.customerPhone,
            consultationType: "health_advice",
            requestDetails: input.requestDetails,
            appointmentDate: new Date(input.appointmentDate),
            duration: 30,
            basePrice,
            finalPrice,
            isNightRate: isNightRate ? 1 : 0,
            paymentStatus: "pending",
            appointmentStatus: "confirmed",
          });
        }

        const finalPriceNum = parseFloat(finalPrice);
        const appointmentDateObj = new Date(input.appointmentDate);
        
        sendConfirmationEmail(
          input.customerEmail,
          input.customerName,
          trackingId,
          appointmentDateObj,
          finalPriceNum,
          input.requestDetails
        ).catch(console.error);

        sendCustomerConfirmationSMS(
          input.customerPhone,
          trackingId,
          appointmentDateObj
        ).catch(console.error);

        sendOwnerNotificationEmail(
          input.customerName,
          input.customerEmail,
          input.customerPhone,
          trackingId,
          appointmentDateObj,
          finalPriceNum,
          input.requestDetails
        ).catch(console.error);

        sendOwnerNotificationSMS(
          input.customerName,
          input.customerPhone,
          trackingId,
          appointmentDateObj,
          finalPriceNum
        ).catch(console.error);

        return {
          success: true,
          trackingId,
          finalPrice: finalPriceNum,
        };
      }),

    createCheckoutSession: publicProcedure
      .input(
        z.object({
          trackingId: z.string(),
          finalPrice: z.number(),
          customerEmail: z.string().email(),
          customerName: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const amountInCents = Math.round(input.finalPrice * 100);

          const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
              {
                price_data: {
                  currency: "eur",
                  product_data: {
                    name: "Health Consultation - 30 minutes",
                    description: `Appointment: ${input.trackingId}`,
                  },
                  unit_amount: amountInCents,
                },
                quantity: 1,
              },
            ],
            mode: "payment",
            customer_email: input.customerEmail,
            metadata: {
              trackingId: input.trackingId,
              customerName: input.customerName,
            },
            success_url: `${ctx.req.headers.origin}/booking?success=true&trackingId=${input.trackingId}`,
            cancel_url: `${ctx.req.headers.origin}/booking?canceled=true`,
          });

          const db = await getDb();
          if (db && session.id) {
            await db
              .update(appointments)
              .set({ stripeSessionId: session.id })
              .where(eq(appointments.trackingId, input.trackingId));
          }

          return {
            success: true,
            checkoutUrl: session.url,
          };
        } catch (error) {
          console.error("Stripe error:", error);
          throw new Error("Failed to create checkout session");
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;

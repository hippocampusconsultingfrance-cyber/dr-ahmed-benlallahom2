import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "../shared/const";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { contactMessages, gdprRequests, testimonials, appointments, blogPosts, availabilitySlots, blockedDates } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";
import { eq, and, sql, desc } from "drizzle-orm";
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
        // Generate a unique tracking ID (max 20 chars for varchar(20))
        const trackingId = `C${Math.random().toString(36).substring(2, 10).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;

        // Save the message to the database using raw SQL (TiDB DEFAULT bug workaround)
        const db = await getDb();
        if (db) {
          await db.execute(
            sql`INSERT INTO contact_messages (tracking_id, name, email, phone, message, gdpr_consent) VALUES (${trackingId}, ${input.name}, ${input.email}, ${input.phone || null}, ${input.message}, ${input.gdprConsent})`
          );
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
        // Generate a unique tracking ID (max 20 chars for varchar(20))
        const trackingId = `G${Math.random().toString(36).substring(2, 10).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;

        // Save the GDPR request to the database using raw SQL (TiDB DEFAULT bug workaround)
        const db = await getDb();
        if (db) {
          await db.execute(
            sql`INSERT INTO gdpr_requests (tracking_id, name, email, phone, request_type, description, status) VALUES (${trackingId}, ${input.name}, ${input.email}, ${input.phone || null}, ${input.requestType}, ${input.description || null}, ${'pending'})`
          );
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
    
    create: publicProcedure
      .input(
        z.object({
          authorName: z.string().min(1).max(100),
          rating: z.number().min(1).max(5),
          title: z.string().min(1).max(255),
          content: z.string().min(1).max(5000),
          specialty: z.string().min(1).max(255),
          language: z.string().default("fr"),
          featured: z.number().optional().default(0),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");

        await db.insert(testimonials).values({
          authorName: input.authorName,
          rating: input.rating,
          title: input.title,
          content: input.content,
          specialty: input.specialty,
          language: input.language,
          featured: input.featured,
          verified: 1,
          status: "approved",
        });

        return { success: true };
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

        const trackingId = `APT${Math.random().toString(36).substring(2, 10).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;

        const db = await getDb();
        if (!db) {
          throw new Error("Database connection failed");
        }

        try {
          const appointmentDateFormatted = date.toISOString().slice(0, 19).replace('T', ' ');
          await db.execute(
            sql`INSERT INTO appointments (tracking_id, customer_name, customer_email, customer_phone, consultation_type, request_details, appointment_date, duration, base_price, final_price, is_night_rate, payment_status, appointment_status) VALUES (${trackingId}, ${input.customerName}, ${input.customerEmail}, ${input.customerPhone}, ${'health_advice'}, ${input.requestDetails}, ${appointmentDateFormatted}, ${30}, ${basePrice}, ${finalPrice}, ${isNightRate ? 1 : 0}, ${'pending'}, ${'confirmed'})`
          );
        } catch (dbError) {
          console.error("Database insert error:", dbError);
          throw new Error(`Failed to create appointment: ${dbError instanceof Error ? dbError.message : "Unknown error"}`);
        }

        // Notifications will be sent AFTER payment confirmation via webhook
        // (see webhook handler in server/_core/index.ts)

        return {
          success: true,
          trackingId,
          finalPrice: parseFloat(finalPrice),
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
            allow_promotion_codes: true,
            customer_email: input.customerEmail,
            metadata: {
              trackingId: input.trackingId,
              customerName: input.customerName,
            },
            success_url: `${ctx.req.headers.origin || ctx.req.headers.referer?.replace(/\/booking.*$/, '') || 'https://drahmedbenlallahom.com'}/booking?success=true&trackingId=${input.trackingId}`,
            cancel_url: `${ctx.req.headers.origin || ctx.req.headers.referer?.replace(/\/booking.*$/, '') || 'https://drahmedbenlallahom.com'}/booking?canceled=true`,
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

  // Blog / Actualités
  blog: router({
    list: publicProcedure
      .input(
        z.object({
          language: z.string().optional().default("fr"),
          category: z.string().optional(),
          limit: z.number().min(1).max(50).optional().default(10),
          offset: z.number().min(0).optional().default(0),
        })
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { items: [], total: 0 };

        const conditions = [
          eq(blogPosts.published, 1),
          eq(blogPosts.language, input.language),
        ];
        if (input.category) {
          conditions.push(eq(blogPosts.category, input.category));
        }

        const whereClause = and(...conditions);
        const items = await db
          .select()
          .from(blogPosts)
          .where(whereClause)
          .orderBy(desc(blogPosts.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        const [countResult] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(blogPosts)
          .where(whereClause);

        return { items, total: countResult?.count || 0 };
      }),

    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;

        const results = await db
          .select()
          .from(blogPosts)
          .where(and(eq(blogPosts.slug, input.slug), eq(blogPosts.published, 1)))
          .limit(1);

        return results[0] || null;
      }),
  }),

  // Availability / Calendar
  availability: router({
    getSlots: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(availabilitySlots).where(eq(availabilitySlots.isActive, 1));
    }),

    getBlockedDates: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(blockedDates);
    }),

    getBookedSlots: publicProcedure
      .input(z.object({ date: z.string() })) // YYYY-MM-DD
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        // Get all confirmed/pending appointments for this date
        const results = await db
          .select({ appointmentDate: appointments.appointmentDate })
          .from(appointments)
          .where(
            and(
              sql`DATE(appointment_date) = ${input.date}`,
              sql`payment_status IN ('pending', 'completed')`,
              sql`appointment_status IN ('confirmed', 'completed')`
            )
          );

        return results.map(r => r.appointmentDate);
      }),
  }),

  // Admin Dashboard Procedures
  admin: router({
    // List all appointments with pagination
    appointments: router({
      list: adminProcedure
        .input(
          z.object({
            limit: z.number().min(1).max(100).optional().default(50),
            offset: z.number().min(0).optional().default(0),
            status: z.enum(["pending", "completed", "failed", "refunded"]).optional(),
          })
        )
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return { items: [], total: 0 };

          const conditions = [];
          if (input.status) {
            conditions.push(eq(appointments.paymentStatus, input.status));
          }

          const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

          const items = await db
            .select()
            .from(appointments)
            .where(whereClause)
            .orderBy(desc(appointments.createdAt))
            .limit(input.limit)
            .offset(input.offset);

          const countResult = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(appointments)
            .where(whereClause);

          return { items, total: countResult[0]?.count || 0 };
        }),

      updateStatus: adminProcedure
        .input(
          z.object({
            trackingId: z.string(),
            appointmentStatus: z.enum(["confirmed", "cancelled", "completed", "no_show"]),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db
            .update(appointments)
            .set({ appointmentStatus: input.appointmentStatus })
            .where(eq(appointments.trackingId, input.trackingId));

          return { success: true };
        }),
    }),

    // List all contact messages
    contacts: router({
      list: adminProcedure
        .input(
          z.object({
            limit: z.number().min(1).max(100).optional().default(50),
            offset: z.number().min(0).optional().default(0),
          })
        )
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return { items: [], total: 0 };

          const items = await db
            .select()
            .from(contactMessages)
            .orderBy(desc(contactMessages.createdAt))
            .limit(input.limit)
            .offset(input.offset);

          const countResult = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(contactMessages);

          return { items, total: countResult[0]?.count || 0 };
        }),

      markRead: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db
            .update(contactMessages)
            .set({ read: 1 })
            .where(eq(contactMessages.id, input.id));

          return { success: true };
        }),
    }),

    // List all GDPR requests
    gdprRequests: router({
      list: adminProcedure
        .input(
          z.object({
            limit: z.number().min(1).max(100).optional().default(50),
            offset: z.number().min(0).optional().default(0),
          })
        )
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return { items: [], total: 0 };

          const items = await db
            .select()
            .from(gdprRequests)
            .orderBy(desc(gdprRequests.createdAt))
            .limit(input.limit)
            .offset(input.offset);

          const countResult = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(gdprRequests);

          return { items, total: countResult[0]?.count || 0 };
        }),

      updateStatus: adminProcedure
        .input(
          z.object({
            id: z.number(),
            status: z.enum(["pending", "in_progress", "completed", "rejected"]),
            notes: z.string().optional(),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          const updateData: Record<string, any> = { status: input.status };
          if (input.notes) updateData.notes = input.notes;
          if (input.status === "completed") updateData.responseDate = new Date();

          await db
            .update(gdprRequests)
            .set(updateData)
            .where(eq(gdprRequests.id, input.id));

          return { success: true };
        }),
    }),

    // Dashboard stats
    stats: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { appointments: 0, contacts: 0, gdpr: 0, revenue: 0 };

      const [aptCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(appointments);
      const [contactCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(contactMessages);
      const [gdprCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(gdprRequests);
      const [revenueResult] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(final_price AS DECIMAL(10,2))), 0)` }).from(appointments).where(eq(appointments.paymentStatus, "completed"));

      return {
        appointments: aptCount?.count || 0,
        contacts: contactCount?.count || 0,
        gdpr: gdprCount?.count || 0,
        revenue: revenueResult?.total || 0,
      };
    }),

    // Manage testimonials
    testimonials: router({
      list: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(testimonials).orderBy(desc(testimonials.createdAt));
      }),

      updateStatus: adminProcedure
        .input(
          z.object({
            id: z.number(),
            status: z.enum(["pending", "approved", "rejected"]),
            featured: z.number().optional(),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          const updateData: Record<string, any> = { status: input.status };
          if (input.featured !== undefined) updateData.featured = input.featured;

          await db
            .update(testimonials)
            .set(updateData)
            .where(eq(testimonials.id, input.id));

          return { success: true };
        }),

      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db.delete(testimonials).where(eq(testimonials.id, input.id));
          return { success: true };
        }),
    }),

    // Blog management
    blog: router({
      list: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt));
      }),

      create: adminProcedure
        .input(
          z.object({
            title: z.string().min(1).max(500),
            slug: z.string().min(1).max(255),
            excerpt: z.string().optional(),
            content: z.string().min(1),
            coverImage: z.string().optional(),
            category: z.string().default("general"),
            language: z.string().default("fr"),
            source: z.string().optional(),
            published: z.number().default(0),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db.insert(blogPosts).values(input);
          return { success: true };
        }),

      update: adminProcedure
        .input(
          z.object({
            id: z.number(),
            title: z.string().optional(),
            excerpt: z.string().optional(),
            content: z.string().optional(),
            coverImage: z.string().optional(),
            category: z.string().optional(),
            language: z.string().optional(),
            source: z.string().optional(),
            published: z.number().optional(),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          const { id, ...data } = input;
          await db.update(blogPosts).set(data).where(eq(blogPosts.id, id));
          return { success: true };
        }),

      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db.delete(blogPosts).where(eq(blogPosts.id, input.id));
          return { success: true };
        }),
    }),

    // Availability management
    availability: router({
      listSlots: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(availabilitySlots);
      }),

      addSlot: adminProcedure
        .input(
          z.object({
            dayOfWeek: z.number().min(0).max(6),
            startTime: z.string().regex(/^\d{2}:\d{2}$/),
            endTime: z.string().regex(/^\d{2}:\d{2}$/),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db.insert(availabilitySlots).values(input);
          return { success: true };
        }),

      deleteSlot: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db.delete(availabilitySlots).where(eq(availabilitySlots.id, input.id));
          return { success: true };
        }),

      listBlockedDates: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(blockedDates);
      }),

      addBlockedDate: adminProcedure
        .input(
          z.object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            reason: z.string().optional(),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db.insert(blockedDates).values(input);
          return { success: true };
        }),

      removeBlockedDate: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db.delete(blockedDates).where(eq(blockedDates.id, input.id));
          return { success: true };
        }),
    }),
  }),
});

export type AppRouter = typeof appRouter;

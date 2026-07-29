import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Contact form submissions.
 * Stores all messages sent via the website contact form.
 */
export const contactMessages = mysqlTable("contact_messages", {
  id: int("id").autoincrement().primaryKey(),
  trackingId: varchar("tracking_id", { length: 20 }).notNull().unique(), // Unique tracking number for the user
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  message: text("message").notNull(),
  gdprConsent: int("gdpr_consent").default(0).notNull(), // 1 = accepted, 0 = not accepted
  read: int("read").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = typeof contactMessages.$inferInsert;

/**
 * GDPR Data Request submissions.
 * Stores requests for data access, rectification, or deletion (right to be forgotten).
 */
export const gdprRequests = mysqlTable("gdpr_requests", {
  id: int("id").autoincrement().primaryKey(),
  trackingId: varchar("tracking_id", { length: 20 }).notNull().unique(), // Unique tracking number for the user
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  requestType: mysqlEnum("request_type", ["access", "rectification", "deletion", "portability", "objection"]).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "rejected"]).default("pending").notNull(),
  responseDate: timestamp("response_date"),
  notes: text("notes"),
  read: int("read").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GdprRequest = typeof gdprRequests.$inferSelect;
export type InsertGdprRequest = typeof gdprRequests.$inferInsert;

/**
 * Testimonials/Reviews table.
 * Stores patient testimonials and reviews with privacy protection (initials/first names only).
 */
export const testimonials = mysqlTable("testimonials", {
  id: int("id").autoincrement().primaryKey(),
  authorName: varchar("author_name", { length: 100 }).notNull(), // Initials or first name only
  rating: int("rating").notNull(), // 1-5 stars
  title: varchar("title", { length: 255 }).notNull(), // Short title
  content: text("content").notNull(), // Full review text
  specialty: varchar("specialty", { length: 100 }), // Medical specialty or treatment type
  verified: int("verified").default(0).notNull(), // 1 = verified, 0 = not verified
  featured: int("featured").default(0).notNull(), // 1 = homepage, 0 = testimonials page only
  language: varchar("language", { length: 10 }).default("fr").notNull(), // Language code
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Testimonial = typeof testimonials.$inferSelect;
export type InsertTestimonial = typeof testimonials.$inferInsert;

/**
 * Appointments/Reservations table.
 * Stores health consultation appointments with payment and status tracking.
 */
export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  trackingId: varchar("tracking_id", { length: 20 }).notNull().unique(), // Unique booking reference
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 320 }).notNull(),
  customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
  consultationType: varchar("consultation_type", { length: 100 }).default("health_advice").notNull(),
  requestDetails: text("request_details").notNull(), // Free text description of the request
  appointmentDate: timestamp("appointment_date").notNull(), // Date and time of the appointment
  duration: int("duration").default(30).notNull(), // Duration in minutes
  basePrice: varchar("base_price", { length: 20 }).notNull(), // Base price (100 EUR)
  finalPrice: varchar("final_price", { length: 20 }).notNull(), // Final price with surcharges
  isNightRate: int("is_night_rate").default(0).notNull(), // 1 = night rate (18h-8h), 0 = normal rate
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }), // Stripe Payment Intent ID
  stripeSessionId: varchar("stripe_session_id", { length: 255 }), // Stripe Checkout Session ID
  paymentStatus: mysqlEnum("payment_status", ["pending", "completed", "failed", "refunded"]).default("pending").notNull(),
  appointmentStatus: mysqlEnum("appointment_status", ["confirmed", "cancelled", "completed", "no_show"]).default("confirmed").notNull(),
  meetLink: varchar("meet_link", { length: 500 }), // Google Meet link
  cancellationReason: text("cancellation_reason"), // Reason for cancellation if applicable
  cancelledAt: timestamp("cancelled_at"), // Timestamp of cancellation
  refundAmount: varchar("refund_amount", { length: 20 }), // Amount refunded if applicable
  refundedAt: timestamp("refunded_at"), // Timestamp of refund
  emailSent: int("email_sent").default(0).notNull(), // 1 = confirmation email sent
  smsSent: int("sms_sent").default(0).notNull(), // 1 = SMS notification sent
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

/**
 * Blog posts / Medical news articles.
 * Admin can publish articles, veille scientifique, etc.
 */
export const blogPosts = mysqlTable("blog_posts", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 500 }).notNull(),
  excerpt: text("excerpt"), // Short summary for cards
  content: text("content").notNull(), // Full article content (markdown)
  coverImage: varchar("cover_image", { length: 500 }), // URL to cover image
  category: varchar("category", { length: 100 }).default("general").notNull(),
  language: varchar("language", { length: 10 }).default("fr").notNull(),
  source: varchar("source", { length: 500 }), // Source URL for veille articles
  published: int("published").default(0).notNull(), // 1 = published, 0 = draft
  authorId: int("author_id"), // Reference to users table
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

/**
 * Availability slots for the doctor.
 * Defines when the doctor is available for consultations.
 */
export const availabilitySlots = mysqlTable("availability_slots", {
  id: int("id").autoincrement().primaryKey(),
  dayOfWeek: int("day_of_week").notNull(), // 0=Sunday, 1=Monday, ..., 6=Saturday
  startTime: varchar("start_time", { length: 5 }).notNull(), // HH:MM format
  endTime: varchar("end_time", { length: 5 }).notNull(), // HH:MM format
  isActive: int("is_active").default(1).notNull(), // 1 = active, 0 = disabled
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AvailabilitySlot = typeof availabilitySlots.$inferSelect;
export type InsertAvailabilitySlot = typeof availabilitySlots.$inferInsert;

/**
 * Blocked dates (holidays, vacations, etc.)
 */
export const blockedDates = mysqlTable("blocked_dates", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD format
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BlockedDate = typeof blockedDates.$inferSelect;
export type InsertBlockedDate = typeof blockedDates.$inferInsert;

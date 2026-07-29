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

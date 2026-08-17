import { index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  reminderSent: int("reminder_sent").default(0).notNull(), // 1 = 24h reminder sent
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

/**
 * International healthcare recruitment applications with AI intelligence metadata.
 */
export const cvApplications = mysqlTable("cv_applications", {
  id: int("id").autoincrement().primaryKey(),
  trackingId: varchar("tracking_id", { length: 20 }).notNull().unique(),
  firstName: varchar("first_name", { length: 120 }).notNull(),
  lastName: varchar("last_name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  specialty: varchar("specialty", { length: 160 }).notNull(),
  targetCountries: text("target_countries").notNull(),
  languages: text("languages"),
  yearsExperience: int("years_experience"),
  availability: varchar("availability", { length: 100 }),
  mobility: varchar("mobility", { length: 150 }),
  certifications: text("certifications"),
  message: text("message"),
  cvFileKey: varchar("cv_file_key", { length: 500 }).notNull(),
  cvOriginalName: varchar("cv_original_name", { length: 255 }).notNull(),
  cvMimeType: varchar("cv_mime_type", { length: 100 }).notNull(),
  cvSizeBytes: int("cv_size_bytes").notNull(),
  fileValidationStatus: mysqlEnum("file_validation_status", ["quarantined", "accepted", "rejected", "validation_failed"]).default("quarantined").notNull(),
  fileChecksum: varchar("file_checksum", { length: 64 }),
  fileValidationNotes: text("file_validation_notes"),
  fileValidatedAt: timestamp("file_validated_at"),
  normalizedCertifications: text("normalized_certifications"),
  normalizedLanguages: text("normalized_languages"),
  normalizedExperiences: text("normalized_experiences"),
  gdprConsent: int("gdpr_consent").default(0).notNull(),
  marketingConsent: int("marketing_consent").default(0).notNull(),
  status: mysqlEnum("status", ["new", "reviewing", "shortlisted", "placed", "rejected", "archived"]).default("new").notNull(),
  adminNotes: text("admin_notes"),
  consentAt: timestamp("consent_at"),
  retentionUntil: timestamp("retention_until"),
  // AI Recruitment Intelligence fields
  aiSummary: text("ai_summary"),
  aiScore: int("ai_score"), // 0 to 100 fit score
  aiStrengths: text("ai_strengths"), // JSON array string
  aiWeaknesses: text("ai_weaknesses"), // JSON array string
  aiExtractedSkills: text("ai_extracted_skills"), // JSON array string
  aiMatchReasoning: text("ai_match_reasoning"),
  aiAnalyzedAt: timestamp("ai_analyzed_at"),
  analysisStatus: mysqlEnum("analysis_status", ["queued", "extracting", "analyzing", "completed", "needs_review", "failed"]).default("queued").notNull(),
  analysisAttempts: int("analysis_attempts").default(0).notNull(),
  analysisLastError: text("analysis_last_error"),
  analysisModel: varchar("analysis_model", { length: 100 }),
  analysisPromptVersion: varchar("analysis_prompt_version", { length: 40 }),
  extractionMethod: varchar("extraction_method", { length: 40 }),
  extractionPageCount: int("extraction_page_count"),
  analysisRequestedAt: timestamp("analysis_requested_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CvApplication = typeof cvApplications.$inferSelect;
export type InsertCvApplication = typeof cvApplications.$inferInsert;

/**
 * Durable queue of document-processing jobs. One job is retried safely instead of
 * holding the candidate HTTP request while parsing files and calling the model.
 */
export const cvProcessingJobs = mysqlTable("cv_processing_jobs", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("application_id").notNull(),
  jobType: mysqlEnum("job_type", ["analyze_cv"]).default("analyze_cv").notNull(),
  status: mysqlEnum("job_status", ["queued", "running", "completed", "retry", "failed"]).default("queued").notNull(),
  attempts: int("attempts").default(0).notNull(),
  maxAttempts: int("max_attempts").default(3).notNull(),
  scheduledFor: timestamp("scheduled_for").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => ({
  jobScheduleIdx: index("cv_processing_jobs_schedule_idx").on(table.status, table.scheduledFor),
  applicationIdx: index("cv_processing_jobs_application_idx").on(table.applicationId),
}));

export type CvProcessingJob = typeof cvProcessingJobs.$inferSelect;
export type InsertCvProcessingJob = typeof cvProcessingJobs.$inferInsert;

/**
 * Immutable administrative audit trail for sensitive recruitment actions.
 */
export const recruitmentAuditLogs = mysqlTable("recruitment_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("application_id"),
  adminOpenId: varchar("admin_open_id", { length: 128 }).notNull(),
  action: mysqlEnum("action", ["download", "reanalyze", "erase", "email", "status_update", "retention_cleanup"]).notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  applicationIdx: index("recruitment_audit_application_idx").on(table.applicationId),
  createdIdx: index("recruitment_audit_created_idx").on(table.createdAt),
}));

export type RecruitmentAuditLog = typeof recruitmentAuditLogs.$inferSelect;
export type InsertRecruitmentAuditLog = typeof recruitmentAuditLogs.$inferInsert;

/**
 * Admin-defined matching profiles for country/specialty/language/score screening.
 */
export const recruitmentMatchProfiles = mysqlTable("recruitment_match_profiles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  targetCountry: varchar("target_country", { length: 120 }),
  specialty: varchar("specialty", { length: 160 }),
  minimumScore: int("minimum_score").default(0).notNull(),
  requiredLanguages: text("required_languages"),
  requiredSkills: text("required_skills"),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type RecruitmentMatchProfile = typeof recruitmentMatchProfiles.$inferSelect;
export type InsertRecruitmentMatchProfile = typeof recruitmentMatchProfiles.$inferInsert;

/**
 * Employer mission briefs. Keeping this table in Drizzle prevents typed-schema
 * drift between the public brief endpoint and the administrative workflow.
 */
export const clientBriefs = mysqlTable("client_briefs", {
  id: int("id").autoincrement().primaryKey(),
  briefId: varchar("brief_id", { length: 20 }).notNull().unique(),
  organizationName: varchar("organization_name", { length: 180 }).notNull(),
  contactName: varchar("contact_name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  targetEnvironment: varchar("target_environment", { length: 120 }).notNull(),
  specialtyNeeded: varchar("specialty_needed", { length: 160 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  requiredCertifications: text("required_certifications"),
  timeline: varchar("timeline", { length: 100 }),
  notes: text("notes"),
  status: mysqlEnum("brief_status", ["new", "reviewing", "shortlist_sent", "contract_signed", "closed"]).default("new").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientBrief = typeof clientBriefs.$inferSelect;
export type InsertClientBrief = typeof clientBriefs.$inferInsert;

/** Shortlist and review state connecting an employer mission to selected candidates. */
export const clientBriefCandidates = mysqlTable("client_brief_candidates", {
  id: int("id").autoincrement().primaryKey(),
  briefId: int("brief_id").notNull(),
  applicationId: int("application_id").notNull(),
  matchScore: int("match_score"),
  status: mysqlEnum("association_status", ["suggested", "reviewing", "shortlisted", "declined"]).default("suggested").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => ({
  briefIdx: index("client_brief_candidates_brief_idx").on(table.briefId),
  applicationIdx: index("client_brief_candidates_application_idx").on(table.applicationId),
}));

export type ClientBriefCandidate = typeof clientBriefCandidates.$inferSelect;

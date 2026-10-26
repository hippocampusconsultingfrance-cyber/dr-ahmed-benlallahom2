import { index, integer as int, pgTable as mysqlTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

// Keep the existing schema declarations readable while storing enum-like
// values as typed PostgreSQL varchar columns. This avoids global enum-name
// collisions because several tables intentionally use a column named status.
function mysqlEnum<const T extends readonly [string, ...string[]]>(name: string, values: T) {
  const length = Math.max(32, ...values.map(value => value.length));
  return varchar(name, { length }).$type<T[number]>();
}

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
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Contact form submissions.
 * Stores all messages sent via the website contact form.
 */
export const contactMessages = mysqlTable("contact_messages", {
  id: serial("id").primaryKey(),
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
  id: serial("id").primaryKey(),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type GdprRequest = typeof gdprRequests.$inferSelect;
export type InsertGdprRequest = typeof gdprRequests.$inferInsert;

/**
 * Private medical information requests, moderated by an administrator before any response or publication.
 * Personal contact details are never part of the public query shape.
 */
export const medicalQuestions = mysqlTable("medical_questions", {
  id: serial("id").primaryKey(),
  trackingId: varchar("tracking_id", { length: 32 }).notNull().unique(),
  firstName: varchar("first_name", { length: 120 }).notNull(),
  lastName: varchar("last_name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  question: text("question").notNull(),
  language: varchar("language", { length: 10 }).default("fr").notNull(),
  privacyConsent: int("privacy_consent").default(0).notNull(),
  publicationConsent: int("publication_consent").default(0).notNull(),
  urgencyAcknowledged: int("urgency_acknowledged").default(0).notNull(),
  status: mysqlEnum("status", ["submitted", "drafting", "answered", "published", "rejected"]).default("submitted").notNull(),
  adminResponse: text("admin_response"),
  publicQuestion: text("public_question"),
  publicResponse: text("public_response"),
  respondedByOpenId: varchar("responded_by_open_id", { length: 64 }),
  responseSentAt: timestamp("response_sent_at"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  privateStatusCreated: index("medical_questions_status_created_idx").on(table.status, table.createdAt),
  publicPublication: index("medical_questions_publication_idx").on(table.status, table.publishedAt),
}));

export const medicalQuestionAuditLogs = mysqlTable("medical_question_audit_logs", {
  id: serial("id").primaryKey(),
  medicalQuestionId: int("medical_question_id").notNull(),
  actorOpenId: varchar("actor_open_id", { length: 64 }),
  action: varchar("action", { length: 80 }).notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  questionCreated: index("medical_question_audit_question_created_idx").on(table.medicalQuestionId, table.createdAt),
}));

export type MedicalQuestion = typeof medicalQuestions.$inferSelect;
export type InsertMedicalQuestion = typeof medicalQuestions.$inferInsert;

/**
 * Testimonials/Reviews table.
 * Stores patient testimonials and reviews with privacy protection (initials/first names only).
 */
export const testimonials = mysqlTable("testimonials", {
  id: serial("id").primaryKey(),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Testimonial = typeof testimonials.$inferSelect;
export type InsertTestimonial = typeof testimonials.$inferInsert;

/**
 * Appointments/Reservations table.
 * Stores health consultation appointments with payment and status tracking.
 */
export const appointments = mysqlTable("appointments", {
  id: serial("id").primaryKey(),
  trackingId: varchar("tracking_id", { length: 20 }).notNull().unique(), // Unique booking reference
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 320 }).notNull(),
  customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
  consultationType: varchar("consultation_type", { length: 100 }).default("health_advice").notNull(),
  requestDetails: text("request_details").notNull(), // Free text description of the request
  appointmentDate: timestamp("appointment_date").notNull(), // Date and time of the appointment
  slotKey: varchar("slot_key", { length: 64 }), // Unique active 30-minute slot lock; cleared when cancelled
  duration: int("duration").default(30).notNull(), // Duration in minutes
  basePrice: varchar("base_price", { length: 20 }).notNull(), // Base price (100 EUR)
  finalPrice: varchar("final_price", { length: 20 }).notNull(), // Final price with surcharges
  isNightRate: int("is_night_rate").default(0).notNull(), // 1 = night rate (18h-8h), 0 = normal rate
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }), // Stripe Payment Intent ID
  stripeSessionId: varchar("stripe_session_id", { length: 255 }), // Stripe Checkout Session ID
  paymentStatus: mysqlEnum("payment_status", ["pending", "completed", "failed", "refunded"]).default("pending").notNull(),
  appointmentStatus: mysqlEnum("appointment_status", ["held", "confirmed", "cancelled", "completed", "no_show"]).default("held").notNull(),
  holdExpiresAt: timestamp("hold_expires_at"), // Temporary unpaid booking lock; cleared once paid or released.
  meetLink: varchar("meet_link", { length: 500 }), // Google Meet link
  cancellationReason: text("cancellation_reason"), // Reason for cancellation if applicable
  cancelledAt: timestamp("cancelled_at"), // Timestamp of cancellation
  refundAmount: varchar("refund_amount", { length: 20 }), // Amount refunded if applicable
  refundedAt: timestamp("refunded_at"), // Timestamp of refund
  emailSent: int("email_sent").default(0).notNull(), // 1 = confirmation email sent
  smsSent: int("sms_sent").default(0).notNull(), // 1 = SMS notification sent
  reminderSent: int("reminder_sent").default(0).notNull(), // 1 = 24h reminder sent
  // Language of the booking page (fr, en, de, zh): patient emails in French for
  // "fr", in English otherwise (EN-01). Also added at runtime: server/languageColumns.ts.
  language: varchar("language", { length: 10 }).default("fr").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => ({
  activeSlotUnique: uniqueIndex("appointments_active_slot_unique").on(table.slotKey),
  holdExpiry: index("appointments_hold_expiry_idx").on(table.appointmentStatus, table.paymentStatus, table.holdExpiresAt),
}));

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

/** Durable post-payment work. Stripe webhooks only enqueue work; notifications and invoices are retried safely. */
export const appointmentFulfillmentJobs = mysqlTable("appointment_fulfillment_jobs", {
  id: serial("id").primaryKey(),
  appointmentId: int("appointment_id").notNull(),
  // varchar column: "owner" (new-booking notification to the owner, sent first)
  // needs no migration.
  jobType: mysqlEnum("job_type", ["owner", "confirmation", "invoice"]).notNull(),
  status: mysqlEnum("status", ["queued", "running", "retry", "completed", "failed"]).default("queued").notNull(),
  attempts: int("attempts").default(0).notNull(),
  maxAttempts: int("max_attempts").default(3).notNull(),
  scheduledFor: timestamp("scheduled_for").defaultNow().notNull(),
  lastError: text("last_error"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  appointmentJobUnique: uniqueIndex("appointment_fulfillment_unique").on(table.appointmentId, table.jobType),
  dueJobs: index("appointment_fulfillment_due_idx").on(table.status, table.scheduledFor),
}));

/**
 * One invoice per paid appointment, numbered once and without gaps inside a
 * yearly series (FAC-2026-000001). Created at runtime by
 * server/invoiceNumbering.ts (ensureInvoiceSchema, idempotent DDL): no manual
 * production migration. Kept out of `appointments` so that existing selects on
 * that table never reference a column the live database may not have yet.
 */
export const appointmentInvoices = mysqlTable("appointment_invoices", {
  id: serial("id").primaryKey(),
  appointmentId: int("appointment_id").notNull(),
  invoiceSeries: varchar("invoice_series", { length: 16 }).notNull(),
  invoiceSequence: int("invoice_sequence").notNull(),
  invoiceNumber: varchar("invoice_number", { length: 32 }).notNull(),
  issuedAt: timestamp("issued_at").notNull(),
  paidAt: timestamp("paid_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  appointmentUnique: uniqueIndex("appointment_invoices_appointment_unique").on(table.appointmentId),
  numberUnique: uniqueIndex("appointment_invoices_number_unique").on(table.invoiceNumber),
  seriesSequenceUnique: uniqueIndex("appointment_invoices_series_sequence_unique").on(table.invoiceSeries, table.invoiceSequence),
}));

/**
 * Blog posts / Medical news articles.
 * Admin can publish articles, veille scientifique, etc.
 */
export const blogPosts = mysqlTable("blog_posts", {
  id: serial("id").primaryKey(),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

/**
 * Availability slots for the doctor.
 * Defines when the doctor is available for consultations.
 */
export const availabilitySlots = mysqlTable("availability_slots", {
  id: serial("id").primaryKey(),
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
  id: serial("id").primaryKey(),
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
  id: serial("id").primaryKey(),
  trackingId: varchar("tracking_id", { length: 20 }).notNull().unique(),
  firstName: varchar("first_name", { length: 120 }).notNull(),
  lastName: varchar("last_name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  specialty: varchar("specialty", { length: 160 }).notNull(),
  diplomaCountry: varchar("diploma_country", { length: 100 }),
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
  fileSecurityScanVersion: varchar("file_security_scan_version", { length: 40 }),
  normalizedCertifications: text("normalized_certifications"),
  normalizedLanguages: text("normalized_languages"),
  normalizedExperiences: text("normalized_experiences"),
  gdprConsent: int("gdpr_consent").default(0).notNull(),
  marketingConsent: int("marketing_consent").default(0).notNull(),
  marketingUnsubscribeToken: varchar("marketing_unsubscribe_token", { length: 80 }),
  marketingUnsubscribedAt: timestamp("marketing_unsubscribed_at"),
  marketingSuppressedAt: timestamp("marketing_suppressed_at"),
  lastContactedAt: timestamp("last_contacted_at"),
  lastCandidateResponseAt: timestamp("last_candidate_response_at"),
  status: mysqlEnum("status", ["new", "reviewing", "shortlisted", "placed", "rejected", "archived"]).default("new").notNull(),
  adminNotes: text("admin_notes"),
  consentAt: timestamp("consent_at"),
  retentionUntil: timestamp("retention_until"),
  retentionReviewNotifiedAt: timestamp("retention_review_notified_at"),
  // AI Recruitment Intelligence fields
  aiSummary: text("ai_summary"),
  aiScore: int("ai_score"), // 0 to 100 fit score
  aiStrengths: text("ai_strengths"), // JSON array string
  aiWeaknesses: text("ai_weaknesses"), // JSON array string
  aiExtractedSkills: text("ai_extracted_skills"), // JSON array string
  aiMatchReasoning: text("ai_match_reasoning"),
  extractedText: text("extracted_text"),
  aiAnalyzedAt: timestamp("ai_analyzed_at"),
  // degraded: the AI provider refused the analysis (billing); « Mettre à jour /
  // reprendre l’IA » analyses the CV again (REC-08). Same varchar(32) column.
  analysisStatus: mysqlEnum("analysis_status", ["queued", "extracting", "analyzing", "completed", "needs_review", "degraded", "failed"]).default("queued").notNull(),
  analysisAttempts: int("analysis_attempts").default(0).notNull(),
  analysisLastError: text("analysis_last_error"),
  analysisModel: varchar("analysis_model", { length: 100 }),
  analysisPromptVersion: varchar("analysis_prompt_version", { length: 40 }),
  extractionMethod: varchar("extraction_method", { length: 40 }),
  extractionPageCount: int("extraction_page_count"),
  extractionTotalPages: int("extraction_total_pages"),
  ocrConfidence: int("ocr_confidence"),
  ocrModelVersion: varchar("ocr_model_version", { length: 100 }),
  extractionWarnings: text("extraction_warnings"),
  analysisRequestedAt: timestamp("analysis_requested_at"),
  // Language of the application form (fr, en, de, zh), not the spoken languages
  // above: candidate emails in French for "fr", in English otherwise (EN-02).
  language: varchar("language", { length: 10 }).default("fr").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type CvApplication = typeof cvApplications.$inferSelect;
export type InsertCvApplication = typeof cvApplications.$inferInsert;

/** Normalized certifications extracted from or declared in a candidate CV. */
export const cvCandidateCertifications = mysqlTable("cv_candidate_certifications", {
  id: serial("id").primaryKey(),
  applicationId: int("application_id").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  issuingBody: varchar("issuing_body", { length: 180 }),
  country: varchar("country", { length: 100 }),
  expiresAt: varchar("expires_at", { length: 10 }),
  evidence: text("evidence"),
  source: mysqlEnum("source", ["declared", "extracted"]).default("extracted").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  applicationIdx: index("cv_candidate_certifications_application_idx").on(table.applicationId),
  nameIdx: index("cv_candidate_certifications_name_idx").on(table.name),
}));

/** Normalized languages with a controlled level or unknown when no level is stated. */
export const cvCandidateLanguages = mysqlTable("cv_candidate_languages", {
  id: serial("id").primaryKey(),
  applicationId: int("application_id").notNull(),
  language: varchar("language", { length: 80 }).notNull(),
  proficiency: mysqlEnum("proficiency", ["basic", "working", "professional", "fluent", "native", "unknown"]).default("unknown").notNull(),
  evidence: text("evidence"),
  source: mysqlEnum("source", ["declared", "extracted"]).default("extracted").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  applicationIdx: index("cv_candidate_languages_application_idx").on(table.applicationId),
  languageIdx: index("cv_candidate_languages_language_idx").on(table.language),
}));

/** Structured professional experience used for transparent human-reviewed matching. */
export const cvCandidateExperiences = mysqlTable("cv_candidate_experiences", {
  id: serial("id").primaryKey(),
  applicationId: int("application_id").notNull(),
  role: varchar("role", { length: 180 }).notNull(),
  organization: varchar("organization", { length: 180 }).notNull(),
  startDate: varchar("start_date", { length: 10 }),
  endDate: varchar("end_date", { length: 10 }),
  employmentType: mysqlEnum("employment_type", ["permanent", "temporary", "locum", "internship", "fellowship", "rotation", "volunteer", "unknown"]).default("unknown").notNull(),
  specialty: varchar("specialty", { length: 160 }).notNull(),
  country: varchar("country", { length: 100 }),
  durationMonths: int("duration_months"),
  evidence: text("evidence"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  applicationIdx: index("cv_candidate_experiences_application_idx").on(table.applicationId),
  specialtyIdx: index("cv_candidate_experiences_specialty_idx").on(table.specialty),
}));

/**
 * Durable queue of document-processing jobs. One job is retried safely instead of
 * holding the candidate HTTP request while parsing files and calling the model.
 */
export const cvProcessingJobs = mysqlTable("cv_processing_jobs", {
  id: serial("id").primaryKey(),
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
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  jobScheduleIdx: index("cv_processing_jobs_schedule_idx").on(table.status, table.scheduledFor),
  applicationIdx: index("cv_processing_jobs_application_idx").on(table.applicationId),
}));

export type CvProcessingJob = typeof cvProcessingJobs.$inferSelect;
export type InsertCvProcessingJob = typeof cvProcessingJobs.$inferInsert;

/** One encrypted Google Drive authorization dedicated to recruitment CV exports. */
export const googleDriveConnections = mysqlTable("google_drive_connections", {
  id: serial("id").primaryKey(),
  connectionKey: varchar("connection_key", { length: 64 }).notNull().unique(),
  authorizedByOpenId: varchar("authorized_by_open_id", { length: 128 }).notNull(),
  folderId: varchar("folder_id", { length: 128 }).notNull(),
  refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
  refreshTokenIv: varchar("refresh_token_iv", { length: 32 }).notNull(),
  refreshTokenAuthTag: varchar("refresh_token_auth_tag", { length: 32 }).notNull(),
  grantedScopes: text("granted_scopes"),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Durable, idempotent copies of accepted CVs into the private Google Drive folder. */
export const cvGoogleDriveExportJobs = mysqlTable("cv_google_drive_export_jobs", {
  id: serial("id").primaryKey(),
  applicationId: int("application_id").notNull().unique(),
  status: mysqlEnum("status", ["queued", "running", "retry", "completed", "failed"]).default("queued").notNull(),
  attempts: int("attempts").default(0).notNull(),
  maxAttempts: int("max_attempts").default(5).notNull(),
  scheduledFor: timestamp("scheduled_for").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  lastError: text("last_error"),
  driveFileId: varchar("drive_file_id", { length: 128 }),
  driveFileUrl: varchar("drive_file_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  dueJobs: index("cv_drive_export_due_idx").on(table.status, table.scheduledFor),
}));

export type GoogleDriveConnection = typeof googleDriveConnections.$inferSelect;
export type CvGoogleDriveExportJob = typeof cvGoogleDriveExportJobs.$inferSelect;

/**
 * Immutable administrative audit trail for sensitive recruitment actions.
 */
export const recruitmentAuditLogs = mysqlTable("recruitment_audit_logs", {
  id: serial("id").primaryKey(),
  applicationId: int("application_id"),
  adminOpenId: varchar("admin_open_id", { length: 128 }).notNull(),
  action: mysqlEnum("action", ["download", "reanalyze", "erase", "email", "status_update", "retention_cleanup", "export", "unsubscribe"]).notNull(),
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
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  targetCountry: varchar("target_country", { length: 120 }),
  specialty: varchar("specialty", { length: 160 }),
  minimumScore: int("minimum_score").default(0).notNull(),
  requiredLanguages: text("required_languages"),
  requiredSkills: text("required_skills"),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type RecruitmentMatchProfile = typeof recruitmentMatchProfiles.$inferSelect;
export type InsertRecruitmentMatchProfile = typeof recruitmentMatchProfiles.$inferInsert;

/**
 * Employer mission briefs. Keeping this table in Drizzle prevents typed-schema
 * drift between the public brief endpoint and the administrative workflow.
 */
export const clientBriefs = mysqlTable("client_briefs", {
  id: serial("id").primaryKey(),
  briefId: varchar("brief_id", { length: 20 }).notNull().unique(),
  organizationName: varchar("organization_name", { length: 180 }).notNull(),
  contactName: varchar("contact_name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  targetEnvironment: varchar("target_environment", { length: 120 }).notNull(),
  specialtyNeeded: varchar("specialty_needed", { length: 160 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  requiredCertifications: text("required_certifications"),
  requiredLanguages: text("required_languages"),
  minimumYearsExperience: int("minimum_years_experience"),
  availabilityNeeded: varchar("availability_needed", { length: 100 }),
  jobDescription: text("job_description"),
  timeline: varchar("timeline", { length: 100 }),
  notes: text("notes"),
  status: mysqlEnum("brief_status", ["new", "reviewing", "shortlist_sent", "contract_signed", "closed"]).default("new").notNull(),
  acknowledgedAt: timestamp("acknowledged_at"),
  shortlistSentAt: timestamp("shortlist_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientBrief = typeof clientBriefs.$inferSelect;
export type InsertClientBrief = typeof clientBriefs.$inferInsert;

/** Shortlist and review state connecting an employer mission to selected candidates. */
export const clientBriefCandidates = mysqlTable("client_brief_candidates", {
  id: serial("id").primaryKey(),
  briefId: int("brief_id").notNull(),
  applicationId: int("application_id").notNull(),
  matchScore: int("match_score"),
  matchBreakdown: text("match_breakdown"),
  status: mysqlEnum("association_status", ["suggested", "reviewing", "shortlisted", "declined"]).default("suggested").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  briefIdx: index("client_brief_candidates_brief_idx").on(table.briefId),
  applicationIdx: index("client_brief_candidates_application_idx").on(table.applicationId),
}));

export type ClientBriefCandidate = typeof clientBriefCandidates.$inferSelect;

/**
 * Human-approved recruitment offer campaigns. A campaign is only created by an
 * administrator after a visible audience preview; automated decision making is
 * deliberately out of scope.
 */
export const recruitmentCampaigns = mysqlTable("recruitment_campaigns", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  language: mysqlEnum("language", ["fr", "en"]).default("fr").notNull(),
  audienceMode: mysqlEnum("audience_mode", ["selected", "all_eligible", "filtered"]).notNull(),
  audienceFilters: text("audience_filters"),
  recipientCount: int("recipient_count").default(0).notNull(),
  status: mysqlEnum("status", ["draft", "sending", "sent", "partially_sent", "failed"]).default("draft").notNull(),
  createdByOpenId: varchar("created_by_open_id", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
}, table => ({
  statusIdx: index("recruitment_campaigns_status_idx").on(table.status, table.createdAt),
}));

export type RecruitmentCampaign = typeof recruitmentCampaigns.$inferSelect;

/** Reusable, admin-owned copy blocks for recurring medical recruitment offers. */
export const recruitmentOfferTemplates = mysqlTable("recruitment_offer_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  category: mysqlEnum("category", ["europe", "canada", "middle_east", "vvip_offshore", "paramedical", "general"]).default("general").notNull(),
  language: mysqlEnum("language", ["fr", "en"]).default("fr").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  active: int("active").default(1).notNull(),
  createdByOpenId: varchar("created_by_open_id", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  activeIdx: index("recruitment_offer_templates_active_idx").on(table.active, table.updatedAt),
}));

export type RecruitmentOfferTemplate = typeof recruitmentOfferTemplates.$inferSelect;

/** Immutable delivery log for a campaign recipient. */
export const recruitmentCampaignRecipients = mysqlTable("recruitment_campaign_recipients", {
  id: serial("id").primaryKey(),
  campaignId: int("campaign_id").notNull(),
  applicationId: int("application_id").notNull(),
  recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
  deliveryStatus: mysqlEnum("delivery_status", ["queued", "sent", "delivered", "delayed", "bounced", "complained", "failed", "suppressed", "skipped"]).default("queued").notNull(),
  providerEmailId: varchar("provider_email_id", { length: 120 }),
  error: text("error"),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  lastEventAt: timestamp("last_event_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  campaignIdx: index("recruitment_campaign_recipients_campaign_idx").on(table.campaignId),
  applicationIdx: index("recruitment_campaign_recipients_application_idx").on(table.applicationId),
}));

export type RecruitmentCampaignRecipient = typeof recruitmentCampaignRecipients.$inferSelect;

/** Manual follow-up worklist; reminders are suggestions only and never send email by themselves. */
export const recruitmentFollowUpTasks = mysqlTable("recruitment_follow_up_tasks", {
  id: serial("id").primaryKey(),
  applicationId: int("application_id").notNull(),
  campaignId: int("campaign_id"),
  kind: mysqlEnum("kind", ["follow_up_7", "follow_up_14", "custom"]).notNull(),
  dueAt: timestamp("due_at").notNull(),
  status: mysqlEnum("status", ["suggested", "completed", "dismissed"]).default("suggested").notNull(),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  completedByOpenId: varchar("completed_by_open_id", { length: 128 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  applicationIdx: index("recruitment_follow_up_tasks_application_idx").on(table.applicationId, table.status, table.dueAt),
  campaignIdx: index("recruitment_follow_up_tasks_campaign_idx").on(table.campaignId),
}));

export type RecruitmentFollowUpTask = typeof recruitmentFollowUpTasks.$inferSelect;

/** Idempotent provider event archive used for delivery reporting and bounce suppression. */
export const recruitmentEmailEvents = mysqlTable("recruitment_email_events", {
  id: serial("id").primaryKey(),
  providerEventId: varchar("provider_event_id", { length: 120 }).notNull().unique(),
  providerEmailId: varchar("provider_email_id", { length: 120 }),
  campaignRecipientId: int("campaign_recipient_id"),
  applicationId: int("application_id"),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  recipientEmail: varchar("recipient_email", { length: 320 }),
  payload: text("payload"),
  occurredAt: timestamp("occurred_at").notNull(),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
}, table => ({
  providerEmailIdx: index("recruitment_email_events_provider_email_idx").on(table.providerEmailId),
  applicationIdx: index("recruitment_email_events_application_idx").on(table.applicationId),
}));

export type RecruitmentEmailEvent = typeof recruitmentEmailEvents.$inferSelect;

/** Candidate-owned account, activated by a one-time email verification link. */
export const candidateAccounts = mysqlTable("candidate_accounts", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  firstName: varchar("first_name", { length: 120 }),
  lastName: varchar("last_name", { length: 120 }),
  passwordHash: varchar("password_hash", { length: 512 }).notNull(),
  emailVerifiedAt: timestamp("email_verified_at"),
  verificationTokenHash: varchar("verification_token_hash", { length: 128 }),
  verificationExpiresAt: timestamp("verification_expires_at"),
  passwordResetTokenHash: varchar("password_reset_token_hash", { length: 128 }),
  passwordResetExpiresAt: timestamp("password_reset_expires_at"),
  failedLoginCount: int("failed_login_count").default(0).notNull(),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  linkedApplicationId: int("linked_application_id"),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  documentConsentAt: timestamp("document_consent_at"),
  status: mysqlEnum("status", ["active", "disabled", "erased"]).default("active").notNull(),
  // Copied at creation from the invitation's application, else the language of the access page (EN-02).
  language: varchar("language", { length: 10 }).default("fr").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  emailVerifiedIdx: index("candidate_accounts_email_verified_idx").on(table.email, table.emailVerifiedAt),
  applicationIdx: index("candidate_accounts_application_idx").on(table.linkedApplicationId),
}));

export type CandidateAccount = typeof candidateAccounts.$inferSelect;

/** Opaque, hashed, expiring candidate sessions. */
export const candidateSessions = mysqlTable("candidate_sessions", {
  id: serial("id").primaryKey(),
  candidateId: int("candidate_id").notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
  deviceLabel: varchar("device_label", { length: 180 }),
  ipHash: varchar("ip_hash", { length: 128 }),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  candidateExpiryIdx: index("candidate_sessions_candidate_expiry_idx").on(table.candidateId, table.expiresAt),
}));

/** Private administrative documents owned by an authenticated candidate. */
export const candidateDocuments = mysqlTable("candidate_documents", {
  id: serial("id").primaryKey(),
  candidateId: int("candidate_id").notNull(),
  applicationId: int("application_id"),
  category: mysqlEnum("category", ["identity_document", "medical_license", "diploma", "certificate", "professional_insurance", "vaccination_record", "criminal_record", "employment_evidence", "proof_of_address", "other"]).notNull(),
  categoryOtherLabel: varchar("category_other_label", { length: 160 }),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  storageKey: varchar("storage_key", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  sizeBytes: int("size_bytes").notNull(),
  checksum: varchar("checksum", { length: 64 }).notNull(),
  validationStatus: mysqlEnum("validation_status", ["quarantined", "accepted", "rejected", "validation_failed"]).default("quarantined").notNull(),
  validationNotes: text("validation_notes"),
  securityScanVersion: varchar("security_scan_version", { length: 40 }),
  malwareScanStatus: mysqlEnum("malware_scan_status", ["pending", "clean", "suspicious", "unavailable"]).default("pending").notNull(),
  malwareScanProvider: varchar("malware_scan_provider", { length: 80 }),
  malwareScannedAt: timestamp("malware_scanned_at"),
  encryptionAlgorithm: varchar("encryption_algorithm", { length: 80 }),
  encryptionIv: varchar("encryption_iv", { length: 128 }),
  encryptionAuthTag: varchar("encryption_auth_tag", { length: 128 }),
  status: mysqlEnum("status", ["uploaded", "validating", "analyzing", "needs_review", "reviewed", "rejected", "archived"]).default("uploaded").notNull(),
  aiSummary: text("ai_summary"),
  aiExtractedData: text("ai_extracted_data"),
  aiConfidence: int("ai_confidence"),
  aiFlags: text("ai_flags"),
  aiModel: varchar("ai_model", { length: 100 }),
  analysisStatus: mysqlEnum("analysis_status", ["queued", "extracting", "analyzing", "completed", "needs_review", "failed"]).default("queued").notNull(),
  analysisAttempts: int("analysis_attempts").default(0).notNull(),
  analysisLastError: text("analysis_last_error"),
  analyzedAt: timestamp("analyzed_at"),
  reviewedByOpenId: varchar("reviewed_by_open_id", { length: 128 }),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  retentionUntil: timestamp("retention_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  candidateCreatedIdx: index("candidate_documents_candidate_created_idx").on(table.candidateId, table.createdAt),
  reviewQueueIdx: index("candidate_documents_review_queue_idx").on(table.status, table.analysisStatus),
  applicationIdx: index("candidate_documents_application_idx").on(table.applicationId),
}));

export type CandidateDocument = typeof candidateDocuments.$inferSelect;

/** Durable queue for private-document analysis; requests never wait for an LLM. */
export const candidateDocumentProcessingJobs = mysqlTable("candidate_document_processing_jobs", {
  id: serial("id").primaryKey(),
  documentId: int("document_id").notNull(),
  status: mysqlEnum("status", ["queued", "running", "completed", "retry", "failed"]).default("queued").notNull(),
  attempts: int("attempts").default(0).notNull(),
  maxAttempts: int("max_attempts").default(3).notNull(),
  scheduledFor: timestamp("scheduled_for").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  documentScheduleIdx: index("candidate_document_jobs_schedule_idx").on(table.status, table.scheduledFor),
  documentIdx: index("candidate_document_jobs_document_idx").on(table.documentId),
}));

/** Audit trail for candidate and administrator access to private documents. */
export const candidateDocumentAuditLogs = mysqlTable("candidate_document_audit_logs", {
  id: serial("id").primaryKey(),
  documentId: int("document_id"),
  candidateId: int("candidate_id"),
  actorType: mysqlEnum("actor_type", ["candidate", "admin", "system"]).notNull(),
  actorReference: varchar("actor_reference", { length: 128 }),
  action: mysqlEnum("action", ["upload", "download", "view", "analysis_requested", "analysis_completed", "reviewed", "erased", "login", "logout"]).notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  documentCreatedIdx: index("candidate_document_audit_document_created_idx").on(table.documentId, table.createdAt),
  candidateCreatedIdx: index("candidate_document_audit_candidate_created_idx").on(table.candidateId, table.createdAt),
}));

/** Persistent rate limits survive process restarts and capture abuse by action and opaque identity key. */
export const candidateSecurityRateLimits = mysqlTable("candidate_security_rate_limits", {
  id: serial("id").primaryKey(),
  action: varchar("action", { length: 80 }).notNull(),
  subjectHash: varchar("subject_hash", { length: 128 }).notNull(),
  windowStartedAt: timestamp("window_started_at").notNull(),
  attemptCount: int("attempt_count").default(0).notNull(),
  blockedUntil: timestamp("blocked_until"),
  lastAttemptAt: timestamp("last_attempt_at").defaultNow().notNull(),
}, table => ({
  actionSubjectUnique: uniqueIndex("candidate_security_rate_limit_subject_unique").on(table.action, table.subjectHash),
  blockedIdx: index("candidate_security_rate_limit_blocked_idx").on(table.blockedUntil),
}));

/** Security-relevant candidate and administrator events, with privacy-preserving IP hashes. */
export const securityEvents = mysqlTable("security_events", {
  id: serial("id").primaryKey(),
  actorKind: mysqlEnum("security_event_actor_kind", ["candidate", "admin", "anonymous", "system"]).notNull(),
  actorReference: varchar("actor_reference", { length: 160 }),
  category: varchar("category", { length: 100 }).notNull(),
  outcome: mysqlEnum("security_event_outcome", ["allowed", "blocked", "failed", "alert"]).notNull(),
  severity: mysqlEnum("security_event_severity", ["info", "warning", "high", "critical"]).default("info").notNull(),
  ipHash: varchar("ip_hash", { length: 128 }),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  eventCreatedIdx: index("security_events_created_idx").on(table.createdAt),
  actorCreatedIdx: index("security_events_actor_created_idx").on(table.actorKind, table.actorReference, table.createdAt),
  severityCreatedIdx: index("security_events_severity_created_idx").on(table.severity, table.createdAt),
}));

/** One-time email MFA challenges issued only to already authenticated administrators. */
export const adminMfaChallenges = mysqlTable("admin_mfa_challenges", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 128 }).notNull(),
  codeHash: varchar("code_hash", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  attempts: int("attempts").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  openIdExpiryIdx: index("admin_mfa_challenge_openid_expiry_idx").on(table.openId, table.expiresAt),
}));

/** Opaque, expiring proof that an administrator completed the second factor. */
export const adminMfaSessions = mysqlTable("admin_mfa_sessions", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 128 }).notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  openIdExpiryIdx: index("admin_mfa_session_openid_expiry_idx").on(table.openId, table.expiresAt),
}));

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/const.ts
var COOKIE_NAME, ONE_YEAR_MS, AXIOS_TIMEOUT_MS, UNAUTHED_ERR_MSG, NOT_ADMIN_ERR_MSG, OAUTH_STATE_COOKIE, decodeOAuthState;
var init_const = __esm({
  "shared/const.ts"() {
    "use strict";
    COOKIE_NAME = "app_session_id";
    ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
    AXIOS_TIMEOUT_MS = 3e4;
    UNAUTHED_ERR_MSG = "Please login (10001)";
    NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
    OAUTH_STATE_COOKIE = "__Host-oauth_state";
    decodeOAuthState = (state) => {
      let decoded;
      try {
        decoded = atob(state);
      } catch {
        return { redirectUri: "" };
      }
      try {
        const parsed = JSON.parse(decoded);
        if (parsed && typeof parsed.redirectUri === "string") return parsed;
      } catch {
      }
      return { redirectUri: decoded };
    };
  }
});

// drizzle/schema.ts
var schema_exports = {};
__export(schema_exports, {
  adminMfaChallenges: () => adminMfaChallenges,
  adminMfaSessions: () => adminMfaSessions,
  appointmentFulfillmentJobs: () => appointmentFulfillmentJobs,
  appointments: () => appointments,
  availabilitySlots: () => availabilitySlots,
  blockedDates: () => blockedDates,
  blogPosts: () => blogPosts,
  candidateAccounts: () => candidateAccounts,
  candidateDocumentAuditLogs: () => candidateDocumentAuditLogs,
  candidateDocumentProcessingJobs: () => candidateDocumentProcessingJobs,
  candidateDocuments: () => candidateDocuments,
  candidateSecurityRateLimits: () => candidateSecurityRateLimits,
  candidateSessions: () => candidateSessions,
  clientBriefCandidates: () => clientBriefCandidates,
  clientBriefs: () => clientBriefs,
  contactMessages: () => contactMessages,
  cvApplications: () => cvApplications,
  cvCandidateCertifications: () => cvCandidateCertifications,
  cvCandidateExperiences: () => cvCandidateExperiences,
  cvCandidateLanguages: () => cvCandidateLanguages,
  cvGoogleDriveExportJobs: () => cvGoogleDriveExportJobs,
  cvProcessingJobs: () => cvProcessingJobs,
  gdprRequests: () => gdprRequests,
  googleDriveConnections: () => googleDriveConnections,
  medicalQuestionAuditLogs: () => medicalQuestionAuditLogs,
  medicalQuestions: () => medicalQuestions,
  recruitmentAuditLogs: () => recruitmentAuditLogs,
  recruitmentCampaignRecipients: () => recruitmentCampaignRecipients,
  recruitmentCampaigns: () => recruitmentCampaigns,
  recruitmentEmailEvents: () => recruitmentEmailEvents,
  recruitmentFollowUpTasks: () => recruitmentFollowUpTasks,
  recruitmentMatchProfiles: () => recruitmentMatchProfiles,
  recruitmentOfferTemplates: () => recruitmentOfferTemplates,
  securityEvents: () => securityEvents,
  testimonials: () => testimonials,
  users: () => users
});
import { index, integer as int, pgTable as mysqlTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
function mysqlEnum(name, values) {
  const length = Math.max(32, ...values.map((value) => value.length));
  return varchar(name, { length }).$type();
}
var users, contactMessages, gdprRequests, medicalQuestions, medicalQuestionAuditLogs, testimonials, appointments, appointmentFulfillmentJobs, blogPosts, availabilitySlots, blockedDates, cvApplications, cvCandidateCertifications, cvCandidateLanguages, cvCandidateExperiences, cvProcessingJobs, googleDriveConnections, cvGoogleDriveExportJobs, recruitmentAuditLogs, recruitmentMatchProfiles, clientBriefs, clientBriefCandidates, recruitmentCampaigns, recruitmentOfferTemplates, recruitmentCampaignRecipients, recruitmentFollowUpTasks, recruitmentEmailEvents, candidateAccounts, candidateSessions, candidateDocuments, candidateDocumentProcessingJobs, candidateDocumentAuditLogs, candidateSecurityRateLimits, securityEvents, adminMfaChallenges, adminMfaSessions;
var init_schema = __esm({
  "drizzle/schema.ts"() {
    "use strict";
    users = mysqlTable("users", {
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
      lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
    });
    contactMessages = mysqlTable("contact_messages", {
      id: serial("id").primaryKey(),
      trackingId: varchar("tracking_id", { length: 20 }).notNull().unique(),
      // Unique tracking number for the user
      name: varchar("name", { length: 255 }).notNull(),
      email: varchar("email", { length: 320 }).notNull(),
      phone: varchar("phone", { length: 50 }),
      message: text("message").notNull(),
      gdprConsent: int("gdpr_consent").default(0).notNull(),
      // 1 = accepted, 0 = not accepted
      read: int("read").default(0).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    gdprRequests = mysqlTable("gdpr_requests", {
      id: serial("id").primaryKey(),
      trackingId: varchar("tracking_id", { length: 20 }).notNull().unique(),
      // Unique tracking number for the user
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
      updatedAt: timestamp("updatedAt").defaultNow().notNull()
    });
    medicalQuestions = mysqlTable("medical_questions", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      privateStatusCreated: index("medical_questions_status_created_idx").on(table.status, table.createdAt),
      publicPublication: index("medical_questions_publication_idx").on(table.status, table.publishedAt)
    }));
    medicalQuestionAuditLogs = mysqlTable("medical_question_audit_logs", {
      id: serial("id").primaryKey(),
      medicalQuestionId: int("medical_question_id").notNull(),
      actorOpenId: varchar("actor_open_id", { length: 64 }),
      action: varchar("action", { length: 80 }).notNull(),
      metadata: text("metadata"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      questionCreated: index("medical_question_audit_question_created_idx").on(table.medicalQuestionId, table.createdAt)
    }));
    testimonials = mysqlTable("testimonials", {
      id: serial("id").primaryKey(),
      authorName: varchar("author_name", { length: 100 }).notNull(),
      // Initials or first name only
      rating: int("rating").notNull(),
      // 1-5 stars
      title: varchar("title", { length: 255 }).notNull(),
      // Short title
      content: text("content").notNull(),
      // Full review text
      specialty: varchar("specialty", { length: 100 }),
      // Medical specialty or treatment type
      verified: int("verified").default(0).notNull(),
      // 1 = verified, 0 = not verified
      featured: int("featured").default(0).notNull(),
      // 1 = homepage, 0 = testimonials page only
      language: varchar("language", { length: 10 }).default("fr").notNull(),
      // Language code
      status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().notNull()
    });
    appointments = mysqlTable("appointments", {
      id: serial("id").primaryKey(),
      trackingId: varchar("tracking_id", { length: 20 }).notNull().unique(),
      // Unique booking reference
      customerName: varchar("customer_name", { length: 255 }).notNull(),
      customerEmail: varchar("customer_email", { length: 320 }).notNull(),
      customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
      consultationType: varchar("consultation_type", { length: 100 }).default("health_advice").notNull(),
      requestDetails: text("request_details").notNull(),
      // Free text description of the request
      appointmentDate: timestamp("appointment_date").notNull(),
      // Date and time of the appointment
      slotKey: varchar("slot_key", { length: 64 }),
      // Unique active 30-minute slot lock; cleared when cancelled
      duration: int("duration").default(30).notNull(),
      // Duration in minutes
      basePrice: varchar("base_price", { length: 20 }).notNull(),
      // Base price (100 EUR)
      finalPrice: varchar("final_price", { length: 20 }).notNull(),
      // Final price with surcharges
      isNightRate: int("is_night_rate").default(0).notNull(),
      // 1 = night rate (18h-8h), 0 = normal rate
      stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
      // Stripe Payment Intent ID
      stripeSessionId: varchar("stripe_session_id", { length: 255 }),
      // Stripe Checkout Session ID
      paymentStatus: mysqlEnum("payment_status", ["pending", "completed", "failed", "refunded"]).default("pending").notNull(),
      appointmentStatus: mysqlEnum("appointment_status", ["held", "confirmed", "cancelled", "completed", "no_show"]).default("held").notNull(),
      holdExpiresAt: timestamp("hold_expires_at"),
      // Temporary unpaid booking lock; cleared once paid or released.
      meetLink: varchar("meet_link", { length: 500 }),
      // Google Meet link
      cancellationReason: text("cancellation_reason"),
      // Reason for cancellation if applicable
      cancelledAt: timestamp("cancelled_at"),
      // Timestamp of cancellation
      refundAmount: varchar("refund_amount", { length: 20 }),
      // Amount refunded if applicable
      refundedAt: timestamp("refunded_at"),
      // Timestamp of refund
      emailSent: int("email_sent").default(0).notNull(),
      // 1 = confirmation email sent
      smsSent: int("sms_sent").default(0).notNull(),
      // 1 = SMS notification sent
      reminderSent: int("reminder_sent").default(0).notNull(),
      // 1 = 24h reminder sent
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().notNull()
    }, (table) => ({
      activeSlotUnique: uniqueIndex("appointments_active_slot_unique").on(table.slotKey),
      holdExpiry: index("appointments_hold_expiry_idx").on(table.appointmentStatus, table.paymentStatus, table.holdExpiresAt)
    }));
    appointmentFulfillmentJobs = mysqlTable("appointment_fulfillment_jobs", {
      id: serial("id").primaryKey(),
      appointmentId: int("appointment_id").notNull(),
      jobType: mysqlEnum("job_type", ["confirmation", "invoice"]).notNull(),
      status: mysqlEnum("status", ["queued", "running", "retry", "completed", "failed"]).default("queued").notNull(),
      attempts: int("attempts").default(0).notNull(),
      maxAttempts: int("max_attempts").default(3).notNull(),
      scheduledFor: timestamp("scheduled_for").defaultNow().notNull(),
      lastError: text("last_error"),
      startedAt: timestamp("started_at"),
      finishedAt: timestamp("finished_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      appointmentJobUnique: uniqueIndex("appointment_fulfillment_unique").on(table.appointmentId, table.jobType),
      dueJobs: index("appointment_fulfillment_due_idx").on(table.status, table.scheduledFor)
    }));
    blogPosts = mysqlTable("blog_posts", {
      id: serial("id").primaryKey(),
      slug: varchar("slug", { length: 255 }).notNull().unique(),
      title: varchar("title", { length: 500 }).notNull(),
      excerpt: text("excerpt"),
      // Short summary for cards
      content: text("content").notNull(),
      // Full article content (markdown)
      coverImage: varchar("cover_image", { length: 500 }),
      // URL to cover image
      category: varchar("category", { length: 100 }).default("general").notNull(),
      language: varchar("language", { length: 10 }).default("fr").notNull(),
      source: varchar("source", { length: 500 }),
      // Source URL for veille articles
      published: int("published").default(0).notNull(),
      // 1 = published, 0 = draft
      authorId: int("author_id"),
      // Reference to users table
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().notNull()
    });
    availabilitySlots = mysqlTable("availability_slots", {
      id: serial("id").primaryKey(),
      dayOfWeek: int("day_of_week").notNull(),
      // 0=Sunday, 1=Monday, ..., 6=Saturday
      startTime: varchar("start_time", { length: 5 }).notNull(),
      // HH:MM format
      endTime: varchar("end_time", { length: 5 }).notNull(),
      // HH:MM format
      isActive: int("is_active").default(1).notNull(),
      // 1 = active, 0 = disabled
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    blockedDates = mysqlTable("blocked_dates", {
      id: serial("id").primaryKey(),
      date: varchar("date", { length: 10 }).notNull(),
      // YYYY-MM-DD format
      reason: varchar("reason", { length: 255 }),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    cvApplications = mysqlTable("cv_applications", {
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
      aiScore: int("ai_score"),
      // 0 to 100 fit score
      aiStrengths: text("ai_strengths"),
      // JSON array string
      aiWeaknesses: text("ai_weaknesses"),
      // JSON array string
      aiExtractedSkills: text("ai_extracted_skills"),
      // JSON array string
      aiMatchReasoning: text("ai_match_reasoning"),
      extractedText: text("extracted_text"),
      aiAnalyzedAt: timestamp("ai_analyzed_at"),
      analysisStatus: mysqlEnum("analysis_status", ["queued", "extracting", "analyzing", "completed", "needs_review", "failed"]).default("queued").notNull(),
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
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().notNull()
    });
    cvCandidateCertifications = mysqlTable("cv_candidate_certifications", {
      id: serial("id").primaryKey(),
      applicationId: int("application_id").notNull(),
      name: varchar("name", { length: 180 }).notNull(),
      issuingBody: varchar("issuing_body", { length: 180 }),
      country: varchar("country", { length: 100 }),
      expiresAt: varchar("expires_at", { length: 10 }),
      evidence: text("evidence"),
      source: mysqlEnum("source", ["declared", "extracted"]).default("extracted").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      applicationIdx: index("cv_candidate_certifications_application_idx").on(table.applicationId),
      nameIdx: index("cv_candidate_certifications_name_idx").on(table.name)
    }));
    cvCandidateLanguages = mysqlTable("cv_candidate_languages", {
      id: serial("id").primaryKey(),
      applicationId: int("application_id").notNull(),
      language: varchar("language", { length: 80 }).notNull(),
      proficiency: mysqlEnum("proficiency", ["basic", "working", "professional", "fluent", "native", "unknown"]).default("unknown").notNull(),
      evidence: text("evidence"),
      source: mysqlEnum("source", ["declared", "extracted"]).default("extracted").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      applicationIdx: index("cv_candidate_languages_application_idx").on(table.applicationId),
      languageIdx: index("cv_candidate_languages_language_idx").on(table.language)
    }));
    cvCandidateExperiences = mysqlTable("cv_candidate_experiences", {
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
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      applicationIdx: index("cv_candidate_experiences_application_idx").on(table.applicationId),
      specialtyIdx: index("cv_candidate_experiences_specialty_idx").on(table.specialty)
    }));
    cvProcessingJobs = mysqlTable("cv_processing_jobs", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      jobScheduleIdx: index("cv_processing_jobs_schedule_idx").on(table.status, table.scheduledFor),
      applicationIdx: index("cv_processing_jobs_application_idx").on(table.applicationId)
    }));
    googleDriveConnections = mysqlTable("google_drive_connections", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    cvGoogleDriveExportJobs = mysqlTable("cv_google_drive_export_jobs", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      dueJobs: index("cv_drive_export_due_idx").on(table.status, table.scheduledFor)
    }));
    recruitmentAuditLogs = mysqlTable("recruitment_audit_logs", {
      id: serial("id").primaryKey(),
      applicationId: int("application_id"),
      adminOpenId: varchar("admin_open_id", { length: 128 }).notNull(),
      action: mysqlEnum("action", ["download", "reanalyze", "erase", "email", "status_update", "retention_cleanup", "export", "unsubscribe"]).notNull(),
      metadata: text("metadata"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      applicationIdx: index("recruitment_audit_application_idx").on(table.applicationId),
      createdIdx: index("recruitment_audit_created_idx").on(table.createdAt)
    }));
    recruitmentMatchProfiles = mysqlTable("recruitment_match_profiles", {
      id: serial("id").primaryKey(),
      name: varchar("name", { length: 160 }).notNull(),
      targetCountry: varchar("target_country", { length: 120 }),
      specialty: varchar("specialty", { length: 160 }),
      minimumScore: int("minimum_score").default(0).notNull(),
      requiredLanguages: text("required_languages"),
      requiredSkills: text("required_skills"),
      active: int("active").default(1).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    clientBriefs = mysqlTable("client_briefs", {
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
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    clientBriefCandidates = mysqlTable("client_brief_candidates", {
      id: serial("id").primaryKey(),
      briefId: int("brief_id").notNull(),
      applicationId: int("application_id").notNull(),
      matchScore: int("match_score"),
      matchBreakdown: text("match_breakdown"),
      status: mysqlEnum("association_status", ["suggested", "reviewing", "shortlisted", "declined"]).default("suggested").notNull(),
      notes: text("notes"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      briefIdx: index("client_brief_candidates_brief_idx").on(table.briefId),
      applicationIdx: index("client_brief_candidates_application_idx").on(table.applicationId)
    }));
    recruitmentCampaigns = mysqlTable("recruitment_campaigns", {
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
      sentAt: timestamp("sent_at")
    }, (table) => ({
      statusIdx: index("recruitment_campaigns_status_idx").on(table.status, table.createdAt)
    }));
    recruitmentOfferTemplates = mysqlTable("recruitment_offer_templates", {
      id: serial("id").primaryKey(),
      name: varchar("name", { length: 180 }).notNull(),
      category: mysqlEnum("category", ["europe", "canada", "middle_east", "vvip_offshore", "paramedical", "general"]).default("general").notNull(),
      language: mysqlEnum("language", ["fr", "en"]).default("fr").notNull(),
      subject: varchar("subject", { length: 255 }).notNull(),
      body: text("body").notNull(),
      active: int("active").default(1).notNull(),
      createdByOpenId: varchar("created_by_open_id", { length: 128 }).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      activeIdx: index("recruitment_offer_templates_active_idx").on(table.active, table.updatedAt)
    }));
    recruitmentCampaignRecipients = mysqlTable("recruitment_campaign_recipients", {
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
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      campaignIdx: index("recruitment_campaign_recipients_campaign_idx").on(table.campaignId),
      applicationIdx: index("recruitment_campaign_recipients_application_idx").on(table.applicationId)
    }));
    recruitmentFollowUpTasks = mysqlTable("recruitment_follow_up_tasks", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      applicationIdx: index("recruitment_follow_up_tasks_application_idx").on(table.applicationId, table.status, table.dueAt),
      campaignIdx: index("recruitment_follow_up_tasks_campaign_idx").on(table.campaignId)
    }));
    recruitmentEmailEvents = mysqlTable("recruitment_email_events", {
      id: serial("id").primaryKey(),
      providerEventId: varchar("provider_event_id", { length: 120 }).notNull().unique(),
      providerEmailId: varchar("provider_email_id", { length: 120 }),
      campaignRecipientId: int("campaign_recipient_id"),
      applicationId: int("application_id"),
      eventType: varchar("event_type", { length: 80 }).notNull(),
      recipientEmail: varchar("recipient_email", { length: 320 }),
      payload: text("payload"),
      occurredAt: timestamp("occurred_at").notNull(),
      receivedAt: timestamp("received_at").defaultNow().notNull()
    }, (table) => ({
      providerEmailIdx: index("recruitment_email_events_provider_email_idx").on(table.providerEmailId),
      applicationIdx: index("recruitment_email_events_application_idx").on(table.applicationId)
    }));
    candidateAccounts = mysqlTable("candidate_accounts", {
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
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      emailVerifiedIdx: index("candidate_accounts_email_verified_idx").on(table.email, table.emailVerifiedAt),
      applicationIdx: index("candidate_accounts_application_idx").on(table.linkedApplicationId)
    }));
    candidateSessions = mysqlTable("candidate_sessions", {
      id: serial("id").primaryKey(),
      candidateId: int("candidate_id").notNull(),
      tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
      deviceLabel: varchar("device_label", { length: 180 }),
      ipHash: varchar("ip_hash", { length: 128 }),
      lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
      expiresAt: timestamp("expires_at").notNull(),
      revokedAt: timestamp("revoked_at"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      candidateExpiryIdx: index("candidate_sessions_candidate_expiry_idx").on(table.candidateId, table.expiresAt)
    }));
    candidateDocuments = mysqlTable("candidate_documents", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      candidateCreatedIdx: index("candidate_documents_candidate_created_idx").on(table.candidateId, table.createdAt),
      reviewQueueIdx: index("candidate_documents_review_queue_idx").on(table.status, table.analysisStatus),
      applicationIdx: index("candidate_documents_application_idx").on(table.applicationId)
    }));
    candidateDocumentProcessingJobs = mysqlTable("candidate_document_processing_jobs", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      documentScheduleIdx: index("candidate_document_jobs_schedule_idx").on(table.status, table.scheduledFor),
      documentIdx: index("candidate_document_jobs_document_idx").on(table.documentId)
    }));
    candidateDocumentAuditLogs = mysqlTable("candidate_document_audit_logs", {
      id: serial("id").primaryKey(),
      documentId: int("document_id"),
      candidateId: int("candidate_id"),
      actorType: mysqlEnum("actor_type", ["candidate", "admin", "system"]).notNull(),
      actorReference: varchar("actor_reference", { length: 128 }),
      action: mysqlEnum("action", ["upload", "download", "view", "analysis_requested", "analysis_completed", "reviewed", "erased", "login", "logout"]).notNull(),
      metadata: text("metadata"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      documentCreatedIdx: index("candidate_document_audit_document_created_idx").on(table.documentId, table.createdAt),
      candidateCreatedIdx: index("candidate_document_audit_candidate_created_idx").on(table.candidateId, table.createdAt)
    }));
    candidateSecurityRateLimits = mysqlTable("candidate_security_rate_limits", {
      id: serial("id").primaryKey(),
      action: varchar("action", { length: 80 }).notNull(),
      subjectHash: varchar("subject_hash", { length: 128 }).notNull(),
      windowStartedAt: timestamp("window_started_at").notNull(),
      attemptCount: int("attempt_count").default(0).notNull(),
      blockedUntil: timestamp("blocked_until"),
      lastAttemptAt: timestamp("last_attempt_at").defaultNow().notNull()
    }, (table) => ({
      actionSubjectUnique: uniqueIndex("candidate_security_rate_limit_subject_unique").on(table.action, table.subjectHash),
      blockedIdx: index("candidate_security_rate_limit_blocked_idx").on(table.blockedUntil)
    }));
    securityEvents = mysqlTable("security_events", {
      id: serial("id").primaryKey(),
      actorKind: mysqlEnum("security_event_actor_kind", ["candidate", "admin", "anonymous", "system"]).notNull(),
      actorReference: varchar("actor_reference", { length: 160 }),
      category: varchar("category", { length: 100 }).notNull(),
      outcome: mysqlEnum("security_event_outcome", ["allowed", "blocked", "failed", "alert"]).notNull(),
      severity: mysqlEnum("security_event_severity", ["info", "warning", "high", "critical"]).default("info").notNull(),
      ipHash: varchar("ip_hash", { length: 128 }),
      metadata: text("metadata"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      eventCreatedIdx: index("security_events_created_idx").on(table.createdAt),
      actorCreatedIdx: index("security_events_actor_created_idx").on(table.actorKind, table.actorReference, table.createdAt),
      severityCreatedIdx: index("security_events_severity_created_idx").on(table.severity, table.createdAt)
    }));
    adminMfaChallenges = mysqlTable("admin_mfa_challenges", {
      id: serial("id").primaryKey(),
      openId: varchar("open_id", { length: 128 }).notNull(),
      codeHash: varchar("code_hash", { length: 128 }).notNull(),
      expiresAt: timestamp("expires_at").notNull(),
      consumedAt: timestamp("consumed_at"),
      attempts: int("attempts").default(0).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      openIdExpiryIdx: index("admin_mfa_challenge_openid_expiry_idx").on(table.openId, table.expiresAt)
    }));
    adminMfaSessions = mysqlTable("admin_mfa_sessions", {
      id: serial("id").primaryKey(),
      openId: varchar("open_id", { length: 128 }).notNull(),
      tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
      expiresAt: timestamp("expires_at").notNull(),
      revokedAt: timestamp("revoked_at"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      openIdExpiryIdx: index("admin_mfa_session_openid_expiry_idx").on(table.openId, table.expiresAt)
    }));
  }
});

// server/_core/env.ts
function getMissingCriticalProductionEnvironment(environment = process.env) {
  return PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES.filter((name) => !environment[name]?.trim());
}
function assertCriticalProductionEnvironment(environment = process.env) {
  if (environment.NODE_ENV !== "production") return;
  const missing = getMissingCriticalProductionEnvironment(environment);
  if (missing.length > 0) {
    throw new Error(`Missing critical production configuration: ${missing.join(", ")}`);
  }
}
var PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES, ENV;
var init_env = __esm({
  "server/_core/env.ts"() {
    "use strict";
    PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES = [
      "JWT_SECRET",
      "DATABASE_URL",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "RESEND_API_KEY",
      "TURNSTILE_SECRET_KEY",
      "CANDIDATE_AUTH_PEPPER",
      "CANDIDATE_DOCUMENT_ENCRYPTION_KEY"
    ];
    ENV = {
      appId: process.env.VITE_APP_ID ?? "",
      cookieSecret: process.env.JWT_SECRET ?? "",
      databaseUrl: process.env.DATABASE_URL ?? "",
      oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
      ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
      isProduction: process.env.NODE_ENV === "production",
      forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
      forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
      googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
      googleDriveClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
      googleDriveCvFolderId: process.env.GOOGLE_DRIVE_CV_FOLDER_ID ?? ""
    };
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  getDb: () => getDb,
  getUserByOpenId: () => getUserByOpenId,
  upsertUser: () => upsertUser
});
import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(neon(process.env.DATABASE_URL));
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
var _db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    init_env();
    _db = null;
  }
});

// shared/_core/errors.ts
var HttpError, ForbiddenError;
var init_errors = __esm({
  "shared/_core/errors.ts"() {
    "use strict";
    HttpError = class extends Error {
      constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.name = "HttpError";
      }
    };
    ForbiddenError = (msg) => new HttpError(403, msg);
  }
});

// server/_core/sdk.ts
var sdk_exports = {};
__export(sdk_exports, {
  sdk: () => sdk
});
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var isNonEmptyString, EXCHANGE_TOKEN_PATH, GET_USER_INFO_PATH, GET_USER_INFO_WITH_JWT_PATH, OAuthService, createOAuthHttpClient, SDKServer, CRON_OPEN_ID_PREFIX, sdk;
var init_sdk = __esm({
  "server/_core/sdk.ts"() {
    "use strict";
    init_const();
    init_errors();
    init_db();
    init_env();
    isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
    EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
    GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
    GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
    OAuthService = class {
      constructor(client) {
        this.client = client;
        console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
        if (!ENV.oAuthServerUrl) {
          console.error(
            "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
          );
        }
      }
      decodeState(state) {
        return decodeOAuthState(state).redirectUri;
      }
      async getTokenByCode(code, state) {
        const payload = {
          clientId: ENV.appId,
          grantType: "authorization_code",
          code,
          redirectUri: this.decodeState(state)
        };
        const { data } = await this.client.post(
          EXCHANGE_TOKEN_PATH,
          payload
        );
        return data;
      }
      async getUserInfoByToken(token) {
        const { data } = await this.client.post(
          GET_USER_INFO_PATH,
          {
            accessToken: token.accessToken
          }
        );
        return data;
      }
    };
    createOAuthHttpClient = () => axios.create({
      baseURL: ENV.oAuthServerUrl,
      timeout: AXIOS_TIMEOUT_MS
    });
    SDKServer = class {
      client;
      oauthService;
      constructor(client = createOAuthHttpClient()) {
        this.client = client;
        this.oauthService = new OAuthService(this.client);
      }
      deriveLoginMethod(platforms, fallback) {
        if (fallback && fallback.length > 0) return fallback;
        if (!Array.isArray(platforms) || platforms.length === 0) return null;
        const set = new Set(
          platforms.filter((p) => typeof p === "string")
        );
        if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
        if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
        if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
        if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
          return "microsoft";
        if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
        const first = Array.from(set)[0];
        return first ? first.toLowerCase() : null;
      }
      /**
       * Exchange OAuth authorization code for access token
       * @example
       * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
       */
      async exchangeCodeForToken(code, state) {
        return this.oauthService.getTokenByCode(code, state);
      }
      /**
       * Get user information using access token
       * @example
       * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
       */
      async getUserInfo(accessToken) {
        const data = await this.oauthService.getUserInfoByToken({
          accessToken
        });
        const loginMethod = this.deriveLoginMethod(
          data?.platforms,
          data?.platform ?? data.platform ?? null
        );
        return {
          ...data,
          platform: loginMethod,
          loginMethod
        };
      }
      parseCookies(cookieHeader) {
        if (!cookieHeader) {
          return /* @__PURE__ */ new Map();
        }
        const parsed = parseCookieHeader(cookieHeader);
        return new Map(Object.entries(parsed));
      }
      getSessionSecret() {
        const secret = ENV.cookieSecret;
        return new TextEncoder().encode(secret);
      }
      /**
       * Create a session token for a Manus user openId
       * @example
       * const sessionToken = await sdk.createSessionToken(userInfo.openId);
       */
      async createSessionToken(openId, options = {}) {
        return this.signSession(
          {
            openId,
            appId: ENV.appId,
            name: options.name || ""
          },
          options
        );
      }
      async signSession(payload, options = {}) {
        const issuedAt = Date.now();
        const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
        const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
        const secretKey = this.getSessionSecret();
        return new SignJWT({
          openId: payload.openId,
          appId: payload.appId,
          name: payload.name
        }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
      }
      async verifySession(cookieValue2) {
        if (!cookieValue2) {
          console.warn("[Auth] Missing session cookie");
          return null;
        }
        try {
          const secretKey = this.getSessionSecret();
          const { payload } = await jwtVerify(cookieValue2, secretKey, {
            algorithms: ["HS256"]
          });
          const { openId, appId, name } = payload;
          if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
            console.warn("[Auth] Session payload missing required fields");
            return null;
          }
          return {
            openId,
            appId,
            name
          };
        } catch (error) {
          console.warn("[Auth] Session verification failed", String(error));
          return null;
        }
      }
      async getUserInfoWithJwt(jwtToken) {
        const payload = {
          jwtToken,
          projectId: ENV.appId
        };
        const { data } = await this.client.post(
          GET_USER_INFO_WITH_JWT_PATH,
          payload
        );
        const loginMethod = this.deriveLoginMethod(
          data?.platforms,
          data?.platform ?? data.platform ?? null
        );
        return {
          ...data,
          platform: loginMethod,
          loginMethod
        };
      }
      async authenticateRequest(req) {
        const cookies = this.parseCookies(req.headers.cookie);
        let sessionToken = cookies.get(COOKIE_NAME);
        if (!sessionToken) {
          const authHeader = req.headers.authorization;
          if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
            sessionToken = authHeader.slice(7);
          }
        }
        const session = await this.verifySession(sessionToken);
        if (!session) {
          throw ForbiddenError("Invalid session cookie");
        }
        if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
          const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
          const taskUid = userInfo.taskUid ?? null;
          if (!taskUid) {
            throw ForbiddenError("Cron session missing task_uid");
          }
          return buildCronUser(userInfo);
        }
        const sessionUserId = session.openId;
        const signedInAt = /* @__PURE__ */ new Date();
        let user = await getUserByOpenId(sessionUserId);
        if (!user) {
          try {
            const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
            await upsertUser({
              openId: userInfo.openId,
              name: userInfo.name || null,
              email: userInfo.email ?? null,
              loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
              lastSignedIn: signedInAt
            });
            user = await getUserByOpenId(userInfo.openId);
          } catch (error) {
            console.error("[Auth] Failed to sync user from OAuth:", error);
            throw ForbiddenError("Failed to sync user info");
          }
        }
        if (!user) {
          throw ForbiddenError("User not found");
        }
        await upsertUser({
          openId: user.openId,
          lastSignedIn: signedInAt
        });
        return user;
      }
    };
    CRON_OPEN_ID_PREFIX = "cron_";
    sdk = new SDKServer();
  }
});

// server/recruitmentAudit.ts
async function logRecruitmentAction(input) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.insert(recruitmentAuditLogs).values({
    applicationId: input.applicationId ?? null,
    adminOpenId: input.adminOpenId,
    action: input.action,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null
  });
}
function parseRecruitmentJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}
function matchesRecruitmentProfile(input) {
  const profile = input.profile;
  if ((input.score ?? -1) < profile.minimumScore) return false;
  if (profile.specialty && !input.specialty.toLowerCase().includes(profile.specialty.toLowerCase())) return false;
  if (profile.targetCountry && !input.targetCountries.some((country) => country.toLowerCase().includes(profile.targetCountry.toLowerCase()))) return false;
  const languages = new Set(input.languages.map((value) => value.toLowerCase()));
  const skills = new Set(input.extractedSkills.map((value) => value.toLowerCase()));
  const requiredLanguages = parseRecruitmentJsonArray(profile.requiredLanguages);
  const requiredSkills = parseRecruitmentJsonArray(profile.requiredSkills);
  if (requiredLanguages.some((value) => !languages.has(value.toLowerCase()))) return false;
  if (requiredSkills.some((value) => !Array.from(skills).some((skill) => skill.includes(value.toLowerCase())))) return false;
  return true;
}
var init_recruitmentAudit = __esm({
  "server/recruitmentAudit.ts"() {
    "use strict";
    init_db();
    init_schema();
  }
});

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}
async function storageGetSignedUrl(relKey) {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);
  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }
  const { url } = await resp.json();
  return url;
}
var init_storage = __esm({
  "server/storage.ts"() {
    "use strict";
    init_env();
  }
});

// server/googleDriveExport.ts
var googleDriveExport_exports = {};
__export(googleDriveExport_exports, {
  buildGoogleDriveAuthorizationUrl: () => buildGoogleDriveAuthorizationUrl,
  createGoogleDriveOAuthState: () => createGoogleDriveOAuthState,
  encryptGoogleDriveRefreshToken: () => encryptGoogleDriveRefreshToken,
  enqueueCvGoogleDriveExport: () => enqueueCvGoogleDriveExport,
  exchangeGoogleDriveAuthorizationCode: () => exchangeGoogleDriveAuthorizationCode,
  googleDriveCvFileName: () => googleDriveCvFileName,
  googleDriveExportStatus: () => googleDriveExportStatus,
  googleDriveRetryDelayMs: () => googleDriveRetryDelayMs,
  processDueCvGoogleDriveExports: () => processDueCvGoogleDriveExports,
  saveGoogleDriveConnection: () => saveGoogleDriveConnection,
  verifyGoogleDriveOAuthState: () => verifyGoogleDriveOAuthState
});
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq as eq2, inArray, lte } from "drizzle-orm";
function canonicalOrigin() {
  return "https://drahmedbenlallahom.com";
}
function redirectUri() {
  return `${canonicalOrigin()}${CALLBACK_PATH}`;
}
function encryptionKey() {
  const encoded = process.env.CANDIDATE_DOCUMENT_ENCRYPTION_KEY;
  if (!encoded) throw new Error("google_drive_encryption_key_missing");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("google_drive_encryption_key_invalid");
  return key;
}
function stateKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("google_drive_state_key_missing");
  return secret;
}
function ensureGoogleConfig() {
  if (!ENV.googleDriveClientId || !ENV.googleDriveClientSecret || !ENV.googleDriveCvFolderId) {
    throw new Error("google_drive_configuration_missing");
  }
}
function signedState(nonce, expiresAt) {
  const payload = Buffer.from(JSON.stringify({ nonce, expiresAt }), "utf8").toString("base64url");
  const signature = createHmac("sha256", stateKey()).update(`google_drive_oauth:${payload}`, "utf8").digest("base64url");
  return `${payload}.${signature}`;
}
function createGoogleDriveOAuthState() {
  return signedState(randomBytes(24).toString("base64url"), Date.now() + STATE_MAX_AGE_MS);
}
function verifyGoogleDriveOAuthState(state) {
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra) return false;
  const expected = createHmac("sha256", stateKey()).update(`google_drive_oauth:${payload}`, "utf8").digest("base64url");
  const suppliedBytes = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof parsed.expiresAt === "number" && Number.isSafeInteger(parsed.expiresAt) && parsed.expiresAt > Date.now();
  } catch {
    return false;
  }
}
function buildGoogleDriveAuthorizationUrl(state) {
  ensureGoogleConfig();
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", ENV.googleDriveClientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DRIVE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}
function encryptGoogleDriveRefreshToken(token) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from("hippocampus-google-drive-refresh-token:v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}
function decryptGoogleDriveRefreshToken(input) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(input.refreshTokenIv, "base64"));
  decipher.setAAD(Buffer.from("hippocampus-google-drive-refresh-token:v1", "utf8"));
  decipher.setAuthTag(Buffer.from(input.refreshTokenAuthTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(input.refreshTokenCiphertext, "base64")), decipher.final()]).toString("utf8");
}
async function requestToken(payload) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`google_drive_token_${result.error || response.status}`);
  return result;
}
async function exchangeGoogleDriveAuthorizationCode(code) {
  ensureGoogleConfig();
  const response = await requestToken(new URLSearchParams({
    code,
    client_id: ENV.googleDriveClientId,
    client_secret: ENV.googleDriveClientSecret,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code"
  }));
  if (!response.refresh_token) throw new Error("google_drive_refresh_token_missing");
  return response;
}
async function getGoogleDriveAccessToken(connection) {
  ensureGoogleConfig();
  const refreshToken = decryptGoogleDriveRefreshToken(connection);
  const response = await requestToken(new URLSearchParams({
    refresh_token: refreshToken,
    client_id: ENV.googleDriveClientId,
    client_secret: ENV.googleDriveClientSecret,
    grant_type: "refresh_token"
  }));
  if (!response.access_token) throw new Error("google_drive_access_token_missing");
  return response.access_token;
}
function googleDriveRetryDelayMs(attempt) {
  return Math.min(60 * 60 * 1e3, 6e4 * 2 ** Math.max(0, attempt - 1));
}
function googleDriveCvFileName(trackingId, originalName) {
  const safeName = originalName.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/_+/g, "_").slice(-180) || "cv";
  return `${trackingId}-${safeName}`;
}
async function downloadCvBuffer(storageKey) {
  const signedUrl = await storageGetSignedUrl(storageKey);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error(`google_drive_cv_download_${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
async function uploadCvToGoogleDrive(input) {
  const boundary = `drive-export-${randomBytes(12).toString("hex")}`;
  const metadata = JSON.stringify({ name: input.fileName, parents: [input.folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
${metadata}\r
`, "utf8"),
    Buffer.from(`--${boundary}\r
Content-Type: ${input.mimeType}\r
\r
`, "utf8"),
    input.content,
    Buffer.from(`\r
--${boundary}--\r
`, "utf8")
  ]);
  const url = new URL(GOOGLE_UPLOAD_URL);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("fields", "id,name,mimeType,webViewLink");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length)
    },
    body
  });
  const result = await response.json();
  if (!response.ok || !result.id) throw new Error(`google_drive_upload_${response.status}${result.error?.message ? `_${result.error.message.slice(0, 120)}` : ""}`);
  return { id: result.id, webViewLink: result.webViewLink ?? null };
}
async function saveGoogleDriveConnection(input) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  ensureGoogleConfig();
  const encrypted = encryptGoogleDriveRefreshToken(input.refreshToken);
  await db.insert(googleDriveConnections).values({
    connectionKey: CONNECTION_KEY,
    authorizedByOpenId: input.authorizedByOpenId,
    folderId: ENV.googleDriveCvFolderId,
    refreshTokenCiphertext: encrypted.ciphertext,
    refreshTokenIv: encrypted.iv,
    refreshTokenAuthTag: encrypted.authTag,
    grantedScopes: input.grantedScopes ?? null,
    connectedAt: /* @__PURE__ */ new Date(),
    lastError: null
  }).onConflictDoUpdate({
    target: googleDriveConnections.connectionKey,
    set: {
      authorizedByOpenId: input.authorizedByOpenId,
      folderId: ENV.googleDriveCvFolderId,
      refreshTokenCiphertext: encrypted.ciphertext,
      refreshTokenIv: encrypted.iv,
      refreshTokenAuthTag: encrypted.authTag,
      grantedScopes: input.grantedScopes ?? null,
      connectedAt: /* @__PURE__ */ new Date(),
      lastError: null
    }
  });
}
async function googleDriveExportStatus() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const connection = (await db.select({ connectedAt: googleDriveConnections.connectedAt, lastUsedAt: googleDriveConnections.lastUsedAt, lastError: googleDriveConnections.lastError, folderId: googleDriveConnections.folderId }).from(googleDriveConnections).where(eq2(googleDriveConnections.connectionKey, CONNECTION_KEY)).limit(1))[0];
  return connection ? { connected: true, ...connection } : { connected: false, connectedAt: null, lastUsedAt: null, lastError: null, folderId: null };
}
async function enqueueCvGoogleDriveExport(applicationId, scheduledFor = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.insert(cvGoogleDriveExportJobs).values({ applicationId, status: "queued", attempts: 0, maxAttempts: MAX_ATTEMPTS, scheduledFor }).onConflictDoUpdate({
    target: cvGoogleDriveExportJobs.applicationId,
    set: { status: "queued", scheduledFor, lastError: null, finishedAt: null }
  });
}
async function processGoogleDriveExportJob(jobId) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const job = (await db.select().from(cvGoogleDriveExportJobs).where(eq2(cvGoogleDriveExportJobs.id, jobId)).limit(1))[0];
  if (!job || job.status !== "running") return { skipped: true, reason: "not_claimed" };
  const application = (await db.select().from(cvApplications).where(eq2(cvApplications.id, job.applicationId)).limit(1))[0];
  const connection = (await db.select().from(googleDriveConnections).where(eq2(googleDriveConnections.connectionKey, CONNECTION_KEY)).limit(1))[0];
  if (!application || !connection) {
    await db.update(cvGoogleDriveExportJobs).set({ status: "queued", scheduledFor: new Date(Date.now() + 5 * 6e4), startedAt: null }).where(eq2(cvGoogleDriveExportJobs.id, job.id));
    return { skipped: true, reason: application ? "connection_missing" : "application_missing" };
  }
  if (application.fileValidationStatus !== "accepted") {
    await db.update(cvGoogleDriveExportJobs).set({ status: "queued", scheduledFor: new Date(Date.now() + 6e4), startedAt: null }).where(eq2(cvGoogleDriveExportJobs.id, job.id));
    return { skipped: true, reason: "cv_not_accepted" };
  }
  try {
    const accessToken = await getGoogleDriveAccessToken(connection);
    const content = await downloadCvBuffer(application.cvFileKey);
    const driveFile = await uploadCvToGoogleDrive({
      accessToken,
      folderId: connection.folderId,
      fileName: googleDriveCvFileName(application.trackingId, application.cvOriginalName),
      mimeType: application.cvMimeType,
      content
    });
    const now = /* @__PURE__ */ new Date();
    await db.update(cvGoogleDriveExportJobs).set({ status: "completed", driveFileId: driveFile.id, driveFileUrl: driveFile.webViewLink, lastError: null, finishedAt: now }).where(eq2(cvGoogleDriveExportJobs.id, job.id));
    await db.update(googleDriveConnections).set({ lastUsedAt: now, lastError: null }).where(eq2(googleDriveConnections.id, connection.id));
    await logRecruitmentAction({ applicationId: application.id, adminOpenId: connection.authorizedByOpenId, action: "export", metadata: { destination: "google_drive", driveFileId: driveFile.id, trackingId: application.trackingId } });
    return { completed: true, applicationId: application.id, driveFileId: driveFile.id };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "google_drive_export_unknown";
    const finalFailure = job.attempts >= job.maxAttempts;
    const now = /* @__PURE__ */ new Date();
    await db.update(cvGoogleDriveExportJobs).set({
      status: finalFailure ? "failed" : "retry",
      lastError: message,
      scheduledFor: new Date(now.getTime() + googleDriveRetryDelayMs(job.attempts)),
      finishedAt: finalFailure ? now : null
    }).where(eq2(cvGoogleDriveExportJobs.id, job.id));
    await db.update(googleDriveConnections).set({ lastError: message }).where(eq2(googleDriveConnections.id, connection.id));
    return { completed: false, applicationId: job.applicationId, retry: !finalFailure, error: message };
  }
}
async function processDueCvGoogleDriveExports(limit = BATCH_SIZE) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const connection = (await db.select({ id: googleDriveConnections.id }).from(googleDriveConnections).where(eq2(googleDriveConnections.connectionKey, CONNECTION_KEY)).limit(1))[0];
  if (!connection) return { processed: 0, waitingForAuthorization: true, results: [] };
  const now = /* @__PURE__ */ new Date();
  const candidates = await db.select().from(cvGoogleDriveExportJobs).where(and(inArray(cvGoogleDriveExportJobs.status, ["queued", "retry"]), lte(cvGoogleDriveExportJobs.scheduledFor, now))).orderBy(cvGoogleDriveExportJobs.scheduledFor).limit(Math.min(Math.max(limit, 1), BATCH_SIZE));
  const results = [];
  for (const candidate of candidates) {
    const startedAt = /* @__PURE__ */ new Date();
    const claimed = await db.update(cvGoogleDriveExportJobs).set({ status: "running", attempts: candidate.attempts + 1, startedAt, finishedAt: null }).where(and(eq2(cvGoogleDriveExportJobs.id, candidate.id), inArray(cvGoogleDriveExportJobs.status, ["queued", "retry"])));
    const header = Array.isArray(claimed) ? claimed[0] : claimed;
    if (!header || typeof header !== "object" || !("affectedRows" in header) || header.affectedRows !== 1) continue;
    results.push(await processGoogleDriveExportJob(candidate.id));
  }
  return { processed: results.length, waitingForAuthorization: false, results };
}
var CONNECTION_KEY, DRIVE_SCOPE, GOOGLE_AUTHORIZE_URL, GOOGLE_TOKEN_URL, GOOGLE_UPLOAD_URL, CALLBACK_PATH, MAX_ATTEMPTS, BATCH_SIZE, STATE_MAX_AGE_MS;
var init_googleDriveExport = __esm({
  "server/googleDriveExport.ts"() {
    "use strict";
    init_schema();
    init_db();
    init_recruitmentAudit();
    init_storage();
    init_env();
    CONNECTION_KEY = "recruitment_cv_export";
    DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
    GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
    GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
    GOOGLE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
    CALLBACK_PATH = "/api/google-drive/oauth/callback";
    MAX_ATTEMPTS = 5;
    BATCH_SIZE = 3;
    STATE_MAX_AGE_MS = 10 * 60 * 1e3;
  }
});

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}
var TITLE_MAX_LENGTH, CONTENT_MAX_LENGTH, trimValue, isNonEmptyString2, buildEndpointUrl, validatePayload;
var init_notification = __esm({
  "server/_core/notification.ts"() {
    "use strict";
    init_env();
    TITLE_MAX_LENGTH = 1200;
    CONTENT_MAX_LENGTH = 2e4;
    trimValue = (value) => value.trim();
    isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
    buildEndpointUrl = (baseUrl) => {
      const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
      return new URL(
        "webdevtoken.v1.WebDevService/SendNotification",
        normalizedBase
      ).toString();
    };
    validatePayload = (input) => {
      if (!isNonEmptyString2(input.title)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Notification title is required."
        });
      }
      if (!isNonEmptyString2(input.content)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Notification content is required."
        });
      }
      const title = trimValue(input.title);
      const content = trimValue(input.content);
      if (title.length > TITLE_MAX_LENGTH) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
        });
      }
      if (content.length > CONTENT_MAX_LENGTH) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
        });
      }
      return { title, content };
    };
  }
});

// server/candidateSecurity.ts
var candidateSecurity_exports = {};
__export(candidateSecurity_exports, {
  enforcePersistentRateLimit: () => enforcePersistentRateLimit,
  hashSecurityValue: () => hashSecurityValue,
  isCompromisedPassword: () => isCompromisedPassword,
  logSecurityEvent: () => logSecurityEvent,
  requestIpHash: () => requestIpHash
});
import { createHash } from "node:crypto";
import { and as and2, eq as eq3 } from "drizzle-orm";
function securityPepper() {
  return process.env.CANDIDATE_AUTH_PEPPER || process.env.JWT_SECRET || "security-pepper-unavailable";
}
function hashSecurityValue(value) {
  return createHash("sha256").update(`${securityPepper()}:${value.trim().toLowerCase()}`).digest("hex");
}
function requestIpHash(headers) {
  const forwarded = headers["x-forwarded-for"];
  const ip = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : typeof headers["x-real-ip"] === "string" ? headers["x-real-ip"] : null;
  return ip ? hashSecurityValue(ip) : null;
}
async function logSecurityEvent(input) {
  const db = await getDb();
  if (!db) return;
  await db.insert(securityEvents).values({
    actorKind: input.actorKind,
    actorReference: input.actorReference ?? null,
    category: input.category.slice(0, 100),
    outcome: input.outcome,
    severity: input.severity ?? "info",
    ipHash: input.ipHash ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null
  });
  if ((input.severity === "high" || input.severity === "critical") && input.outcome !== "allowed") {
    void notifyOwner({ title: "Alerte s\xE9curit\xE9 \u2014 Hippocampus Consulting", content: `${input.category} \xB7 ${input.outcome}. Une v\xE9rification administrative est recommand\xE9e.` }).catch(() => void 0);
  }
}
async function enforcePersistentRateLimit(input) {
  const db = await getDb();
  if (!db) throw new Error("candidate_security_database_unavailable");
  const subjectHash = hashSecurityValue(input.subject);
  const now = /* @__PURE__ */ new Date();
  const existing = (await db.select().from(candidateSecurityRateLimits).where(and2(eq3(candidateSecurityRateLimits.action, input.action), eq3(candidateSecurityRateLimits.subjectHash, subjectHash))).limit(1))[0];
  if (!existing) {
    await db.insert(candidateSecurityRateLimits).values({ action: input.action, subjectHash, windowStartedAt: now, attemptCount: 1, lastAttemptAt: now });
    return;
  }
  if (existing.blockedUntil && existing.blockedUntil > now) throw new Error("candidate_security_rate_limited");
  const sameWindow = now.getTime() - existing.windowStartedAt.getTime() < input.windowMs;
  const attempts = sameWindow ? existing.attemptCount + 1 : 1;
  const blockedUntil = attempts > input.maxAttempts ? new Date(now.getTime() + input.blockMs) : null;
  await db.update(candidateSecurityRateLimits).set({
    windowStartedAt: sameWindow ? existing.windowStartedAt : now,
    attemptCount: attempts,
    blockedUntil,
    lastAttemptAt: now
  }).where(eq3(candidateSecurityRateLimits.id, existing.id));
  if (blockedUntil) throw new Error("candidate_security_rate_limited");
}
async function isCompromisedPassword(password) {
  if (process.env.NODE_ENV === "test") return false;
  const digest = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  const cached = pwnedSuffixCache.get(prefix);
  if (cached && cached.expiresAt > Date.now()) return cached.suffixes.has(suffix);
  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true", "User-Agent": "HippocampusConsulting-CandidateSecurity" }
  });
  if (!response.ok) throw new Error("candidate_password_breach_check_unavailable");
  const suffixes = new Set((await response.text()).split("\n").map((line) => line.split(":")[0]?.trim()).filter((value) => Boolean(value)));
  pwnedSuffixCache.set(prefix, { expiresAt: Date.now() + HIBP_CACHE_TTL_MS, suffixes });
  return suffixes.has(suffix);
}
var HIBP_CACHE_TTL_MS, pwnedSuffixCache;
var init_candidateSecurity = __esm({
  "server/candidateSecurity.ts"() {
    "use strict";
    init_schema();
    init_db();
    init_notification();
    HIBP_CACHE_TTL_MS = 10 * 60 * 1e3;
    pwnedSuffixCache = /* @__PURE__ */ new Map();
  }
});

// server/_core/notifications.ts
var notifications_exports = {};
__export(notifications_exports, {
  buildCandidatePortalAccessEmail: () => buildCandidatePortalAccessEmail,
  buildHippocampusEmailShell: () => buildHippocampusEmailShell,
  buildRecruitmentTemplateEmail: () => buildRecruitmentTemplateEmail,
  sendAdminMfaCodeEmail: () => sendAdminMfaCodeEmail,
  sendCandidatePortalAccessEmail: () => sendCandidatePortalAccessEmail,
  sendConfirmationEmail: () => sendConfirmationEmail,
  sendCustomerConfirmationSMS: () => sendCustomerConfirmationSMS,
  sendCvApplicationConfirmationEmail: () => sendCvApplicationConfirmationEmail,
  sendInvoiceEmail: () => sendInvoiceEmail,
  sendMedicalQuestionResponseEmail: () => sendMedicalQuestionResponseEmail,
  sendOwnerNotificationEmail: () => sendOwnerNotificationEmail,
  sendOwnerNotificationSMS: () => sendOwnerNotificationSMS,
  sendRecruitmentCampaignEmail: () => sendRecruitmentCampaignEmail,
  sendRecruitmentTemplateEmail: () => sendRecruitmentTemplateEmail,
  sendRefundConfirmationEmail: () => sendRefundConfirmationEmail,
  sendReminderEmail: () => sendReminderEmail
});
import { Resend } from "resend";
function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("resend_api_key_missing");
  resendClient ??= new Resend(apiKey);
  return resendClient;
}
function escapeHtml2(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function buildHippocampusEmailShell(content) {
  return `
    <div style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dbe4ee;border-radius:14px;overflow:hidden;">
        <div style="padding:18px 28px;background:#071827;border-bottom:3px solid #0891b2;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:0 14px 0 0;vertical-align:middle;"><img src="${HIPPOCAMPUS_LOGO_URL}" width="64" alt="Hippocampus Consulting" style="display:block;width:64px;height:64px;border:0;border-radius:8px;background:#ffffff;" /></td>
              <td style="vertical-align:middle;"><div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#38bdf8;">ABL / HIPPOCAMPUS</div><div style="margin-top:5px;font-size:19px;font-weight:700;color:#ffffff;">Hippocampus Consulting</div></td>
            </tr>
          </table>
        </div>
        <div style="padding:28px;">${content}</div>
        <div style="padding:18px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;line-height:1.5;color:#64748b;">Dr. Ahmed Ben Lallahom \xB7 Hippocampus Consulting<br />Communication professionnelle et confidentielle</div>
      </div>
    </div>
  `;
}
async function sendMedicalQuestionResponseEmail(input) {
  const html = buildHippocampusEmailShell(`
    <h2 style="color:#0891b2">R\xE9ponse \xE0 votre question</h2>
    <p>Bonjour ${escapeHtml2(input.firstName)},</p>
    <p>Votre question a \xE9t\xE9 examin\xE9e. Vous trouverez ci-dessous une r\xE9ponse d\u2019information g\xE9n\xE9rale relue et valid\xE9e par le Dr. Ahmed Ben Lallahom.</p>
    <div style="margin:20px 0;padding:18px;border-radius:10px;background:#f1f5f9;white-space:pre-line;line-height:1.65;color:#0f172a;">${escapeHtml2(input.response)}</div>
    <p style="font-size:13px;line-height:1.55;color:#475569;"><strong>Information importante :</strong> cette r\xE9ponse g\xE9n\xE9rale ne remplace pas une consultation, une \xE9valuation pr\xE9op\xE9ratoire ni une prise en charge urgente. En cas d\u2019urgence ou de sympt\xF4me inqui\xE9tant, contactez les secours ou un professionnel de sant\xE9 sans attendre.</p>
    <p style="font-size:12px;color:#64748b;">R\xE9f\xE9rence confidentielle : ${escapeHtml2(input.trackingId)}</p>
  `);
  const text2 = `Bonjour ${input.firstName},

Votre question a \xE9t\xE9 examin\xE9e.

${input.response}

Information importante : cette r\xE9ponse g\xE9n\xE9rale ne remplace pas une consultation, une \xE9valuation pr\xE9op\xE9ratoire ni une prise en charge urgente. En cas d\u2019urgence ou de sympt\xF4me inqui\xE9tant, contactez les secours ou un professionnel de sant\xE9 sans attendre.

R\xE9f\xE9rence confidentielle : ${input.trackingId}`;
  const { error } = await getResendClient().emails.send({ from: FROM_EMAIL, to: [input.email], replyTo: RECRUITMENT_REPLY_TO, subject: `R\xE9ponse \xE0 votre question \u2014 ${input.trackingId}`, html, text: text2 });
  if (error) throw new Error(`medical_question_response_email_failed:${error.message}`);
}
async function sendAdminMfaCodeEmail(email, code) {
  const html = buildHippocampusEmailShell(`<h2 style="color:#0891b2">Validation de s\xE9curit\xE9 administrateur</h2><p>Un acc\xE8s au tableau de bord Hippocampus Consulting vient d\u2019\xEAtre demand\xE9.</p><p style="margin:24px 0;padding:18px;text-align:center;border-radius:10px;background:#f1f5f9;font-size:28px;letter-spacing:7px;font-weight:700;color:#0f172a">${escapeHtml2(code)}</p><p>Ce code expire dans 10 minutes et ne doit \xEAtre communiqu\xE9 \xE0 personne. Si vous n\u2019\xEAtes pas \xE0 l\u2019origine de cette demande, ignorez cet email.</p>`);
  const text2 = `Validation de s\xE9curit\xE9 administrateur

Code : ${code}

Ce code expire dans 10 minutes. Ne le communiquez \xE0 personne.`;
  const { error } = await getResendClient().emails.send({ from: FROM_EMAIL, to: [email], replyTo: RECRUITMENT_REPLY_TO, subject: "Code de s\xE9curit\xE9 \u2014 Hippocampus Consulting", html, text: text2 });
  if (error) throw new Error(`admin_mfa_email_failed:${error.message}`);
}
async function sendConfirmationEmail(customerEmail, customerName, trackingId, appointmentDate, finalPrice, requestDetails, meetLink) {
  try {
    const formattedDate = appointmentDate.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const emailContent = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">Confirmation de R\xE9servation</h2>
      <p>Bonjour ${escapeHtml2(customerName)},</p>
      <p>Votre r\xE9servation a \xE9t\xE9 confirm\xE9e avec succ\xE8s.</p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <h3 style="color: #334155; margin-top: 0;">D\xE9tails de votre consultation :</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 4px 0;"><strong>Num\xE9ro de suivi :</strong> ${escapeHtml2(trackingId)}</li>
          <li style="padding: 4px 0;"><strong>Date et heure :</strong> ${formattedDate}</li>
          <li style="padding: 4px 0;"><strong>Montant :</strong> ${finalPrice}\u20AC</li>
          <li style="padding: 4px 0;"><strong>Demande :</strong> ${escapeHtml2(requestDetails)}</li>
          ${meetLink ? `<li style="padding: 4px 0;"><strong>Lien Google Meet :</strong> <a href="${escapeHtml2(meetLink)}">${escapeHtml2(meetLink)}</a></li>` : ""}
        </ul>
      </div>
      <p>Merci de votre confiance.</p>
    `);
    const { data, error } = await getResendClient().emails.send({
      from: FROM_EMAIL,
      to: [customerEmail],
      subject: `Confirmation de r\xE9servation - ${trackingId}`,
      html: emailContent
    });
    if (error) {
      console.error("Resend error sending confirmation email:", error);
      return;
    }
    console.log(`Confirmation email sent to ${customerEmail} (id: ${data?.id})`);
  } catch (error) {
    console.error("Error sending confirmation email:", error);
  }
}
async function sendOwnerNotificationEmail(customerName, customerEmail, customerPhone, trackingId, appointmentDate, finalPrice, requestDetails) {
  try {
    const formattedDate = appointmentDate.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const notificationContent = `
Nouvelle R\xE9servation - ${trackingId}

Client: ${customerName}
Email: ${customerEmail}
T\xE9l\xE9phone: ${customerPhone}
Date: ${formattedDate}
Montant: ${finalPrice}\u20AC
Demande: ${requestDetails}
    `.trim();
    await notifyOwner({
      title: `\u{1F5D3}\uFE0F Nouvelle r\xE9servation: ${customerName} - ${finalPrice}\u20AC`,
      content: notificationContent
    });
    console.log("Owner notification sent via Manus notification service");
  } catch (error) {
    console.error("Error sending owner notification:", error);
  }
}
async function sendOwnerNotificationSMS(customerName, customerPhone, trackingId, appointmentDate, finalPrice) {
  try {
    const formattedDate = appointmentDate.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    await notifyOwner({
      title: `\u{1F4F1} R\xE9servation ${trackingId}`,
      content: `${customerName} (${customerPhone}) - ${formattedDate} - ${finalPrice}\u20AC`
    });
    console.log("Owner SMS notification sent via Manus notification service");
  } catch (error) {
    console.error("Error sending owner notification SMS:", error);
  }
}
async function sendInvoiceEmail(customerEmail, customerName, trackingId, finalPrice, invoicePdfBuffer) {
  try {
    const emailContent = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">Votre Facture - Consultation Dr. Ben Lallahom</h2>
      <p>Bonjour ${escapeHtml2(customerName)},</p>
      <p>Veuillez trouver ci-joint la facture correspondant \xE0 votre consultation.</p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <h3 style="color: #334155; margin-top: 0;">R\xE9capitulatif :</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 4px 0;"><strong>R\xE9f\xE9rence :</strong> ${escapeHtml2(trackingId)}</li>
          <li style="padding: 4px 0;"><strong>Montant :</strong> ${finalPrice}\u20AC</li>
          <li style="padding: 4px 0;"><strong>Statut :</strong> \u2705 Pay\xE9</li>
        </ul>
      </div>
      <p>Merci de votre confiance.</p>
    `);
    const { data, error } = await getResendClient().emails.send({
      from: FROM_EMAIL,
      to: [customerEmail],
      subject: `Facture - Consultation ${trackingId}`,
      html: emailContent,
      attachments: [
        {
          filename: `Facture-${trackingId}.pdf`,
          content: invoicePdfBuffer.toString("base64")
        }
      ]
    });
    if (error) {
      console.error("Resend error sending invoice email:", error);
      return;
    }
    console.log(`Invoice email sent to ${customerEmail} (id: ${data?.id})`);
  } catch (error) {
    console.error("Error sending invoice email:", error);
  }
}
async function sendCustomerConfirmationSMS(customerPhone, trackingId, appointmentDate) {
  try {
    const formattedDate = appointmentDate.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    console.log(`Customer SMS notification for ${trackingId} - customer receives email confirmation instead`);
  } catch (error) {
    console.error("Error sending confirmation SMS:", error);
  }
}
async function sendRefundConfirmationEmail(customerEmail, customerName, trackingId, appointmentDate, refundAmount) {
  try {
    const formattedDate = appointmentDate.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const emailContent = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">Confirmation de remboursement</h2>
      <p>Bonjour ${escapeHtml2(customerName)},</p>
      <p>Le remboursement de votre consultation a \xE9t\xE9 enregistr\xE9.</p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>R\xE9f\xE9rence :</strong> ${escapeHtml2(trackingId)}</p>
        <p><strong>Consultation initiale :</strong> ${escapeHtml2(formattedDate)}</p>
        <p><strong>Montant rembours\xE9 :</strong> ${escapeHtml2(refundAmount)}\u20AC</p>
      </div>
      <p>Le d\xE9lai d\u2019apparition du remboursement d\xE9pend de votre \xE9tablissement bancaire.</p>
    `);
    const { data, error } = await getResendClient().emails.send({
      from: FROM_EMAIL,
      to: [customerEmail],
      subject: `Remboursement confirm\xE9 - ${trackingId}`,
      html: emailContent
    });
    if (error) {
      console.error("Resend error sending refund email:", error);
      return;
    }
    console.log(`Refund email sent to ${customerEmail} (id: ${data?.id})`);
  } catch (error) {
    console.error("Error sending refund email:", error);
  }
}
async function sendReminderEmail(customerEmail, customerName, trackingId, appointmentDate) {
  try {
    const formattedDate = appointmentDate.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const emailContent = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">\u23F0 Rappel - Votre consultation est demain</h2>
      <p>Bonjour ${escapeHtml2(customerName)},</p>
      <p>Nous vous rappelons que votre consultation avec le Dr. Ahmed Ben Lallahom est pr\xE9vue <strong>demain</strong>.</p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <h3 style="color: #334155; margin-top: 0;">D\xE9tails :</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 4px 0;"><strong>R\xE9f\xE9rence :</strong> ${escapeHtml2(trackingId)}</li>
          <li style="padding: 4px 0;"><strong>Date et heure :</strong> ${formattedDate}</li>
        </ul>
      </div>
      <p>Si vous devez annuler ou reporter votre rendez-vous, veuillez nous contacter d\xE8s que possible.</p>
      <p>\xC0 demain !</p>
    `);
    const { data, error } = await getResendClient().emails.send({
      from: FROM_EMAIL,
      to: [customerEmail],
      subject: `Rappel - Consultation demain (${trackingId})`,
      html: emailContent
    });
    if (error) {
      console.error("Resend error sending reminder email:", error);
      return;
    }
    console.log(`Reminder email sent to ${customerEmail} (id: ${data?.id})`);
  } catch (error) {
    console.error("Error sending reminder email:", error);
  }
}
async function sendCvApplicationConfirmationEmail(candidateEmail, candidateName, trackingId, specialty, targetCountries, candidatePortalInviteUrl) {
  try {
    const candidatePortalInvitation = candidatePortalInviteUrl ? `<div style="margin:24px 0;padding:18px;border:1px solid #bae6fd;border-radius:10px;background:#f0f9ff;"><h3 style="margin:0 0 8px;color:#0e7490;">Votre espace candidat s\xE9curis\xE9</h3><p style="margin:0 0 14px;">Vous pouvez cr\xE9er un acc\xE8s pour d\xE9poser ult\xE9rieurement vos documents administratifs dans votre coffre priv\xE9. L\u2019activation de votre adresse email restera obligatoire.</p><p style="margin:0;"><a href="${escapeHtml2(candidatePortalInviteUrl)}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700;">Cr\xE9er mon espace candidat</a></p></div>` : "";
    const emailContent = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">Candidature re\xE7ue \u2014 Hippocampus Consulting</h2>
      <p>Bonjour ${escapeHtml2(candidateName)},</p>
      <p>Nous confirmons la r\xE9ception de votre candidature de recrutement international.</p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>Num\xE9ro de suivi :</strong> ${escapeHtml2(trackingId)}</p>
        <p><strong>Sp\xE9cialit\xE9 :</strong> ${escapeHtml2(specialty)}</p>
        <p><strong>Pays cibl\xE9s :</strong> ${escapeHtml2(targetCountries)}</p>
      </div>
      <p>Votre profil sera examin\xE9 selon les opportunit\xE9s disponibles et les crit\xE8res du pays concern\xE9. Nous vous contacterons si votre profil correspond \xE0 une recherche.</p>
      ${candidatePortalInvitation}
      <p>Ne transmettez pas de donn\xE9es de patients, de dossiers m\xE9dicaux ou de documents cliniques dans votre candidature.</p>
      <p style="color:#64748b;font-size:13px;">Si vous ne retrouvez pas cet email, v\xE9rifiez votre dossier Spam ou Courriers ind\xE9sirables, puis ajoutez recrutement@drahmedbenlallahom.com \xE0 vos contacts.</p>
    `);
    const { data, error } = await getResendClient().emails.send({
      from: FROM_EMAIL,
      to: [candidateEmail],
      replyTo: RECRUITMENT_REPLY_TO,
      subject: `Candidature re\xE7ue - ${trackingId}`,
      html: emailContent
    });
    if (error) {
      console.error("Resend error sending CV application confirmation:", error);
      return;
    }
    console.log(`CV application confirmation sent to ${candidateEmail} (id: ${data?.id})`);
  } catch (error) {
    console.error("Error sending CV application confirmation:", error);
  }
}
function textToSafeHtml(value) {
  return escapeHtml2(value).replace(/\r?\n/g, "<br />");
}
function buildRecruitmentTemplateEmail(candidateName, trackingId, template, options = {}) {
  const language = options.language || "fr";
  const isInterest = template === "profile_interest";
  const copy = language === "en" ? {
    greeting: "Hello",
    heading: "Hippocampus Consulting",
    reference: "Reference",
    privacy: "This message concerns your professional application only. You may request access, rectification or deletion of your data through our GDPR form.",
    interestSubject: `Your profile has caught our attention \u2014 ${trackingId}`,
    complementSubject: `Additional information requested for your application \u2014 ${trackingId}`,
    interestBody: "Following an initial human review of your application, we would like to speak with you about international opportunities that may fit your profile. Please reply with your availability and an updated telephone number if applicable.",
    complementBody: "To continue the human review of your application, please provide the additional professional information or documents requested by our team. Never send patient information or clinical records.",
    requested: "Requested documents or information"
  } : {
    greeting: "Bonjour",
    heading: "Hippocampus Consulting",
    reference: "R\xE9f\xE9rence",
    privacy: "Cette communication concerne uniquement votre candidature professionnelle. Vous pouvez demander l\u2019acc\xE8s, la rectification ou la suppression de vos donn\xE9es via notre formulaire RGPD.",
    interestSubject: `Votre profil nous int\xE9resse \u2014 ${trackingId}`,
    complementSubject: `Compl\xE9ment d\u2019information concernant votre candidature \u2014 ${trackingId}`,
    interestBody: "Apr\xE8s une premi\xE8re revue humaine de votre candidature, nous souhaiterions \xE9changer avec vous au sujet des opportunit\xE9s internationales susceptibles de correspondre \xE0 votre profil. Merci de nous r\xE9pondre avec vos disponibilit\xE9s et votre num\xE9ro de t\xE9l\xE9phone si celui-ci a chang\xE9.",
    complementBody: "Afin de poursuivre l\u2019examen humain de votre candidature, merci de nous transmettre les informations ou documents professionnels compl\xE9mentaires demand\xE9s par notre \xE9quipe. Ne transmettez jamais de donn\xE9es de patients ni de dossier clinique.",
    requested: "Documents ou informations demand\xE9s"
  };
  const subject = isInterest ? copy.interestSubject : copy.complementSubject;
  const body = isInterest ? copy.interestBody : copy.complementBody;
  const customRequest = !isInterest && options.customRequest?.trim() ? `<div style="background: #f8fafc; border-radius: 8px; padding: 14px; margin: 16px 0;"><strong>${copy.requested}</strong><br />${textToSafeHtml(options.customRequest.trim())}</div>` : "";
  return {
    subject,
    html: buildHippocampusEmailShell(`
        <h2 style="color: #0891b2;">${copy.heading}</h2>
        <p>${copy.greeting} ${escapeHtml2(candidateName)},</p>
        <p>${escapeHtml2(body)}</p>
        ${customRequest}
        <p><strong>${copy.reference}:</strong> ${escapeHtml2(trackingId)}</p>
        <p>${copy.privacy}</p>
    `)
  };
}
async function sendRecruitmentTemplateEmail(candidateEmail, candidateName, trackingId, template, options = {}) {
  const message = buildRecruitmentTemplateEmail(candidateName, trackingId, template, options);
  const { data, error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to: [candidateEmail],
    replyTo: RECRUITMENT_REPLY_TO,
    subject: message.subject,
    html: message.html
  });
  if (error) throw new Error(`Resend recruitment email failed: ${error.message}`);
  return { id: data?.id };
}
async function sendRecruitmentCampaignEmail(input) {
  const copy = input.language === "en" ? { greeting: "Hello", footer: "This offer concerns your professional profile.", unsubscribe: "Unsubscribe from future recruitment opportunities" } : { greeting: "Bonjour", footer: "Cette offre concerne votre profil professionnel.", unsubscribe: "Ne plus recevoir d\u2019opportunit\xE9s de recrutement" };
  const { data, error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to: [input.candidateEmail],
    replyTo: RECRUITMENT_REPLY_TO,
    subject: input.subject,
    html: buildHippocampusEmailShell(`
        <h2 style="color: #0891b2;">${escapeHtml2(input.campaignTitle)}</h2>
        <p>${copy.greeting} ${escapeHtml2(input.candidateName)},</p>
        <p>${textToSafeHtml(input.body)}</p>
        <p style="color: #64748b;">${copy.footer}</p>
        <p style="font-size: 12px;"><a href="${escapeHtml2(input.unsubscribeUrl)}" style="color: #0e7490;">${copy.unsubscribe}</a></p>
    `)
  });
  if (error) throw new Error(`Resend campaign email failed: ${error.message}`);
  return { id: data?.id };
}
function buildCandidatePortalAccessEmail(input) {
  const copy = input.kind === "verify" ? {
    subject: "Confirmez votre adresse email \u2014 Espace candidat Hippocampus",
    title: "Confirmez votre adresse email",
    instruction: "Vous recevez cet email parce qu\u2019un espace candidat vient d\u2019\xEAtre cr\xE9\xE9 avec cette adresse. Pour finaliser son activation, confirmez simplement votre adresse email en cliquant sur le bouton ci-dessous.",
    action: "Confirmer mon adresse email",
    securityNote: "Ce lien personnel et temporaire finalise uniquement l\u2019activation de votre adresse. Si vous n\u2019avez pas cr\xE9\xE9 cet espace candidat, ignorez cet email : aucun acc\xE8s ne sera activ\xE9."
  } : input.kind === "reset" ? {
    subject: "R\xE9initialisez votre mot de passe \u2014 Hippocampus Consulting",
    title: "R\xE9initialisez votre mot de passe",
    instruction: "Une demande de r\xE9initialisation a \xE9t\xE9 re\xE7ue. Choisissez un nouveau mot de passe en cliquant sur le bouton ci-dessous.",
    action: "R\xE9initialiser mon mot de passe",
    securityNote: "Ce lien est personnel et temporaire. Si vous n\u2019\xEAtes pas \xE0 l\u2019origine de cette demande, vous pouvez ignorer cet email."
  } : {
    subject: "Cr\xE9ez votre espace candidat \u2014 Hippocampus Consulting",
    title: "Cr\xE9ez votre espace candidat",
    instruction: "Notre \xE9quipe vous invite \xE0 cr\xE9er votre espace candidat s\xE9curis\xE9 pour d\xE9poser et suivre vos documents administratifs. Vous choisirez votre mot de passe et devrez ensuite activer votre adresse email.",
    action: "Cr\xE9er mon espace candidat",
    securityNote: "Ce lien s\xE9curis\xE9 est personnel et temporaire. Il ne donne aucun acc\xE8s sans cr\xE9ation de mot de passe ni activation de votre adresse email."
  };
  return {
    subject: copy.subject,
    html: buildHippocampusEmailShell(`
        <h2 style="color:#0891b2;">${copy.title}</h2>
        <p>Bonjour ${escapeHtml2(input.firstName || "")},</p>
        <p>${copy.instruction}</p>
        <p style="margin:24px 0;"><a href="${escapeHtml2(input.actionUrl)}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700;">${copy.action}</a></p>
        <p style="color:#64748b;font-size:13px;">${copy.securityNote}</p>
        <p style="color:#64748b;font-size:13px;">Cet email est envoy\xE9 par Hippocampus Consulting depuis recrutement@drahmedbenlallahom.com. Si vous ne retrouvez pas cet email, v\xE9rifiez votre dossier Spam ou Courriers ind\xE9sirables, puis ajoutez cette adresse \xE0 vos contacts.</p>
    `),
    text: `${copy.title}

Bonjour ${input.firstName || ""},

${copy.instruction}

${input.actionUrl}

${copy.securityNote}

Cet email est envoy\xE9 par Hippocampus Consulting depuis recrutement@drahmedbenlallahom.com. Si vous ne retrouvez pas cet email, v\xE9rifiez votre dossier Spam ou Courriers ind\xE9sirables, puis ajoutez cette adresse \xE0 vos contacts.`
  };
}
async function sendCandidatePortalAccessEmail(input) {
  const message = buildCandidatePortalAccessEmail(input);
  const { data, error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to: [input.to],
    replyTo: RECRUITMENT_REPLY_TO,
    subject: message.subject,
    html: message.html,
    text: message.text
  });
  if (error) throw new Error(`Resend candidate access email failed: ${error.message}`);
  return { id: data?.id };
}
var resendClient, FROM_EMAIL, RECRUITMENT_REPLY_TO, HIPPOCAMPUS_LOGO_URL;
var init_notifications = __esm({
  "server/_core/notifications.ts"() {
    "use strict";
    init_notification();
    FROM_EMAIL = "Hippocampus Consulting <recrutement@drahmedbenlallahom.com>";
    RECRUITMENT_REPLY_TO = "hippocampusconsultingfrance@gmail.com";
    HIPPOCAMPUS_LOGO_URL = "https://drahmedbenlallahom.com/assets/abl-logo.svg";
  }
});

// server/adminMfa.ts
var adminMfa_exports = {};
__export(adminMfa_exports, {
  ADMIN_MFA_COOKIE: () => ADMIN_MFA_COOKIE,
  adminMfaCookieOptions: () => adminMfaCookieOptions,
  isAdminMfaVerified: () => isAdminMfaVerified,
  issueAdminMfaChallenge: () => issueAdminMfaChallenge,
  secureMfaHashEquals: () => secureMfaHashEquals,
  verifyAdminMfaChallenge: () => verifyAdminMfaChallenge
});
import { createHash as createHash2, randomBytes as randomBytes2, randomInt, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
import { and as and3, eq as eq4, gt, isNull, lt, sql } from "drizzle-orm";
function mfaPepper() {
  const pepper = process.env.CANDIDATE_AUTH_PEPPER || process.env.JWT_SECRET;
  if (!pepper) throw new Error("admin_mfa_pepper_unavailable");
  return pepper;
}
function hashMfa(value, purpose) {
  return createHash2("sha256").update(`${purpose}:${value}:${mfaPepper()}`).digest("hex");
}
function secureMfaHashEquals(expected, actual) {
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual2(expectedBuffer, actualBuffer);
}
function cookieValue(source, name) {
  return source?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}
function isSecureRequest2(req) {
  return req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
}
function adminMfaCookieOptions(req) {
  return { httpOnly: true, secure: isSecureRequest2(req), sameSite: "lax", path: "/", maxAge: MFA_MAX_AGE_SECONDS * 1e3 };
}
async function isAdminMfaVerified(req, openId) {
  const token = cookieValue(typeof req.headers.cookie === "string" ? req.headers.cookie : void 0, ADMIN_MFA_COOKIE);
  if (!token) return false;
  const db = await getDb();
  if (!db) return false;
  const active = await db.select({ id: adminMfaSessions.id }).from(adminMfaSessions).where(and3(eq4(adminMfaSessions.openId, openId), eq4(adminMfaSessions.tokenHash, hashMfa(token, "session")), gt(adminMfaSessions.expiresAt, /* @__PURE__ */ new Date()), isNull(adminMfaSessions.revokedAt))).limit(1);
  return Boolean(active[0]);
}
async function issueAdminMfaChallenge(input) {
  const db = await getDb();
  if (!db) throw new Error("admin_mfa_database_unavailable");
  const code = String(randomInt(1e5, 1e6));
  const now = /* @__PURE__ */ new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1e3);
  await db.insert(adminMfaChallenges).values({ openId: input.openId, codeHash: hashMfa(code, "code"), expiresAt });
  await sendAdminMfaCodeEmail(input.email, code);
  await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_challenge_issued", outcome: "allowed", ipHash: requestIpHash(input.req.headers) });
}
async function verifyAdminMfaChallenge(input) {
  const db = await getDb();
  if (!db) throw new Error("admin_mfa_database_unavailable");
  const challenge = (await db.select().from(adminMfaChallenges).where(and3(eq4(adminMfaChallenges.openId, input.openId), isNull(adminMfaChallenges.consumedAt), gt(adminMfaChallenges.expiresAt, /* @__PURE__ */ new Date()))).limit(1))[0];
  if (!challenge || challenge.attempts >= 5 || !secureMfaHashEquals(challenge.codeHash, hashMfa(input.code, "code"))) {
    if (challenge) {
      await db.update(adminMfaChallenges).set({ attempts: sql`${adminMfaChallenges.attempts} + 1` }).where(and3(eq4(adminMfaChallenges.id, challenge.id), lt(adminMfaChallenges.attempts, 5), isNull(adminMfaChallenges.consumedAt)));
    }
    await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_verify", outcome: "failed", severity: "high", ipHash: requestIpHash(input.req.headers) });
    throw new Error("admin_mfa_code_invalid");
  }
  const token = randomBytes2(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MFA_MAX_AGE_SECONDS * 1e3);
  await db.update(adminMfaChallenges).set({ consumedAt: /* @__PURE__ */ new Date() }).where(and3(eq4(adminMfaChallenges.id, challenge.id), lt(adminMfaChallenges.attempts, 5), isNull(adminMfaChallenges.consumedAt)));
  await db.insert(adminMfaSessions).values({ openId: input.openId, tokenHash: hashMfa(token, "session"), expiresAt });
  input.res.cookie(ADMIN_MFA_COOKIE, token, adminMfaCookieOptions(input.req));
  await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_verify", outcome: "allowed", ipHash: requestIpHash(input.req.headers) });
}
var ADMIN_MFA_COOKIE, MFA_MAX_AGE_SECONDS;
var init_adminMfa = __esm({
  "server/adminMfa.ts"() {
    "use strict";
    init_schema();
    init_db();
    init_candidateSecurity();
    init_notifications();
    ADMIN_MFA_COOKIE = "admin_mfa_session";
    MFA_MAX_AGE_SECONDS = 8 * 60 * 60;
  }
});

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t, router, publicProcedure, requireUser, protectedProcedure, adminProcedure;
var init_trpc = __esm({
  "server/_core/trpc.ts"() {
    "use strict";
    init_const();
    init_adminMfa();
    t = initTRPC.context().create({
      transformer: superjson
    });
    router = t.router;
    publicProcedure = t.procedure;
    requireUser = t.middleware(async (opts) => {
      const { ctx, next } = opts;
      if (!ctx.user) {
        throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      }
      return next({
        ctx: {
          ...ctx,
          user: ctx.user
        }
      });
    });
    protectedProcedure = t.procedure.use(requireUser);
    adminProcedure = t.procedure.use(
      t.middleware(async (opts) => {
        const { ctx, next } = opts;
        if (!ctx.user || ctx.user.role !== "admin") {
          throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
        }
        if (!await isAdminMfaVerified(ctx.req, ctx.user.openId)) {
          throw new TRPCError2({ code: "FORBIDDEN", message: "Validation de s\xE9curit\xE9 administrateur requise (10003)" });
        }
        return next({
          ctx: {
            ...ctx,
            user: ctx.user
          }
        });
      })
    );
  }
});

// server/candidateAuth.ts
import { createHash as createHash3, createHmac as createHmac2, randomBytes as randomBytes3, scrypt as scryptCallback, timingSafeEqual as timingSafeEqual3 } from "node:crypto";
function candidateAuthPepper() {
  const pepper = process.env.CANDIDATE_AUTH_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("candidate_auth_pepper_invalid");
  return pepper;
}
function normalizeCandidateEmail(value) {
  return value.trim().toLowerCase();
}
function passwordMaterial(password) {
  return createHmac2("sha256", candidateAuthPepper()).update(password, "utf8").digest();
}
function deriveCandidateKey(password, salt, N, r, p) {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, SCRYPT_KEY_LENGTH, { N, r, p, maxmem: 128 * 1024 * 1024 }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
function validateCandidatePassword(password) {
  if (password.length < 15) return "candidate_password_too_short";
  if (password.length > 128) return "candidate_password_too_long";
  return null;
}
async function hashCandidatePassword(password) {
  const validation = validateCandidatePassword(password);
  if (validation) throw new Error(validation);
  const salt = randomBytes3(16);
  const hash = await deriveCandidateKey(passwordMaterial(password), salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64url"), hash.toString("base64url")].join("$");
}
async function verifyCandidatePassword(password, storedHash) {
  const [algorithm, n, r, p, saltText, hashText] = storedHash.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !saltText || !hashText) return false;
  const numericN = Number(n);
  const numericR = Number(r);
  const numericP = Number(p);
  if (![numericN, numericR, numericP].every(Number.isSafeInteger)) return false;
  const expected = Buffer.from(hashText, "base64url");
  if (expected.length !== SCRYPT_KEY_LENGTH) return false;
  const actual = await deriveCandidateKey(passwordMaterial(password), Buffer.from(saltText, "base64url"), numericN, numericR, numericP);
  return timingSafeEqual3(actual, expected);
}
function createCandidateToken() {
  return randomBytes3(32).toString("base64url");
}
function createCandidateInvitationToken(applicationId, expiresAt = Date.now() + CANDIDATE_TOKEN_MAX_AGE_MS) {
  if (!Number.isSafeInteger(applicationId) || applicationId < 1) throw new Error("candidate_invitation_application_invalid");
  if (!Number.isSafeInteger(expiresAt)) throw new Error("candidate_invitation_expiry_invalid");
  const payload = Buffer.from(JSON.stringify({ applicationId, expiresAt }), "utf8").toString("base64url");
  const signature = createHmac2("sha256", candidateAuthPepper()).update(`candidate_invitation:${payload}`, "utf8").digest("base64url");
  return `${payload}.${signature}`;
}
function verifyCandidateInvitationToken(token) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac2("sha256", candidateAuthPepper()).update(`candidate_invitation:${payload}`, "utf8").digest("base64url");
  const suppliedBytes = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual3(suppliedBytes, expectedBytes)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const applicationId = parsed.applicationId;
    const expiresAt = parsed.expiresAt;
    if (typeof applicationId !== "number" || !Number.isSafeInteger(applicationId) || applicationId < 1) return null;
    if (typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return null;
    return { applicationId, expiresAt };
  } catch {
    return null;
  }
}
function hashCandidateToken(token, purpose) {
  return createHash3("sha256").update(`${purpose}:${token}:${candidateAuthPepper()}`, "utf8").digest("hex");
}
function candidateSessionCookieOptions(isSecure) {
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: CANDIDATE_SESSION_MAX_AGE_SECONDS * 1e3
  };
}
var CANDIDATE_SESSION_COOKIE, CANDIDATE_SESSION_MAX_AGE_SECONDS, CANDIDATE_TOKEN_MAX_AGE_MS, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEY_LENGTH;
var init_candidateAuth = __esm({
  "server/candidateAuth.ts"() {
    "use strict";
    CANDIDATE_SESSION_COOKIE = "candidate_portal_session";
    CANDIDATE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
    CANDIDATE_TOKEN_MAX_AGE_MS = 1e3 * 60 * 30;
    SCRYPT_N = 1 << 15;
    SCRYPT_R = 8;
    SCRYPT_P = 3;
    SCRYPT_KEY_LENGTH = 64;
  }
});

// server/candidateTurnstile.ts
var candidateTurnstile_exports = {};
__export(candidateTurnstile_exports, {
  candidateRequestIp: () => candidateRequestIp,
  verifyCandidateTurnstile: () => verifyCandidateTurnstile
});
async function verifyCandidateTurnstile(input) {
  if (process.env.NODE_ENV === "test") return;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !input.token) throw new Error("candidate_turnstile_required");
  const body = new URLSearchParams({ secret, response: input.token });
  if (input.remoteIp) body.set("remoteip", input.remoteIp);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) throw new Error("candidate_turnstile_unavailable");
  const result = await response.json();
  if (!result.success || result.hostname && !TRUSTED_HOSTS.has(result.hostname)) {
    throw new Error("candidate_turnstile_invalid");
  }
}
function candidateRequestIp(headers) {
  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || null;
  const realIp = headers["x-real-ip"];
  return typeof realIp === "string" ? realIp.trim() || null : null;
}
var TRUSTED_HOSTS;
var init_candidateTurnstile = __esm({
  "server/candidateTurnstile.ts"() {
    "use strict";
    TRUSTED_HOSTS = /* @__PURE__ */ new Set([
      "drahmedbenlallahom.com",
      "www.drahmedbenlallahom.com",
      "drbenlallah-esc8d3hd.manus.space",
      "localhost",
      "127.0.0.1"
    ]);
  }
});

// server/candidatePortalRouter.ts
var candidatePortalRouter_exports = {};
__export(candidatePortalRouter_exports, {
  candidatePortalRouter: () => candidatePortalRouter,
  getCandidateSession: () => getCandidateSession,
  requireCandidateSession: () => requireCandidateSession
});
import { parse as parseCookie } from "cookie";
import { and as and4, desc, eq as eq5, gt as gt2, isNull as isNull2 } from "drizzle-orm";
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";
function getRequestProtocol(req) {
  const forwarded = req.headers["x-forwarded-proto"];
  const forwardedText = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return req.protocol === "https" || forwardedText === "https";
}
function portalOrigin() {
  return process.env.PUBLIC_APP_ORIGIN || "https://drahmedbenlallahom.com";
}
function databaseOrThrow(db) {
  if (!db) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Le service candidat est temporairement indisponible." });
  return db;
}
async function candidateDatabaseOperation(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TRPCError3) throw error;
    console.error("candidate_database_operation_failed", error);
    throw new TRPCError3({
      code: "INTERNAL_SERVER_ERROR",
      message: "Le service candidat est temporairement indisponible. Veuillez r\xE9essayer dans quelques instants."
    });
  }
}
function candidateCookieToken(req) {
  const cookieHeader = req.headers.cookie;
  const source = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  return typeof source === "string" ? parseCookie(source)[CANDIDATE_SESSION_COOKIE] ?? null : null;
}
async function getCandidateSession(req) {
  const token = candidateCookieToken(req);
  if (!token) return null;
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ candidate: candidateAccounts }).from(candidateSessions).innerJoin(candidateAccounts, eq5(candidateSessions.candidateId, candidateAccounts.id)).where(and4(
    eq5(candidateSessions.tokenHash, hashCandidateToken(token, "session")),
    gt2(candidateSessions.expiresAt, /* @__PURE__ */ new Date()),
    isNull2(candidateSessions.revokedAt),
    eq5(candidateAccounts.status, "active")
  )).limit(1);
  return rows[0]?.candidate ?? null;
}
async function requireCandidateSession(req) {
  const candidate = await getCandidateSession(req);
  if (!candidate) throw new TRPCError3({ code: "UNAUTHORIZED", message: "Votre session a expir\xE9. Veuillez vous reconnecter." });
  return candidate;
}
async function logCandidateAudit(input) {
  const db = await getDb();
  if (!db) return;
  await db.insert(candidateDocumentAuditLogs).values({
    candidateId: input.candidateId,
    documentId: input.documentId ?? null,
    actorType: input.actorType ?? "candidate",
    actorReference: input.actorReference ?? null,
    action: input.action,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null
  });
}
async function createCandidateSession(candidateId, req, res) {
  const db = databaseOrThrow(await getDb());
  const token = createCandidateToken();
  const expiresAt = new Date(Date.now() + CANDIDATE_SESSION_MAX_AGE_SECONDS * 1e3);
  await db.insert(candidateSessions).values({
    candidateId,
    tokenHash: hashCandidateToken(token, "session"),
    deviceLabel: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 180) : "Navigateur inconnu",
    ipHash: requestIpHash(req.headers),
    expiresAt
  });
  res.cookie(CANDIDATE_SESSION_COOKIE, token, candidateSessionCookieOptions(getRequestProtocol(req)));
}
var genericAccessMessage, passwordInput, genericAuthInput, turnstileInput, candidatePortalRouter;
var init_candidatePortalRouter = __esm({
  "server/candidatePortalRouter.ts"() {
    "use strict";
    init_schema();
    init_db();
    init_candidateAuth();
    init_notifications();
    init_storage();
    init_trpc();
    init_candidateTurnstile();
    init_candidateSecurity();
    genericAccessMessage = "Si vos informations sont valides, vous recevrez les instructions n\xE9cessaires par email. Pensez \xE0 v\xE9rifier votre dossier Spam ou Courriers ind\xE9sirables si le message n\u2019appara\xEEt pas dans votre bo\xEEte de r\xE9ception.";
    passwordInput = z2.string().min(1).max(128);
    genericAuthInput = z2.object({ email: z2.string().email().max(320), password: passwordInput });
    turnstileInput = z2.object({ turnstileToken: z2.string().min(20).max(4096) });
    candidatePortalRouter = router({
      register: publicProcedure.input(genericAuthInput.extend({
        firstName: z2.string().trim().min(1).max(120),
        lastName: z2.string().trim().min(1).max(120),
        termsAccepted: z2.boolean().refine((value) => value, "L\u2019acceptation des conditions est requise."),
        documentConsent: z2.boolean().refine((value) => value, "Le consentement au traitement documentaire est requis."),
        invitationToken: z2.string().min(24).max(600).optional()
      }).merge(turnstileInput)).mutation(async ({ input, ctx }) => {
        const email = normalizeCandidateEmail(input.email);
        const ipHash = requestIpHash(ctx.req.headers);
        try {
          await enforcePersistentRateLimit({ action: "candidate_register", subject: `${email}:${ipHash ?? "unknown"}`, maxAttempts: 5, windowMs: 60 * 60 * 1e3, blockMs: 60 * 60 * 1e3 });
        } catch {
          await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_register_rate_limited", outcome: "blocked", severity: "warning", ipHash });
          throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "Trop de tentatives. Veuillez r\xE9essayer plus tard." });
        }
        try {
          await verifyCandidateTurnstile({ token: input.turnstileToken, remoteIp: candidateRequestIp(ctx.req.headers) });
        } catch {
          await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_register_turnstile", outcome: "blocked", severity: "warning", ipHash });
          throw new TRPCError3({ code: "BAD_REQUEST", message: "La v\xE9rification anti-bot doit \xEAtre renouvel\xE9e avant de cr\xE9er votre acc\xE8s." });
        }
        const passwordError = validateCandidatePassword(input.password);
        if (passwordError) throw new TRPCError3({ code: "BAD_REQUEST", message: "Choisissez un mot de passe d\u2019au moins 15 caract\xE8res." });
        try {
          if (await isCompromisedPassword(input.password)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Ce mot de passe a d\xE9j\xE0 \xE9t\xE9 compromis. Choisissez-en un autre, long et unique." });
        } catch (error) {
          if (error instanceof TRPCError3) throw error;
          throw new TRPCError3({ code: "SERVICE_UNAVAILABLE", message: "Le contr\xF4le de s\xE9curit\xE9 du mot de passe est temporairement indisponible." });
        }
        const db = databaseOrThrow(await getDb());
        const now = /* @__PURE__ */ new Date();
        const verificationToken = createCandidateToken();
        const verificationExpiresAt = new Date(now.getTime() + CANDIDATE_TOKEN_MAX_AGE_MS);
        const invitation = input.invitationToken ? verifyCandidateInvitationToken(input.invitationToken) : null;
        if (input.invitationToken && !invitation) throw new TRPCError3({ code: "BAD_REQUEST", message: "Cette invitation est invalide ou expir\xE9e. Demandez un nouveau lien \xE0 notre \xE9quipe." });
        const invitedApplication = invitation ? (await candidateDatabaseOperation(() => db.select({ id: cvApplications.id, email: cvApplications.email }).from(cvApplications).where(eq5(cvApplications.id, invitation.applicationId)).limit(1)))[0] : null;
        if (invitation && (!invitedApplication || normalizeCandidateEmail(invitedApplication.email) !== email)) {
          throw new TRPCError3({ code: "BAD_REQUEST", message: "Cette invitation ne correspond pas \xE0 cette adresse email." });
        }
        const matchingApplicationId = invitedApplication?.id ?? (await candidateDatabaseOperation(() => db.select({ id: cvApplications.id }).from(cvApplications).where(eq5(cvApplications.email, email)).limit(1)))[0]?.id ?? null;
        const existing = await candidateDatabaseOperation(() => db.select().from(candidateAccounts).where(eq5(candidateAccounts.email, email)).limit(1));
        let candidateId = null;
        if (existing[0]) {
          if (!existing[0].emailVerifiedAt && existing[0].status === "active") {
            const passwordHash = await hashCandidatePassword(input.password);
            await candidateDatabaseOperation(() => db.update(candidateAccounts).set({
              firstName: input.firstName,
              lastName: input.lastName,
              passwordHash,
              verificationTokenHash: hashCandidateToken(verificationToken, "verification"),
              verificationExpiresAt,
              termsAcceptedAt: now,
              documentConsentAt: now,
              linkedApplicationId: matchingApplicationId
            }).where(eq5(candidateAccounts.id, existing[0].id)));
            candidateId = existing[0].id;
          }
        } else {
          const passwordHash = await hashCandidatePassword(input.password);
          const result = await candidateDatabaseOperation(() => db.insert(candidateAccounts).values({
            email,
            firstName: input.firstName,
            lastName: input.lastName,
            passwordHash,
            verificationTokenHash: hashCandidateToken(verificationToken, "verification"),
            verificationExpiresAt,
            linkedApplicationId: matchingApplicationId,
            termsAcceptedAt: now,
            documentConsentAt: now
          }).returning({ id: candidateAccounts.id }));
          candidateId = Number(result[0].id);
        }
        if (candidateId) {
          const verifyUrl = `${portalOrigin()}/candidate/verify?email=${encodeURIComponent(email)}&token=${encodeURIComponent(verificationToken)}`;
          await sendCandidatePortalAccessEmail({ to: email, firstName: input.firstName, kind: "verify", actionUrl: verifyUrl }).catch((error) => console.error("candidate_verification_email_failed", error));
          await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidateId), category: "candidate_account_created", outcome: "allowed", ipHash });
        }
        return { message: genericAccessMessage };
      }),
      resolveInvitation: publicProcedure.input(z2.object({ token: z2.string().min(24).max(600) })).query(async ({ input }) => {
        const invitation = verifyCandidateInvitationToken(input.token);
        if (!invitation) throw new TRPCError3({ code: "BAD_REQUEST", message: "Cette invitation est invalide ou expir\xE9e." });
        const db = databaseOrThrow(await getDb());
        const application = (await db.select({ email: cvApplications.email, firstName: cvApplications.firstName, lastName: cvApplications.lastName }).from(cvApplications).where(eq5(cvApplications.id, invitation.applicationId)).limit(1))[0];
        if (!application) throw new TRPCError3({ code: "NOT_FOUND", message: "Cette candidature n\u2019est plus disponible." });
        return application;
      }),
      verifyEmail: publicProcedure.input(z2.object({ email: z2.string().email().max(320), token: z2.string().min(20).max(200) })).mutation(async ({ input, ctx }) => {
        const db = databaseOrThrow(await getDb());
        const candidate = (await db.select().from(candidateAccounts).where(and4(
          eq5(candidateAccounts.email, normalizeCandidateEmail(input.email)),
          eq5(candidateAccounts.verificationTokenHash, hashCandidateToken(input.token, "verification")),
          gt2(candidateAccounts.verificationExpiresAt, /* @__PURE__ */ new Date()),
          eq5(candidateAccounts.status, "active")
        )).limit(1))[0];
        if (!candidate) throw new TRPCError3({ code: "BAD_REQUEST", message: "Ce lien de v\xE9rification est invalide ou expir\xE9." });
        await db.update(candidateAccounts).set({ emailVerifiedAt: /* @__PURE__ */ new Date(), verificationTokenHash: null, verificationExpiresAt: null }).where(eq5(candidateAccounts.id, candidate.id));
        await createCandidateSession(candidate.id, ctx.req, ctx.res);
        await logCandidateAudit({ candidateId: candidate.id, action: "login", metadata: { method: "email_verification" } });
        return { success: true };
      }),
      login: publicProcedure.input(genericAuthInput).mutation(async ({ input, ctx }) => {
        const db = databaseOrThrow(await getDb());
        const email = normalizeCandidateEmail(input.email);
        const ipHash = requestIpHash(ctx.req.headers);
        try {
          await enforcePersistentRateLimit({ action: "candidate_login", subject: `${email}:${ipHash ?? "unknown"}`, maxAttempts: 10, windowMs: 15 * 60 * 1e3, blockMs: 15 * 60 * 1e3 });
        } catch {
          await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_login_rate_limited", outcome: "blocked", severity: "warning", ipHash });
          throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "Trop de tentatives. Veuillez r\xE9essayer dans quelques minutes." });
        }
        const candidate = (await db.select().from(candidateAccounts).where(eq5(candidateAccounts.email, email)).limit(1))[0];
        const genericError = new TRPCError3({ code: "UNAUTHORIZED", message: "Email ou mot de passe incorrect." });
        if (!candidate || candidate.status !== "active" || !candidate.emailVerifiedAt) {
          await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_login", outcome: "failed", severity: "warning", ipHash });
          throw genericError;
        }
        if (candidate.lockedUntil && candidate.lockedUntil > /* @__PURE__ */ new Date()) {
          await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_login_locked", outcome: "blocked", severity: "warning", ipHash });
          throw genericError;
        }
        const valid = await verifyCandidatePassword(input.password, candidate.passwordHash);
        if (!valid) {
          const failedLoginCount = candidate.failedLoginCount + 1;
          await db.update(candidateAccounts).set({
            failedLoginCount,
            lockedUntil: failedLoginCount >= 5 ? new Date(Date.now() + 15 * 60 * 1e3) : null
          }).where(eq5(candidateAccounts.id, candidate.id));
          await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_login", outcome: "failed", severity: failedLoginCount >= 5 ? "high" : "warning", ipHash });
          throw genericError;
        }
        await db.update(candidateAccounts).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: /* @__PURE__ */ new Date() }).where(eq5(candidateAccounts.id, candidate.id));
        await createCandidateSession(candidate.id, ctx.req, ctx.res);
        await logCandidateAudit({ candidateId: candidate.id, action: "login", metadata: { method: "password" } });
        await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_login", outcome: "allowed", ipHash });
        return { success: true };
      }),
      logout: publicProcedure.mutation(async ({ ctx }) => {
        const candidate = await getCandidateSession(ctx.req);
        const db = await getDb();
        const token = candidateCookieToken(ctx.req);
        if (candidate && db && token) {
          await db.update(candidateSessions).set({ revokedAt: /* @__PURE__ */ new Date() }).where(eq5(candidateSessions.tokenHash, hashCandidateToken(token, "session")));
          await logCandidateAudit({ candidateId: candidate.id, action: "logout" });
        }
        ctx.res.clearCookie(CANDIDATE_SESSION_COOKIE, { ...candidateSessionCookieOptions(getRequestProtocol(ctx.req)), maxAge: -1 });
        return { success: true };
      }),
      requestPasswordReset: publicProcedure.input(z2.object({ email: z2.string().email().max(320), turnstileToken: z2.string().min(20).max(4096) })).mutation(async ({ input, ctx }) => {
        const email = normalizeCandidateEmail(input.email);
        const ipHash = requestIpHash(ctx.req.headers);
        try {
          await enforcePersistentRateLimit({ action: "candidate_password_reset", subject: `${email}:${ipHash ?? "unknown"}`, maxAttempts: 4, windowMs: 60 * 60 * 1e3, blockMs: 60 * 60 * 1e3 });
        } catch {
          await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_password_reset_rate_limited", outcome: "blocked", severity: "warning", ipHash });
          throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "Trop de demandes. Veuillez r\xE9essayer plus tard." });
        }
        try {
          await verifyCandidateTurnstile({ token: input.turnstileToken, remoteIp: candidateRequestIp(ctx.req.headers) });
        } catch {
          await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_password_reset_turnstile", outcome: "blocked", severity: "warning", ipHash });
          throw new TRPCError3({ code: "BAD_REQUEST", message: "La v\xE9rification anti-bot doit \xEAtre renouvel\xE9e avant de demander un lien." });
        }
        const db = databaseOrThrow(await getDb());
        const candidate = (await db.select().from(candidateAccounts).where(and4(eq5(candidateAccounts.email, email), eq5(candidateAccounts.status, "active"))).limit(1))[0];
        if (candidate?.emailVerifiedAt) {
          const token = createCandidateToken();
          await db.update(candidateAccounts).set({
            passwordResetTokenHash: hashCandidateToken(token, "reset"),
            passwordResetExpiresAt: new Date(Date.now() + CANDIDATE_TOKEN_MAX_AGE_MS)
          }).where(eq5(candidateAccounts.id, candidate.id));
          const resetUrl = `${portalOrigin()}/candidate/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
          await sendCandidatePortalAccessEmail({ to: email, firstName: candidate.firstName ?? "", kind: "reset", actionUrl: resetUrl }).catch((error) => console.error("candidate_reset_email_failed", error));
          await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_password_reset_requested", outcome: "allowed", ipHash });
        }
        return { message: genericAccessMessage };
      }),
      resetPassword: publicProcedure.input(z2.object({ email: z2.string().email().max(320), token: z2.string().min(20).max(200), password: passwordInput })).mutation(async ({ input, ctx }) => {
        const passwordError = validateCandidatePassword(input.password);
        if (passwordError) throw new TRPCError3({ code: "BAD_REQUEST", message: "Choisissez un mot de passe d\u2019au moins 15 caract\xE8res." });
        try {
          if (await isCompromisedPassword(input.password)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Ce mot de passe a d\xE9j\xE0 \xE9t\xE9 compromis. Choisissez-en un autre, long et unique." });
        } catch (error) {
          if (error instanceof TRPCError3) throw error;
          throw new TRPCError3({ code: "SERVICE_UNAVAILABLE", message: "Le contr\xF4le de s\xE9curit\xE9 du mot de passe est temporairement indisponible." });
        }
        const db = databaseOrThrow(await getDb());
        const candidate = (await db.select().from(candidateAccounts).where(and4(
          eq5(candidateAccounts.email, normalizeCandidateEmail(input.email)),
          eq5(candidateAccounts.passwordResetTokenHash, hashCandidateToken(input.token, "reset")),
          gt2(candidateAccounts.passwordResetExpiresAt, /* @__PURE__ */ new Date()),
          eq5(candidateAccounts.status, "active")
        )).limit(1))[0];
        if (!candidate) throw new TRPCError3({ code: "BAD_REQUEST", message: "Ce lien de r\xE9initialisation est invalide ou expir\xE9." });
        await db.update(candidateAccounts).set({
          passwordHash: await hashCandidatePassword(input.password),
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          failedLoginCount: 0,
          lockedUntil: null
        }).where(eq5(candidateAccounts.id, candidate.id));
        await db.update(candidateSessions).set({ revokedAt: /* @__PURE__ */ new Date() }).where(and4(eq5(candidateSessions.candidateId, candidate.id), isNull2(candidateSessions.revokedAt)));
        await createCandidateSession(candidate.id, ctx.req, ctx.res);
        await logCandidateAudit({ candidateId: candidate.id, action: "login", metadata: { method: "password_reset" } });
        return { success: true };
      }),
      me: publicProcedure.query(async ({ ctx }) => {
        const candidate = await getCandidateSession(ctx.req);
        if (!candidate) return null;
        return { id: candidate.id, email: candidate.email, firstName: candidate.firstName, lastName: candidate.lastName, emailVerifiedAt: candidate.emailVerifiedAt, linkedApplicationId: candidate.linkedApplicationId, documentConsentAt: candidate.documentConsentAt };
      }),
      sessions: publicProcedure.query(async ({ ctx }) => {
        const candidate = await requireCandidateSession(ctx.req);
        const db = databaseOrThrow(await getDb());
        const currentToken = candidateCookieToken(ctx.req);
        const currentTokenHash = currentToken ? hashCandidateToken(currentToken, "session") : null;
        const sessions = await db.select({ id: candidateSessions.id, deviceLabel: candidateSessions.deviceLabel, createdAt: candidateSessions.createdAt, lastSeenAt: candidateSessions.lastSeenAt, expiresAt: candidateSessions.expiresAt, tokenHash: candidateSessions.tokenHash }).from(candidateSessions).where(and4(eq5(candidateSessions.candidateId, candidate.id), isNull2(candidateSessions.revokedAt), gt2(candidateSessions.expiresAt, /* @__PURE__ */ new Date()))).orderBy(desc(candidateSessions.lastSeenAt));
        return sessions.map(({ tokenHash, ...session }) => ({ ...session, current: tokenHash === currentTokenHash }));
      }),
      revokeSession: publicProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ input, ctx }) => {
        const candidate = await requireCandidateSession(ctx.req);
        const db = databaseOrThrow(await getDb());
        const session = (await db.select().from(candidateSessions).where(and4(eq5(candidateSessions.id, input.id), eq5(candidateSessions.candidateId, candidate.id), isNull2(candidateSessions.revokedAt))).limit(1))[0];
        if (!session) throw new TRPCError3({ code: "NOT_FOUND", message: "Session introuvable." });
        await db.update(candidateSessions).set({ revokedAt: /* @__PURE__ */ new Date() }).where(eq5(candidateSessions.id, session.id));
        const currentToken = candidateCookieToken(ctx.req);
        if (currentToken && session.tokenHash === hashCandidateToken(currentToken, "session")) ctx.res.clearCookie(CANDIDATE_SESSION_COOKIE, { ...candidateSessionCookieOptions(getRequestProtocol(ctx.req)), maxAge: -1 });
        await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_session_revoked", outcome: "allowed", ipHash: requestIpHash(ctx.req.headers) });
        return { success: true };
      }),
      revokeAllSessions: publicProcedure.mutation(async ({ ctx }) => {
        const candidate = await requireCandidateSession(ctx.req);
        const db = databaseOrThrow(await getDb());
        await db.update(candidateSessions).set({ revokedAt: /* @__PURE__ */ new Date() }).where(and4(eq5(candidateSessions.candidateId, candidate.id), isNull2(candidateSessions.revokedAt)));
        ctx.res.clearCookie(CANDIDATE_SESSION_COOKIE, { ...candidateSessionCookieOptions(getRequestProtocol(ctx.req)), maxAge: -1 });
        await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_sessions_revoked_all", outcome: "allowed", ipHash: requestIpHash(ctx.req.headers) });
        return { success: true };
      }),
      documents: publicProcedure.query(async ({ ctx }) => {
        const candidate = await requireCandidateSession(ctx.req);
        const db = databaseOrThrow(await getDb());
        const documents = await db.select({
          id: candidateDocuments.id,
          category: candidateDocuments.category,
          categoryOtherLabel: candidateDocuments.categoryOtherLabel,
          originalName: candidateDocuments.originalName,
          mimeType: candidateDocuments.mimeType,
          sizeBytes: candidateDocuments.sizeBytes,
          validationStatus: candidateDocuments.validationStatus,
          status: candidateDocuments.status,
          aiSummary: candidateDocuments.aiSummary,
          aiConfidence: candidateDocuments.aiConfidence,
          aiFlags: candidateDocuments.aiFlags,
          analysisStatus: candidateDocuments.analysisStatus,
          analyzedAt: candidateDocuments.analyzedAt,
          reviewNotes: candidateDocuments.reviewNotes,
          createdAt: candidateDocuments.createdAt
        }).from(candidateDocuments).where(eq5(candidateDocuments.candidateId, candidate.id)).orderBy(desc(candidateDocuments.createdAt));
        return documents;
      }),
      documentDownload: publicProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ input, ctx }) => {
        const candidate = await requireCandidateSession(ctx.req);
        const db = databaseOrThrow(await getDb());
        const document = (await db.select().from(candidateDocuments).where(and4(eq5(candidateDocuments.id, input.id), eq5(candidateDocuments.candidateId, candidate.id))).limit(1))[0];
        if (!document) throw new TRPCError3({ code: "NOT_FOUND", message: "Document introuvable." });
        await logCandidateAudit({ candidateId: candidate.id, documentId: document.id, action: "download" });
        return { url: await storageGetSignedUrl(document.storageKey), filename: document.originalName };
      })
    });
  }
});

// server/_core/llm.ts
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens,
    maxCompletionTokens,
    max_completion_tokens
  } = params;
  const payload = {
    messages: messages.map(normalizeMessage)
  };
  if (model) {
    payload.model = model;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxCompletionTokens = max_completion_tokens ?? maxCompletionTokens;
  if (typeof resolvedMaxCompletionTokens === "number") {
    payload.max_completion_tokens = resolvedMaxCompletionTokens;
  } else {
    const resolvedMaxTokens = max_tokens ?? maxTokens;
    if (typeof resolvedMaxTokens === "number") {
      payload.max_tokens = resolvedMaxTokens;
    }
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}
var ensureArray, normalizeContentPart, normalizeMessage, normalizeToolChoice, resolveApiUrl, assertApiKey, normalizeResponseFormat, RETRY_MAX_RETRIES, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS, sleep, parseRetryAfter, computeBackoffDelay, fetchWithBackoff;
var init_llm = __esm({
  "server/_core/llm.ts"() {
    "use strict";
    init_env();
    ensureArray = (value) => Array.isArray(value) ? value : [value];
    normalizeContentPart = (part) => {
      if (typeof part === "string") {
        return { type: "text", text: part };
      }
      if (part.type === "text") {
        return part;
      }
      if (part.type === "image_url") {
        return part;
      }
      if (part.type === "file_url") {
        return part;
      }
      throw new Error("Unsupported message content part");
    };
    normalizeMessage = (message) => {
      const { role, name, tool_call_id } = message;
      if (role === "tool" || role === "function") {
        const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
        return {
          role,
          name,
          tool_call_id,
          content
        };
      }
      const contentParts = ensureArray(message.content).map(normalizeContentPart);
      if (contentParts.length === 1 && contentParts[0].type === "text") {
        return {
          role,
          name,
          content: contentParts[0].text
        };
      }
      return {
        role,
        name,
        content: contentParts
      };
    };
    normalizeToolChoice = (toolChoice, tools) => {
      if (!toolChoice) return void 0;
      if (toolChoice === "none" || toolChoice === "auto") {
        return toolChoice;
      }
      if (toolChoice === "required") {
        if (!tools || tools.length === 0) {
          throw new Error(
            "tool_choice 'required' was provided but no tools were configured"
          );
        }
        if (tools.length > 1) {
          throw new Error(
            "tool_choice 'required' needs a single tool or specify the tool name explicitly"
          );
        }
        return {
          type: "function",
          function: { name: tools[0].function.name }
        };
      }
      if ("name" in toolChoice) {
        return {
          type: "function",
          function: { name: toolChoice.name }
        };
      }
      return toolChoice;
    };
    resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
    assertApiKey = () => {
      if (!ENV.forgeApiKey) {
        throw new Error("OPENAI_API_KEY is not configured");
      }
    };
    normalizeResponseFormat = ({
      responseFormat,
      response_format,
      outputSchema,
      output_schema
    }) => {
      const explicitFormat = responseFormat || response_format;
      if (explicitFormat) {
        if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
          throw new Error(
            "responseFormat json_schema requires a defined schema object"
          );
        }
        return explicitFormat;
      }
      const schema = outputSchema || output_schema;
      if (!schema) return void 0;
      if (!schema.name || !schema.schema) {
        throw new Error("outputSchema requires both name and schema");
      }
      return {
        type: "json_schema",
        json_schema: {
          name: schema.name,
          schema: schema.schema,
          ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
        }
      };
    };
    RETRY_MAX_RETRIES = 4;
    RETRY_BASE_DELAY_MS = 500;
    RETRY_MAX_DELAY_MS = 3e4;
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    parseRetryAfter = (value) => {
      if (!value) return void 0;
      const seconds = Number(value);
      if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
      const at = Date.parse(value);
      return Number.isNaN(at) ? void 0 : Math.max(0, at - Date.now());
    };
    computeBackoffDelay = (attempt, retryAfterMs) => {
      const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
      const jittered = cap / 2 + Math.random() * (cap / 2);
      return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
    };
    fetchWithBackoff = async (url, init) => {
      let lastError;
      for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(url, init);
          if (response.ok || attempt === RETRY_MAX_RETRIES) {
            return response;
          }
          const retryAfterMs = parseRetryAfter(
            response.headers.get("retry-after")
          );
          try {
            await response.body?.cancel();
          } catch {
          }
          console.warn(
            `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
          );
          await sleep(computeBackoffDelay(attempt, retryAfterMs));
        } catch (error) {
          lastError = error;
          if (attempt === RETRY_MAX_RETRIES) throw error;
          console.warn(
            `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
          );
          await sleep(computeBackoffDelay(attempt));
        }
      }
      throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
    };
  }
});

// server/appointmentHolds.ts
var appointmentHolds_exports = {};
__export(appointmentHolds_exports, {
  APPOINTMENT_HOLD_MS: () => APPOINTMENT_HOLD_MS,
  getAppointmentHoldExpiry: () => getAppointmentHoldExpiry,
  getExpiredAppointmentHoldUpdate: () => getExpiredAppointmentHoldUpdate,
  releaseExpiredAppointmentHolds: () => releaseExpiredAppointmentHolds
});
import { and as and6, eq as eq7, lte as lte2 } from "drizzle-orm";
function getAppointmentHoldExpiry(now = /* @__PURE__ */ new Date()) {
  return new Date(now.getTime() + APPOINTMENT_HOLD_MS);
}
function getExpiredAppointmentHoldUpdate(cancelledAt = /* @__PURE__ */ new Date()) {
  return {
    appointmentStatus: "cancelled",
    slotKey: null,
    holdExpiresAt: null,
    cancelledAt
  };
}
async function releaseExpiredAppointmentHolds(now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) throw new Error("appointment_hold_database_unavailable");
  const result = await db.update(appointments).set(getExpiredAppointmentHoldUpdate(now)).where(and6(
    eq7(appointments.paymentStatus, "pending"),
    eq7(appointments.appointmentStatus, "held"),
    lte2(appointments.holdExpiresAt, now)
  ));
  return { released: Number(result.rowCount ?? 0) };
}
var APPOINTMENT_HOLD_MS;
var init_appointmentHolds = __esm({
  "server/appointmentHolds.ts"() {
    "use strict";
    init_schema();
    init_db();
    APPOINTMENT_HOLD_MS = 30 * 60 * 1e3;
  }
});

// server/recruitmentAnalysis.ts
import { eq as eq8 } from "drizzle-orm";
function messageContentToString(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
    return "";
  }).join("\n");
}
function getFirstChoiceContent(response) {
  if (!response || typeof response !== "object") return void 0;
  const choices = response.choices;
  if (!Array.isArray(choices) || choices.length === 0) return void 0;
  const first = choices[0];
  if (!first || typeof first !== "object") return void 0;
  const message = first.message;
  if (!message || typeof message !== "object") return void 0;
  return message.content;
}
async function extractPdfWithVision(buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const screenshots = await parser.getScreenshot({ first: 3, desiredWidth: 1400, imageDataUrl: true, imageBuffer: false });
    const pages = screenshots.pages.filter((page) => page.dataUrl).map((page) => ({ type: "image_url", image_url: { url: page.dataUrl, detail: "high" } }));
    if (pages.length === 0) return { text: "", confidence: null, warnings: ["vision_ocr_no_rendered_pages"] };
    const response = await invokeLLM({
      model: "gemini-3-flash-preview",
      max_tokens: 8e3,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Transcris uniquement le texte professionnel visible sur ces pages de CV. Ne d\xE9duis aucune information et n\u2019analyse aucune caract\xE9ristique prot\xE9g\xE9e. Si un passage est illisible, \xE9cris [illisible]. Retourne uniquement le JSON demand\xE9." },
          ...pages
        ]
      }],
      response_format: { type: "json_schema", json_schema: visionOcrSchema }
    });
    const raw = messageContentToString(getFirstChoiceContent(response));
    if (!raw) return { text: "", confidence: null, warnings: ["vision_ocr_empty_response"] };
    const parsed = JSON.parse(raw);
    return {
      text: typeof parsed.text === "string" ? cleanText(parsed.text) : "",
      confidence: typeof parsed.confidence === "number" && Number.isInteger(parsed.confidence) ? parsed.confidence : null,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((warning) => typeof warning === "string") : []
    };
  } finally {
    await parser.destroy();
  }
}
async function extractCvDocument(buffer, mimeType) {
  if (mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    let extracted = "";
    let totalPages = null;
    try {
      const result = await parser.getText();
      extracted = cleanText(result.text);
      const info = await parser.getInfo();
      totalPages = Number.isInteger(info.total) ? info.total : null;
    } finally {
      await parser.destroy();
    }
    if (extracted.length >= 80) return { text: extracted, method: "pdf_text", totalPages, ocrConfidence: null, ocrModelVersion: null, warnings: [] };
    const vision = await extractPdfWithVision(buffer);
    return {
      text: cleanText([extracted, vision.text].filter(Boolean).join("\n\n")),
      method: "pdf_vision",
      totalPages,
      ocrConfidence: vision.confidence,
      ocrModelVersion: "gemini-3-flash-preview",
      warnings: ["vision_ocr_fallback", ...vision.warnings]
    };
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ buffer });
    return { text: cleanText(result.value), method: "docx", totalPages: null, ocrConfidence: null, ocrModelVersion: null, warnings: result.messages.map((message) => `${message.type}:${message.message}`) };
  }
  if (mimeType === "application/msword") {
    const WordExtractor = (await import("word-extractor")).default;
    const document = await new WordExtractor().extract(buffer);
    return { text: cleanText(document.getBody()), method: "doc", totalPages: null, ocrConfidence: null, ocrModelVersion: null, warnings: ["legacy_doc_format_limited_extraction"] };
  }
  throw new Error("Format de CV non pris en charge pour l\u2019analyse automatique.");
}
function parseAnalysis(content) {
  const raw = messageContentToString(content);
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed.summary !== "string" || !Array.isArray(parsed.specialties) || !Array.isArray(parsed.skills) || !Array.isArray(parsed.languages) || !Array.isArray(parsed.normalizedLanguages) || !Array.isArray(parsed.certifications) || !Array.isArray(parsed.strengths) || !Array.isArray(parsed.gaps) || !Array.isArray(parsed.dataQualityWarnings) || !Array.isArray(parsed.normalizedExperiences) || !Number.isInteger(parsed.relevanceScore) || parsed.relevanceScore < 0 || parsed.relevanceScore > 100) {
    throw new Error("Le r\xE9sultat d\u2019analyse IA ne respecte pas le format attendu.");
  }
  return parsed;
}
async function analyzeCvText(input) {
  const cvText = cleanText(input.extractedText).slice(0, 6e4);
  if (cvText.length < 80) throw new Error("Le texte extrait du CV est insuffisant pour une analyse fiable.");
  const messages = [
    {
      role: "system",
      content: "Tu es un assistant de pr\xE9s\xE9lection pour Hippocampus Consulting. Tu analyses uniquement les informations professionnelles explicitement pr\xE9sentes dans le CV. Tu ne dois jamais d\xE9duire, classer ou recommander un candidat selon son \xE2ge, son sexe, son genre, son origine, sa nationalit\xE9, sa religion, son \xE9tat de sant\xE9, son handicap, sa situation familiale, sa photo ou toute autre caract\xE9ristique prot\xE9g\xE9e. Tu ne prends aucune d\xE9cision automatique d\u2019embauche ou de rejet. Tu produis une synth\xE8se v\xE9rifiable, neutre et explicable pour une revue humaine. Si une information manque, indique-le au lieu de l\u2019inventer. R\xE9ponds uniquement avec le JSON demand\xE9."
    },
    {
      role: "user",
      content: `Analyse ce CV pour une recherche internationale de professionnels de sant\xE9.

Donn\xE9es d\xE9clar\xE9es par le candidat :
- Nom : ${input.firstName} ${input.lastName}
- Sp\xE9cialit\xE9 d\xE9clar\xE9e : ${input.specialty}
- Pays cibl\xE9s : ${input.targetCountries.join(", ")}
- Langues d\xE9clar\xE9es : ${input.languages.join(", ") || "non renseign\xE9es"}
- Exp\xE9rience d\xE9clar\xE9e : ${input.yearsExperience ?? "non renseign\xE9e"} ans
- Message : ${input.message || "aucun"}

Texte extrait du CV :
---
${cvText}
---

Normalise chaque exp\xE9rience dans normalizedExperiences. Convertis les dates explicites vers YYYY-MM lorsque possible, utilise null si absente, et distingue permanent, temporary, locum (remplacement), internship (stage), fellowship, rotation et volunteer. Normalise aussi les certifications explicitement list\xE9es dans certifications : conserve le nom, l\u2019organisme, le pays, la date d\u2019expiration quand elle est explicitement indiqu\xE9e et la preuve textuelle ; n\u2019invente jamais une certification. Dans normalizedLanguages, donne la langue, un niveau contr\xF4l\xE9 seulement s\u2019il est explicitement attest\xE9 (sinon unknown) et une preuve textuelle. Ne transforme jamais une date, une dur\xE9e ou un niveau incertain en fait : ajoute une dataQualityWarning et cite la preuve textuelle dans evidence. Le score doit mesurer uniquement la pertinence professionnelle apparente au regard de la sp\xE9cialit\xE9, des comp\xE9tences, de l\u2019exp\xE9rience explicitement d\xE9crite et des pays cibl\xE9s. Il ne constitue pas une d\xE9cision de recrutement.`
    }
  ];
  const providers = [
    {
      model: "gpt-5-mini",
      maxCompletionTokens: 4e3,
      reasoning: { effort: "low" }
    },
    {
      model: "gemini-3-flash-preview",
      max_tokens: 8e3,
      reasoning_effort: "low"
    }
  ];
  const failures = [];
  for (const provider of providers) {
    try {
      const response = await invokeLLM({
        ...provider,
        messages,
        response_format: { type: "json_schema", json_schema: analysisSchema }
      });
      const content = getFirstChoiceContent(response);
      if (content) return { result: parseAnalysis(content), model: provider.model };
      failures.push(`${provider.model}: contenu vide`);
    } catch (error) {
      failures.push(`${provider.model}: ${error instanceof Error ? error.message.slice(0, 160) : "erreur inconnue"}`);
    }
  }
  throw new Error(`L\u2019analyse IA n\u2019a renvoy\xE9 aucun contenu exploitable (${failures.join(" | ")}).`);
}
async function saveCvAnalysis(applicationId, analysis) {
  const db = await getDb();
  if (!db) throw new Error("Base de donn\xE9es indisponible.");
  await db.update(cvApplications).set({
    aiSummary: analysis.summary,
    aiScore: analysis.relevanceScore,
    aiStrengths: JSON.stringify(analysis.strengths),
    aiWeaknesses: JSON.stringify([
      ...analysis.gaps,
      ...analysis.dataQualityWarnings.map((warning) => `Qualit\xE9 des donn\xE9es : ${warning}`)
    ]),
    aiExtractedSkills: JSON.stringify({
      professionalTitle: analysis.professionalTitle,
      specialties: analysis.specialties,
      skills: analysis.skills,
      languages: analysis.languages,
      normalizedLanguages: analysis.normalizedLanguages,
      countriesOfInterest: analysis.countriesOfInterest,
      yearsExperience: analysis.yearsExperience,
      normalizedExperiences: analysis.normalizedExperiences,
      certifications: analysis.certifications
    }),
    normalizedCertifications: JSON.stringify(analysis.certifications),
    normalizedLanguages: JSON.stringify(analysis.normalizedLanguages),
    normalizedExperiences: JSON.stringify(analysis.normalizedExperiences),
    aiMatchReasoning: analysis.reasoning,
    aiAnalyzedAt: /* @__PURE__ */ new Date()
  }).where(eq8(cvApplications.id, applicationId));
  await db.delete(cvCandidateCertifications).where(eq8(cvCandidateCertifications.applicationId, applicationId));
  await db.delete(cvCandidateLanguages).where(eq8(cvCandidateLanguages.applicationId, applicationId));
  await db.delete(cvCandidateExperiences).where(eq8(cvCandidateExperiences.applicationId, applicationId));
  if (analysis.certifications.length > 0) {
    await db.insert(cvCandidateCertifications).values(analysis.certifications.map((certification) => ({
      applicationId,
      name: certification.name.slice(0, 180),
      issuingBody: certification.issuingBody?.slice(0, 180) ?? null,
      country: certification.country?.slice(0, 100) ?? null,
      expiresAt: certification.expiresAt?.slice(0, 10) ?? null,
      evidence: certification.evidence || null,
      source: "extracted"
    })));
  }
  if (analysis.normalizedLanguages.length > 0) {
    await db.insert(cvCandidateLanguages).values(analysis.normalizedLanguages.map((language) => ({
      applicationId,
      language: language.language.slice(0, 80),
      proficiency: language.proficiency,
      evidence: language.evidence || null,
      source: "extracted"
    })));
  }
  if (analysis.normalizedExperiences.length > 0) {
    await db.insert(cvCandidateExperiences).values(analysis.normalizedExperiences.map((experience) => ({
      applicationId,
      role: experience.role.slice(0, 180),
      organization: experience.organization.slice(0, 180),
      startDate: experience.startDate?.slice(0, 10) ?? null,
      endDate: experience.endDate?.slice(0, 10) ?? null,
      employmentType: experience.employmentType,
      specialty: experience.specialty.slice(0, 160),
      country: experience.country?.slice(0, 100) ?? null,
      durationMonths: experience.durationMonths,
      evidence: experience.evidence || null
    })));
  }
}
var experienceSchema, certificationSchema, languageSchema, analysisSchema, visionOcrSchema, cleanText;
var init_recruitmentAnalysis = __esm({
  "server/recruitmentAnalysis.ts"() {
    "use strict";
    init_schema();
    init_db();
    init_llm();
    experienceSchema = {
      type: "object",
      properties: {
        role: { type: "string" },
        organization: { type: "string" },
        startDate: { anyOf: [{ type: "string" }, { type: "null" }] },
        endDate: { anyOf: [{ type: "string" }, { type: "null" }] },
        employmentType: { type: "string", enum: ["permanent", "temporary", "locum", "internship", "fellowship", "rotation", "volunteer", "unknown"] },
        specialty: { type: "string" },
        country: { anyOf: [{ type: "string" }, { type: "null" }] },
        durationMonths: { anyOf: [{ type: "integer", minimum: 0, maximum: 840 }, { type: "null" }] },
        evidence: { type: "string" }
      },
      required: ["role", "organization", "startDate", "endDate", "employmentType", "specialty", "country", "durationMonths", "evidence"],
      additionalProperties: false
    };
    certificationSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        issuingBody: { anyOf: [{ type: "string" }, { type: "null" }] },
        country: { anyOf: [{ type: "string" }, { type: "null" }] },
        expiresAt: { anyOf: [{ type: "string" }, { type: "null" }] },
        evidence: { type: "string" }
      },
      required: ["name", "issuingBody", "country", "expiresAt", "evidence"],
      additionalProperties: false
    };
    languageSchema = {
      type: "object",
      properties: {
        language: { type: "string" },
        proficiency: { type: "string", enum: ["basic", "working", "professional", "fluent", "native", "unknown"] },
        evidence: { type: "string" }
      },
      required: ["language", "proficiency", "evidence"],
      additionalProperties: false
    };
    analysisSchema = {
      name: "healthcare_candidate_analysis",
      strict: true,
      schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          professionalTitle: { type: "string" },
          specialties: { type: "array", items: { type: "string" } },
          skills: { type: "array", items: { type: "string" } },
          languages: { type: "array", items: { type: "string" } },
          normalizedLanguages: { type: "array", items: languageSchema },
          certifications: { type: "array", items: certificationSchema },
          countriesOfInterest: { type: "array", items: { type: "string" } },
          yearsExperience: { anyOf: [{ type: "integer", minimum: 0, maximum: 70 }, { type: "null" }] },
          normalizedExperiences: { type: "array", items: experienceSchema },
          relevanceScore: { type: "integer", minimum: 0, maximum: 100 },
          strengths: { type: "array", items: { type: "string" } },
          gaps: { type: "array", items: { type: "string" } },
          dataQualityWarnings: { type: "array", items: { type: "string" } },
          reasoning: { type: "string" }
        },
        required: [
          "summary",
          "professionalTitle",
          "specialties",
          "skills",
          "languages",
          "normalizedLanguages",
          "certifications",
          "countriesOfInterest",
          "yearsExperience",
          "normalizedExperiences",
          "relevanceScore",
          "strengths",
          "gaps",
          "dataQualityWarnings",
          "reasoning"
        ],
        additionalProperties: false
      }
    };
    visionOcrSchema = {
      name: "cv_ocr_transcription",
      strict: true,
      schema: {
        type: "object",
        properties: {
          text: { type: "string" },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          warnings: { type: "array", items: { type: "string" } }
        },
        required: ["text", "confidence", "warnings"],
        additionalProperties: false
      }
    };
    cleanText = (value) => value.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }
});

// server/recruitmentFileValidation.ts
import { createHash as createHash4 } from "node:crypto";
function matchesSignature(buffer, mimeType) {
  if (mimeType === "application/pdf") return buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
  if (mimeType === "application/msword") return buffer.subarray(0, OLE_SIGNATURE.length).equals(OLE_SIGNATURE);
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return buffer.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE);
  return false;
}
function validatePdfSafety(buffer) {
  const source = buffer.toString("latin1");
  if (/\/Encrypt\b/.test(source)) throw new Error("cv_validation_pdf_encrypted");
  if (/(?:\/JavaScript\b|\/JS\b|\/Launch\b|\/OpenAction\b|\/EmbeddedFile\b)/.test(source)) {
    throw new Error("cv_validation_pdf_active_content");
  }
  const pageCount = (source.match(/\/Type\s*\/Page\b/g) ?? []).length;
  if (pageCount === 0) throw new Error("cv_validation_pdf_page_structure_invalid");
  if (pageCount > MAX_PDF_PAGES) throw new Error("cv_validation_pdf_page_limit_exceeded");
  return pageCount;
}
function validateDocxSafety(buffer) {
  const archiveText = buffer.toString("latin1", 0, Math.min(buffer.length, 256 * 1024));
  if (!archiveText.includes("[Content_Types].xml")) throw new Error("cv_validation_docx_container_invalid");
  if (/(?:vbaProject\.bin|TargetMode="External"|word\/embeddings\/)/i.test(archiveText)) {
    throw new Error("cv_validation_docx_active_content");
  }
}
function validateCvFile(input) {
  const extension = input.originalName.toLowerCase().split(".").pop();
  const expectedExtension = input.mimeType === "application/pdf" ? "pdf" : input.mimeType === "application/msword" ? "doc" : "docx";
  if (!allowedMimeTypes.has(input.mimeType) || extension !== expectedExtension) {
    throw new Error("cv_validation_type_mismatch");
  }
  if (input.size < 256 || input.buffer.length !== input.size) {
    throw new Error("cv_validation_size_invalid");
  }
  if (!matchesSignature(input.buffer, input.mimeType)) {
    throw new Error("cv_validation_signature_invalid");
  }
  const pageCount = input.mimeType === "application/pdf" ? validatePdfSafety(input.buffer) : null;
  if (input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") validateDocxSafety(input.buffer);
  const warnings = input.mimeType === "application/msword" ? ["legacy_doc_format_limited_security_inspection"] : [];
  return {
    checksum: createHash4("sha256").update(input.buffer).digest("hex"),
    notes: [
      "signature_verified",
      `mime=${input.mimeType}`,
      `bytes=${input.size}`,
      `security_scan=${SECURITY_SCAN_VERSION}`,
      pageCount !== null ? `pages=${pageCount}` : null,
      ...warnings
    ].filter(Boolean).join("; "),
    mimeType: input.mimeType,
    pageCount,
    securityScanVersion: SECURITY_SCAN_VERSION,
    warnings
  };
}
var PDF_SIGNATURE, OLE_SIGNATURE, ZIP_SIGNATURE, MAX_PDF_PAGES, SECURITY_SCAN_VERSION, allowedMimeTypes;
var init_recruitmentFileValidation = __esm({
  "server/recruitmentFileValidation.ts"() {
    "use strict";
    PDF_SIGNATURE = Buffer.from("%PDF-");
    OLE_SIGNATURE = Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]);
    ZIP_SIGNATURE = Buffer.from([80, 75, 3, 4]);
    MAX_PDF_PAGES = 25;
    SECURITY_SCAN_VERSION = "document-safety-v2";
    allowedMimeTypes = /* @__PURE__ */ new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]);
  }
});

// server/recruitmentProcessing.ts
var recruitmentProcessing_exports = {};
__export(recruitmentProcessing_exports, {
  analysisCompletionStatus: () => analysisCompletionStatus,
  didClaimProcessingJob: () => didClaimProcessingJob,
  enqueueCvAnalysis: () => enqueueCvAnalysis,
  executeCvExternalPipeline: () => executeCvExternalPipeline,
  extractionMethodFor: () => extractionMethodFor,
  processDueCvAnalysisJobs: () => processDueCvAnalysisJobs,
  retryDelayMs: () => retryDelayMs
});
import { and as and7, eq as eq9, inArray as inArray2, lte as lte3 } from "drizzle-orm";
async function executeCvExternalPipeline(input, steps = defaultCvPipelineSteps) {
  const buffer = await steps.download(input.cvFileKey);
  const validation = steps.validate({
    buffer,
    mimeType: input.cvMimeType,
    originalName: input.cvOriginalName,
    size: input.cvSizeBytes
  });
  if (input.fileChecksum && input.fileChecksum !== validation.checksum) {
    throw new Error("cv_validation_checksum_mismatch");
  }
  const promotedStorage = input.fileValidationStatus === "quarantined" ? await steps.promote(`recruitment/cv/${input.trackingId}-${input.cvOriginalName}`, buffer, input.cvMimeType) : null;
  const extraction = await steps.extract(buffer, input.cvMimeType);
  const analysisExecution = await steps.analyze({
    firstName: input.firstName,
    lastName: input.lastName,
    specialty: input.specialty,
    targetCountries: JSON.parse(input.targetCountries || "[]"),
    languages: JSON.parse(input.languages || "[]"),
    yearsExperience: input.yearsExperience ?? void 0,
    message: input.message ?? void 0,
    extractedText: extraction.text
  });
  return { validation, promotedStorage, extraction, analysis: analysisExecution.result, analysisModel: analysisExecution.model };
}
function retryDelayMs(attempt) {
  return Math.min(60 * 60 * 1e3, 6e4 * 2 ** Math.max(0, attempt - 1));
}
function didClaimProcessingJob(result) {
  const header = Array.isArray(result) ? result[0] : result;
  if (!header || typeof header !== "object" || !("affectedRows" in header)) return false;
  return typeof header.affectedRows === "number" && header.affectedRows === 1;
}
function extractionMethodFor(mimeType) {
  if (mimeType === "application/pdf") return "pdf_text_or_vision";
  if (mimeType === "application/msword") return "doc";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return "unknown";
}
function analysisCompletionStatus(input) {
  return input.dataQualityWarnings.length > 0 || input.gaps.length > 0 ? "needs_review" : "completed";
}
async function enqueueCvAnalysis(applicationId, requestedAt = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.insert(cvProcessingJobs).values({
    applicationId,
    jobType: "analyze_cv",
    status: "queued",
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS2,
    scheduledFor: requestedAt
  });
  await db.update(cvApplications).set({
    analysisStatus: "queued",
    analysisLastError: null,
    analysisRequestedAt: requestedAt,
    updatedAt: requestedAt
  }).where(eq9(cvApplications.id, applicationId));
}
async function processCvAnalysisJob(jobId) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [job] = await db.select().from(cvProcessingJobs).where(eq9(cvProcessingJobs.id, jobId)).limit(1);
  if (!job || job.status !== "running") return { skipped: true, reason: "not_claimed" };
  const [application] = await db.select().from(cvApplications).where(eq9(cvApplications.id, job.applicationId)).limit(1);
  if (!application) {
    await db.update(cvProcessingJobs).set({ status: "completed", finishedAt: /* @__PURE__ */ new Date(), lastError: "application_missing" }).where(eq9(cvProcessingJobs.id, job.id));
    return { skipped: true, reason: "application_missing" };
  }
  try {
    if (application.fileValidationStatus === "rejected" || application.fileValidationStatus === "validation_failed") {
      throw new Error("cv_validation_previously_failed");
    }
    await db.update(cvApplications).set({ analysisStatus: "extracting", updatedAt: /* @__PURE__ */ new Date() }).where(eq9(cvApplications.id, application.id));
    const pipeline = await executeCvExternalPipeline(application);
    if (pipeline.promotedStorage) {
      await db.update(cvApplications).set({
        cvFileKey: pipeline.promotedStorage.key,
        fileValidationStatus: "accepted",
        fileChecksum: pipeline.validation.checksum,
        fileValidationNotes: `${pipeline.validation.notes}; promoted_from_quarantine`,
        fileValidatedAt: /* @__PURE__ */ new Date(),
        fileSecurityScanVersion: pipeline.validation.securityScanVersion,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq9(cvApplications.id, application.id));
    }
    await db.update(cvApplications).set({
      analysisStatus: "analyzing",
      extractedText: pipeline.extraction.text,
      extractionMethod: pipeline.extraction.method,
      extractionPageCount: pipeline.extraction.totalPages,
      extractionTotalPages: pipeline.extraction.totalPages,
      ocrConfidence: pipeline.extraction.ocrConfidence,
      ocrModelVersion: pipeline.extraction.ocrModelVersion,
      extractionWarnings: JSON.stringify([...pipeline.validation.warnings, ...pipeline.extraction.warnings]),
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq9(cvApplications.id, application.id));
    const analysis = pipeline.analysis;
    await saveCvAnalysis(application.id, analysis);
    const now = /* @__PURE__ */ new Date();
    const completionStatus = analysisCompletionStatus(analysis);
    await db.update(cvApplications).set({
      analysisStatus: completionStatus,
      analysisAttempts: job.attempts,
      analysisLastError: null,
      analysisModel: pipeline.analysisModel,
      analysisPromptVersion: ANALYSIS_PROMPT_VERSION,
      updatedAt: now
    }).where(eq9(cvApplications.id, application.id));
    await db.update(cvProcessingJobs).set({ status: "completed", finishedAt: now, lastError: null }).where(eq9(cvProcessingJobs.id, job.id));
    return { completed: true, applicationId: application.id, score: analysis.relevanceScore, needsReview: completionStatus === "needs_review" };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 4e3) : "unknown_processing_error";
    const now = /* @__PURE__ */ new Date();
    const validationFailure = message.startsWith("cv_validation_");
    const finalFailure = validationFailure || job.attempts >= job.maxAttempts;
    await db.update(cvProcessingJobs).set({
      status: finalFailure ? "failed" : "retry",
      lastError: message,
      scheduledFor: new Date(now.getTime() + retryDelayMs(job.attempts)),
      finishedAt: finalFailure ? now : null
    }).where(eq9(cvProcessingJobs.id, job.id));
    await db.update(cvApplications).set({
      analysisStatus: finalFailure ? "failed" : "queued",
      analysisAttempts: job.attempts,
      analysisLastError: message,
      ...validationFailure ? { fileValidationStatus: "validation_failed", fileValidationNotes: message, fileValidatedAt: now } : {},
      updatedAt: now
    }).where(eq9(cvApplications.id, job.applicationId));
    return { completed: false, applicationId: job.applicationId, retry: !finalFailure, error: message };
  }
}
async function processDueCvAnalysisJobs(limit = PROCESSING_BATCH_SIZE) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = /* @__PURE__ */ new Date();
  const candidates = await db.select().from(cvProcessingJobs).where(and7(
    inArray2(cvProcessingJobs.status, ["queued", "retry"]),
    lte3(cvProcessingJobs.scheduledFor, now)
  )).orderBy(cvProcessingJobs.scheduledFor).limit(Math.min(Math.max(limit, 1), PROCESSING_BATCH_SIZE));
  const results = [];
  for (const candidate of candidates) {
    const startedAt = /* @__PURE__ */ new Date();
    const claimResult = await db.update(cvProcessingJobs).set({
      status: "running",
      attempts: candidate.attempts + 1,
      startedAt,
      finishedAt: null
    }).where(and7(
      eq9(cvProcessingJobs.id, candidate.id),
      inArray2(cvProcessingJobs.status, ["queued", "retry"])
    ));
    if (!didClaimProcessingJob(claimResult)) continue;
    results.push(await processCvAnalysisJob(candidate.id));
  }
  return { processed: results.length, results };
}
var MAX_ATTEMPTS2, PROCESSING_BATCH_SIZE, ANALYSIS_PROMPT_VERSION, defaultCvPipelineSteps;
var init_recruitmentProcessing = __esm({
  "server/recruitmentProcessing.ts"() {
    "use strict";
    init_schema();
    init_db();
    init_recruitmentAnalysis();
    init_storage();
    init_recruitmentFileValidation();
    MAX_ATTEMPTS2 = 3;
    PROCESSING_BATCH_SIZE = 5;
    ANALYSIS_PROMPT_VERSION = "recruitment-v2";
    defaultCvPipelineSteps = {
      download: async (storageKey) => {
        const signedUrl = await storageGetSignedUrl(storageKey);
        const fileResponse = await fetch(signedUrl);
        if (!fileResponse.ok) throw new Error(`cv_download_failed_${fileResponse.status}`);
        return Buffer.from(await fileResponse.arrayBuffer());
      },
      promote: async (storageKey, buffer, mimeType) => storagePut(storageKey, buffer, mimeType),
      validate: validateCvFile,
      extract: extractCvDocument,
      analyze: analyzeCvText
    };
  }
});

// server/candidateDocumentAnalysis.ts
function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === "string" ? part : "text" in part ? String(part.text ?? "") : "").join("\n");
  return "";
}
function parseCandidateDocumentAnalysis(content) {
  const raw = contentText(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  if (!raw) throw new Error("candidate_document_ai_empty_response");
  const parsed = JSON.parse(raw);
  if (!parsed.summary || typeof parsed.summary !== "string" || !Number.isInteger(parsed.confidence)) throw new Error("candidate_document_ai_invalid_response");
  return {
    documentKind: typeof parsed.documentKind === "string" ? parsed.documentKind.slice(0, 160) : "Document administratif",
    summary: parsed.summary.slice(0, 1e3),
    issuingOrganization: typeof parsed.issuingOrganization === "string" ? parsed.issuingOrganization.slice(0, 180) : null,
    issueDate: typeof parsed.issueDate === "string" ? parsed.issueDate.slice(0, 20) : null,
    expiryDate: typeof parsed.expiryDate === "string" ? parsed.expiryDate.slice(0, 20) : null,
    confidence: Math.max(0, Math.min(100, Number(parsed.confidence))),
    flags: Array.isArray(parsed.flags) ? parsed.flags.filter((item) => typeof item === "string").slice(0, 12) : [],
    missingInformation: Array.isArray(parsed.missingInformation) ? parsed.missingInformation.filter((item) => typeof item === "string").slice(0, 12) : []
  };
}
function prompt(declaredCategory) {
  return `Vous analysez un document administratif d\xE9pos\xE9 par un candidat pour Hippocampus Consulting. Cat\xE9gorie d\xE9clar\xE9e : ${declaredCategory}. Votre r\xF4le est uniquement une aide \xE0 la revue humaine. N\u2019authentifiez jamais le document, ne d\xE9cidez jamais de l\u2019\xE9ligibilit\xE9 du candidat et ne d\xE9duisez aucune donn\xE9e sensible. N\u2019extrayez ni num\xE9ro complet de passeport ou d\u2019identit\xE9, ni adresse compl\xE8te, ni donn\xE9es de sant\xE9, ni date de naissance. Produisez un r\xE9sum\xE9 minimal, l\u2019\xE9metteur si lisible, les dates d\u2019\xE9mission et d\u2019expiration si clairement visibles, les informations manquantes et les points n\xE9cessitant une revue humaine. Si le document est flou ou ambigu, baissez la confiance et expliquez-le dans flags.`;
}
async function analyzeCandidateDocument(input) {
  let messages;
  if (input.mimeType === "image/jpeg" || input.mimeType === "image/png") {
    const dataUrl = `data:${input.mimeType};base64,${input.buffer.toString("base64")}`;
    messages = [{ role: "user", content: [{ type: "text", text: prompt(input.declaredCategory) }, { type: "image_url", image_url: { url: dataUrl, detail: "high" } }] }];
  } else {
    const extraction = await extractCvDocument(input.buffer, input.mimeType);
    const text2 = extraction.text.trim();
    if (text2.length < 20) throw new Error("candidate_document_text_unavailable");
    messages = [{ role: "user", content: `${prompt(input.declaredCategory)}

Contenu \xE0 examiner :
${text2.slice(0, 3e4)}` }];
  }
  const providers = input.attempt >= 3 ? ["claude-haiku-4-5", "gemini-3-flash-preview"] : input.attempt === 2 ? ["gemini-3-flash-preview", "gpt-5-mini"] : ["gpt-5-mini", "gemini-3-flash-preview"];
  const failures = [];
  for (const model of providers) {
    try {
      const response = await invokeLLM({
        model,
        max_tokens: model.startsWith("gemini") ? 3e3 : void 0,
        max_completion_tokens: model.startsWith("gpt") ? 3e3 : void 0,
        messages,
        response_format: { type: "json_schema", json_schema: documentAnalysisSchema }
      });
      const content = response.choices?.[0]?.message?.content;
      if (!contentText(content).trim()) {
        failures.push(`${model}: contenu vide`);
        continue;
      }
      return { analysis: parseCandidateDocumentAnalysis(content), model };
    } catch (error) {
      failures.push(`${model}: ${error instanceof Error ? error.message.slice(0, 160) : "erreur inconnue"}`);
    }
  }
  throw new Error(`candidate_document_ai_unavailable_${failures.join(" | ")}`);
}
var documentAnalysisSchema;
var init_candidateDocumentAnalysis = __esm({
  "server/candidateDocumentAnalysis.ts"() {
    "use strict";
    init_llm();
    init_recruitmentAnalysis();
    documentAnalysisSchema = {
      name: "candidate_administrative_document_review",
      strict: true,
      schema: {
        type: "object",
        properties: {
          documentKind: { type: "string" },
          summary: { type: "string" },
          issuingOrganization: { anyOf: [{ type: "string" }, { type: "null" }] },
          issueDate: { anyOf: [{ type: "string" }, { type: "null" }] },
          expiryDate: { anyOf: [{ type: "string" }, { type: "null" }] },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          flags: { type: "array", items: { type: "string" } },
          missingInformation: { type: "array", items: { type: "string" } }
        },
        required: ["documentKind", "summary", "issuingOrganization", "issueDate", "expiryDate", "confidence", "flags", "missingInformation"],
        additionalProperties: false
      }
    };
  }
});

// server/candidateDocumentEncryption.ts
var candidateDocumentEncryption_exports = {};
__export(candidateDocumentEncryption_exports, {
  decryptCandidateDocument: () => decryptCandidateDocument,
  encryptCandidateDocument: () => encryptCandidateDocument
});
import { createCipheriv as createCipheriv2, createDecipheriv as createDecipheriv2, randomBytes as randomBytes4 } from "node:crypto";
function encryptionKey2() {
  const encoded = process.env.CANDIDATE_DOCUMENT_ENCRYPTION_KEY;
  if (!encoded) throw new Error("candidate_document_encryption_key_missing");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("candidate_document_encryption_key_invalid");
  return key;
}
function encryptCandidateDocument(plain) {
  const iv = randomBytes4(12);
  const cipher = createCipheriv2(ALGORITHM, encryptionKey2(), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { encrypted, algorithm: ALGORITHM, iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}
function decryptCandidateDocument(encrypted, iv, authTag) {
  const decipher = createDecipheriv2(ALGORITHM, encryptionKey2(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
var ALGORITHM;
var init_candidateDocumentEncryption = __esm({
  "server/candidateDocumentEncryption.ts"() {
    "use strict";
    ALGORITHM = "aes-256-gcm";
  }
});

// server/candidateDocumentProcessing.ts
var candidateDocumentProcessing_exports = {};
__export(candidateDocumentProcessing_exports, {
  enqueueCandidateDocumentAnalysis: () => enqueueCandidateDocumentAnalysis,
  processDueCandidateDocumentAnalysisJobs: () => processDueCandidateDocumentAnalysisJobs
});
import { and as and8, asc, eq as eq10, inArray as inArray3, lte as lte4 } from "drizzle-orm";
async function enqueueCandidateDocumentAnalysis(documentId) {
  const db = await getDb();
  if (!db) throw new Error("candidate_document_database_unavailable");
  await db.insert(candidateDocumentProcessingJobs).values({ documentId, status: "queued", maxAttempts: MAX_DOCUMENT_ANALYSIS_ATTEMPTS, scheduledFor: /* @__PURE__ */ new Date() });
  await db.update(candidateDocuments).set({ status: "validating", analysisStatus: "queued" }).where(eq10(candidateDocuments.id, documentId));
  await db.insert(candidateDocumentAuditLogs).values({ candidateId: (await db.select({ candidateId: candidateDocuments.candidateId }).from(candidateDocuments).where(eq10(candidateDocuments.id, documentId)).limit(1))[0]?.candidateId ?? null, documentId, actorType: "system", action: "analysis_requested" });
}
async function privateDocumentBytes(input) {
  const url = await storageGetSignedUrl(input.storageKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`candidate_document_download_failed_${response.status}`);
  const stored = Buffer.from(await response.arrayBuffer());
  if (!input.encryptionAlgorithm) return stored;
  if (input.encryptionAlgorithm !== "aes-256-gcm" || !input.encryptionIv || !input.encryptionAuthTag) throw new Error("candidate_document_encryption_metadata_invalid");
  return decryptCandidateDocument(stored, input.encryptionIv, input.encryptionAuthTag);
}
function retryTime(attempt) {
  return new Date(Date.now() + Math.min(20, 2 ** attempt) * 60 * 1e3);
}
function humanReviewFallback(error) {
  const reason = error instanceof Error ? error.message : "analyse_indisponible";
  return {
    aiSummary: "Analyse automatique indisponible : le document est conserv\xE9 et transmis \xE0 une revue humaine. Aucune d\xE9cision automatique n\u2019a \xE9t\xE9 prise.",
    aiExtractedData: JSON.stringify({ documentKind: "\xC0 confirmer par revue humaine", summary: "Aucune extraction fiable n\u2019a \xE9t\xE9 conserv\xE9e.", issuingOrganization: null, issueDate: null, expiryDate: null, confidence: 0, flags: ["ai_analysis_unavailable", reason], missingInformation: ["Revue humaine requise"] }),
    aiConfidence: 0,
    aiFlags: JSON.stringify(["ai_analysis_unavailable", reason])
  };
}
async function processDueCandidateDocumentAnalysisJobs(limit = 1) {
  const db = await getDb();
  if (!db) throw new Error("candidate_document_database_unavailable");
  const jobs = await db.select().from(candidateDocumentProcessingJobs).where(and8(inArray3(candidateDocumentProcessingJobs.status, ["queued", "retry"]), lte4(candidateDocumentProcessingJobs.scheduledFor, /* @__PURE__ */ new Date()))).orderBy(asc(candidateDocumentProcessingJobs.scheduledFor)).limit(limit);
  let completed = 0;
  let retried = 0;
  let needsReview = 0;
  for (const job of jobs) {
    const now = /* @__PURE__ */ new Date();
    const attempts = job.attempts + 1;
    await db.update(candidateDocumentProcessingJobs).set({ status: "running", attempts, startedAt: now, lastError: null }).where(eq10(candidateDocumentProcessingJobs.id, job.id));
    const document = (await db.select().from(candidateDocuments).where(eq10(candidateDocuments.id, job.documentId)).limit(1))[0];
    if (!document || document.validationStatus === "rejected") {
      await db.update(candidateDocumentProcessingJobs).set({ status: "completed", finishedAt: /* @__PURE__ */ new Date(), lastError: "document_unavailable_or_rejected" }).where(eq10(candidateDocumentProcessingJobs.id, job.id));
      continue;
    }
    try {
      await db.update(candidateDocuments).set({ status: "analyzing", analysisStatus: "analyzing", analysisAttempts: attempts }).where(eq10(candidateDocuments.id, document.id));
      const result = await analyzeCandidateDocument({ buffer: await privateDocumentBytes(document), mimeType: document.mimeType, declaredCategory: document.categoryOtherLabel || document.category, attempt: attempts });
      await db.update(candidateDocuments).set({
        validationStatus: "accepted",
        status: "needs_review",
        analysisStatus: "completed",
        aiSummary: result.analysis.summary,
        aiExtractedData: JSON.stringify(result.analysis),
        aiConfidence: result.analysis.confidence,
        aiFlags: JSON.stringify(result.analysis.flags),
        aiModel: result.model,
        analyzedAt: /* @__PURE__ */ new Date(),
        analysisLastError: null
      }).where(eq10(candidateDocuments.id, document.id));
      await db.update(candidateDocumentProcessingJobs).set({ status: "completed", finishedAt: /* @__PURE__ */ new Date() }).where(eq10(candidateDocumentProcessingJobs.id, job.id));
      await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "system", action: "analysis_completed", metadata: JSON.stringify({ model: result.model, confidence: result.analysis.confidence }) });
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "candidate_document_analysis_failed";
      if (attempts < job.maxAttempts) {
        await db.update(candidateDocumentProcessingJobs).set({ status: "retry", scheduledFor: retryTime(attempts), lastError: message }).where(eq10(candidateDocumentProcessingJobs.id, job.id));
        await db.update(candidateDocuments).set({ status: "uploaded", analysisStatus: "queued", analysisAttempts: attempts, analysisLastError: message }).where(eq10(candidateDocuments.id, document.id));
        retried += 1;
      } else {
        const fallback = humanReviewFallback(error);
        await db.update(candidateDocuments).set({ validationStatus: "accepted", status: "needs_review", analysisStatus: "needs_review", analysisAttempts: attempts, analysisLastError: message, analyzedAt: /* @__PURE__ */ new Date(), ...fallback }).where(eq10(candidateDocuments.id, document.id));
        await db.update(candidateDocumentProcessingJobs).set({ status: "completed", finishedAt: /* @__PURE__ */ new Date(), lastError: message }).where(eq10(candidateDocumentProcessingJobs.id, job.id));
        await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "system", action: "analysis_completed", metadata: JSON.stringify({ outcome: "human_review_fallback", error: message }) });
        needsReview += 1;
      }
    }
  }
  return { processed: jobs.length, completed, retried, needsReview };
}
var MAX_DOCUMENT_ANALYSIS_ATTEMPTS;
var init_candidateDocumentProcessing = __esm({
  "server/candidateDocumentProcessing.ts"() {
    "use strict";
    init_schema();
    init_db();
    init_candidateDocumentAnalysis();
    init_storage();
    init_candidateDocumentEncryption();
    MAX_DOCUMENT_ANALYSIS_ATTEMPTS = 3;
  }
});

// server/invoice.ts
import PDFDocument from "pdfkit";
async function generateInvoicePDF(data) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: INVOICE_LAYOUT.size, margin: INVOICE_LAYOUT.margin });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", async () => {
        const buffer = Buffer.concat(chunks);
        const invoiceKey = `invoices/${data.trackingId}.pdf`;
        try {
          const result = await storagePut(invoiceKey, buffer, "application/pdf");
          resolve({ buffer, key: result.key, url: result.url });
        } catch (storageError) {
          console.error("Failed to upload invoice to S3:", storageError);
          resolve({ buffer, key: invoiceKey, url: "" });
        }
      });
      doc.on("error", reject);
      const invoiceNumber = `INV-${data.trackingId}`;
      const invoiceDate = data.paymentDate.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      doc.fontSize(8).font("Helvetica-Bold").fillColor(INVOICE_BRAND.accent).text("ABL / HIPPOCAMPUS CONSULTING", { align: "center" });
      doc.moveDown(0.35);
      doc.fontSize(24).font("Helvetica-Bold").fillColor(INVOICE_BRAND.ink).text("FACTURE", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(10).font("Helvetica");
      doc.text("Dr. Ahmed Ben Lallahom", 50, 100);
      doc.text("Hippocampus Consulting");
      doc.text("Anesth\xE9siste-R\xE9animateur");
      doc.text("France");
      doc.text("Email: contact@drahmedbenlallahom.com");
      doc.text("Site: www.drahmedbenlallahom.com");
      doc.fontSize(10).font("Helvetica-Bold");
      doc.text(`Facture N\xB0: ${invoiceNumber}`, 350, 100);
      doc.font("Helvetica");
      doc.text(`Date: ${invoiceDate}`, 350);
      doc.text(`R\xE9f. RDV: ${data.trackingId}`, 350);
      doc.strokeColor(INVOICE_BRAND.accent).moveTo(50, 200).lineTo(545, 200).stroke();
      doc.fontSize(12).font("Helvetica-Bold").text("Factur\xE9 \xE0:", 50, 220);
      doc.fontSize(10).font("Helvetica");
      doc.text(data.customerName, 50, 240);
      doc.text(data.customerEmail);
      doc.text(data.customerPhone);
      const appointmentDateStr = data.appointmentDate.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
      doc.fontSize(12).font("Helvetica-Bold").text("D\xE9tails de la prestation:", 50, 300);
      doc.moveDown(0.5);
      const tableTop = 330;
      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Description", 50, tableTop);
      doc.text("Date", 250, tableTop);
      doc.text("Dur\xE9e", 370, tableTop);
      doc.text("Montant", 470, tableTop, { align: "right" });
      doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();
      doc.fontSize(9).font("Helvetica");
      const rowY = tableTop + 25;
      doc.text("Consultation - Conseil en sant\xE9", 50, rowY);
      doc.text(appointmentDateStr, 250, rowY);
      doc.text(`${data.duration} min`, 370, rowY);
      doc.text(`${data.basePrice.toFixed(2)} \u20AC`, 470, rowY, { align: "right" });
      let currentY = rowY + 20;
      if (data.isNightRate) {
        doc.text("Majoration tarif de nuit (18h-8h) +50%", 50, currentY);
        const supplement = data.finalPrice - data.basePrice;
        doc.text(`${supplement.toFixed(2)} \u20AC`, 470, currentY, { align: "right" });
        currentY += 20;
      }
      doc.moveTo(350, currentY + 10).lineTo(545, currentY + 10).stroke();
      currentY += 20;
      doc.fontSize(11).font("Helvetica-Bold");
      doc.text("TOTAL TTC:", 350, currentY);
      doc.text(`${data.finalPrice.toFixed(2)} \u20AC`, 470, currentY, { align: "right" });
      currentY += 30;
      doc.fontSize(10).font("Helvetica");
      doc.text("Statut: PAY\xC9", 350, currentY);
      doc.text(`Mode de paiement: Carte bancaire (Stripe)`, 350, currentY + 15);
      doc.fontSize(8).font("Helvetica").fillColor(INVOICE_BRAND.muted);
      doc.text(
        "Hippocampus Consulting - Dr. Ahmed Ben Lallahom - Conseil en sant\xE9",
        50,
        INVOICE_LAYOUT.footerBrandY,
        { align: "center" }
      );
      doc.text(
        "Cette facture est g\xE9n\xE9r\xE9e automatiquement et fait foi de paiement.",
        50,
        INVOICE_LAYOUT.footerValidityY,
        { align: "center" }
      );
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
var INVOICE_LAYOUT, INVOICE_BRAND;
var init_invoice = __esm({
  "server/invoice.ts"() {
    "use strict";
    init_storage();
    INVOICE_LAYOUT = {
      size: "A4",
      margin: 50,
      footerBrandY: 750,
      footerValidityY: 762
    };
    INVOICE_BRAND = {
      accent: "#0891b2",
      ink: "#0f172a",
      muted: "#666666"
    };
  }
});

// server/appointmentFulfillment.ts
var appointmentFulfillment_exports = {};
__export(appointmentFulfillment_exports, {
  enqueueAppointmentFulfillment: () => enqueueAppointmentFulfillment,
  processDueAppointmentFulfillmentJobs: () => processDueAppointmentFulfillmentJobs
});
import { and as and10, eq as eq12, inArray as inArray5, lte as lte5 } from "drizzle-orm";
async function enqueueAppointmentFulfillment(appointmentId) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  for (const jobType of ["confirmation", "invoice"]) {
    await db.insert(appointmentFulfillmentJobs).values({
      appointmentId,
      jobType,
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      scheduledFor: /* @__PURE__ */ new Date()
    }).onConflictDoUpdate({
      target: [appointmentFulfillmentJobs.appointmentId, appointmentFulfillmentJobs.jobType],
      set: { updatedAt: /* @__PURE__ */ new Date() }
    });
  }
}
function retryAt(attempt) {
  return new Date(Date.now() + Math.min(60 * 60 * 1e3, 6e4 * 2 ** Math.max(0, attempt - 1)));
}
async function runJob(id) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [job] = await db.select().from(appointmentFulfillmentJobs).where(eq12(appointmentFulfillmentJobs.id, id)).limit(1);
  if (!job || job.status !== "running") return { skipped: true };
  const [appointment] = await db.select().from(appointments).where(eq12(appointments.id, job.appointmentId)).limit(1);
  if (!appointment || appointment.paymentStatus !== "completed") {
    await db.update(appointmentFulfillmentJobs).set({ status: "completed", finishedAt: /* @__PURE__ */ new Date(), lastError: "appointment_not_paid_or_missing" }).where(eq12(appointmentFulfillmentJobs.id, id));
    return { skipped: true };
  }
  try {
    const finalPrice = Number(appointment.finalPrice);
    if (job.jobType === "confirmation") {
      await Promise.all([
        sendConfirmationEmail(appointment.customerEmail, appointment.customerName, appointment.trackingId, appointment.appointmentDate, finalPrice, appointment.requestDetails),
        sendCustomerConfirmationSMS(appointment.customerPhone, appointment.trackingId, appointment.appointmentDate),
        sendOwnerNotificationEmail(appointment.customerName, appointment.customerEmail, appointment.customerPhone, appointment.trackingId, appointment.appointmentDate, finalPrice, appointment.requestDetails),
        sendOwnerNotificationSMS(appointment.customerName, appointment.customerPhone, appointment.trackingId, appointment.appointmentDate, finalPrice)
      ]);
      await db.update(appointments).set({ emailSent: 1, smsSent: 1 }).where(eq12(appointments.id, appointment.id));
    } else {
      const invoice = await generateInvoicePDF({
        trackingId: appointment.trackingId,
        customerName: appointment.customerName,
        customerEmail: appointment.customerEmail,
        customerPhone: appointment.customerPhone,
        appointmentDate: appointment.appointmentDate,
        consultationType: appointment.consultationType || "Conseil en sant\xE9",
        duration: appointment.duration || 30,
        basePrice: Number(appointment.basePrice),
        finalPrice,
        isNightRate: appointment.isNightRate === 1,
        paymentDate: /* @__PURE__ */ new Date()
      });
      await sendInvoiceEmail(appointment.customerEmail, appointment.customerName, appointment.trackingId, finalPrice, invoice.buffer);
    }
    await db.update(appointmentFulfillmentJobs).set({ status: "completed", finishedAt: /* @__PURE__ */ new Date(), lastError: null }).where(eq12(appointmentFulfillmentJobs.id, id));
    return { completed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 4e3) : "fulfillment_unknown_error";
    const terminal = job.attempts >= job.maxAttempts;
    await db.update(appointmentFulfillmentJobs).set({ status: terminal ? "failed" : "retry", lastError: message, scheduledFor: retryAt(job.attempts), finishedAt: terminal ? /* @__PURE__ */ new Date() : null }).where(eq12(appointmentFulfillmentJobs.id, id));
    return { completed: false, retry: !terminal };
  }
}
async function processDueAppointmentFulfillmentJobs(limit = MAX_BATCH) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const jobs = await db.select().from(appointmentFulfillmentJobs).where(and10(inArray5(appointmentFulfillmentJobs.status, ["queued", "retry"]), lte5(appointmentFulfillmentJobs.scheduledFor, /* @__PURE__ */ new Date()))).orderBy(appointmentFulfillmentJobs.scheduledFor).limit(Math.min(Math.max(1, limit), MAX_BATCH));
  const results = [];
  for (const job of jobs) {
    await db.update(appointmentFulfillmentJobs).set({ status: "running", attempts: job.attempts + 1, startedAt: /* @__PURE__ */ new Date(), finishedAt: null }).where(and10(eq12(appointmentFulfillmentJobs.id, job.id), inArray5(appointmentFulfillmentJobs.status, ["queued", "retry"])));
    results.push(await runJob(job.id));
  }
  return { processed: results.length, results };
}
var MAX_BATCH;
var init_appointmentFulfillment = __esm({
  "server/appointmentFulfillment.ts"() {
    "use strict";
    init_schema();
    init_db();
    init_notifications();
    init_invoice();
    MAX_BATCH = 5;
  }
});

// server/recruitmentRetention.ts
var recruitmentRetention_exports = {};
__export(recruitmentRetention_exports, {
  buildRetentionReviewReminder: () => buildRetentionReviewReminder,
  runRecruitmentRetentionCleanup: () => runRecruitmentRetentionCleanup
});
import { and as and11, eq as eq13, isNull as isNull4, lt as lt3 } from "drizzle-orm";
function buildRetentionReviewReminder(input) {
  return {
    fileValidationNotes: `${input.previousNotes || ""}; retention_review_notified_at=${input.at.toISOString()}`.slice(0, 4e3),
    retentionReviewNotifiedAt: input.at
  };
}
async function runRecruitmentRetentionCleanup(actorOpenId) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = /* @__PURE__ */ new Date();
  const expired = await db.select({ id: cvApplications.id, trackingId: cvApplications.trackingId, fileValidationNotes: cvApplications.fileValidationNotes }).from(cvApplications).where(and11(lt3(cvApplications.retentionUntil, now), isNull4(cvApplications.retentionReviewNotifiedAt)));
  for (const application of expired) {
    await db.update(cvApplications).set({
      ...buildRetentionReviewReminder({ previousNotes: application.fileValidationNotes, at: now }),
      updatedAt: now
    }).where(eq13(cvApplications.id, application.id));
    await logRecruitmentAction({
      applicationId: application.id,
      adminOpenId: actorOpenId,
      action: "retention_cleanup",
      metadata: { trackingId: application.trackingId, reviewNotifiedAt: now.toISOString(), storageReferenceAccessible: true, action: "non_destructive_retention_review" }
    });
  }
  if (expired.length > 0) {
    await notifyOwner({
      title: `R\xE9tention recrutement : ${expired.length} dossier(s) \xE0 examiner`,
      content: `Les candidatures suivantes ont d\xE9pass\xE9 leur dur\xE9e de conservation : ${expired.map((item) => item.trackingId).join(", ")}. Les CV et leurs r\xE9f\xE9rences de stockage ont \xE9t\xE9 conserv\xE9s ; examinez-les dans le dashboard et ne lancez une suppression qu\u2019en cas de demande RGPD explicite.`
    });
  }
  return { notified: expired.length, trackingIds: expired.map((item) => item.trackingId) };
}
var init_recruitmentRetention = __esm({
  "server/recruitmentRetention.ts"() {
    "use strict";
    init_schema();
    init_db();
    init_notification();
    init_recruitmentAudit();
  }
});

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import multer from "multer";
import { Webhook } from "svix";
import { z as z5 } from "zod";
import { createServer } from "http";

// server/_core/static.ts
import express from "express";
import fs from "fs";
import path from "path";

// server/routeSeo.ts
var ORIGIN = "https://drahmedbenlallahom.com";
var SITE_NAME = "Dr. Ahmed Ben Lallahom";
var DEFAULT_IMAGE = `${ORIGIN}/assets/abl-logo.svg`;
var PUBLIC_ROUTES = {
  "/": {
    title: "Dr. Ahmed Ben Lallahom | M\xE9decine et Conseil",
    description: "Anesth\xE9siste-r\xE9animateur, entrepreneur en sant\xE9 et consultant m\xE9dical bas\xE9 en France.",
    keywords: "anesth\xE9siste, r\xE9animateur, consultant m\xE9dical, sant\xE9, France"
  },
  "/booking": {
    title: "R\xE9server une consultation | Dr. Ben Lallahom",
    description: "R\xE9servez en ligne une consultation de conseil en sant\xE9 avec le Dr. Ahmed Ben Lallahom.",
    keywords: "r\xE9servation consultation sant\xE9, t\xE9l\xE9consultation, conseil m\xE9dical"
  },
  "/questions-anesthesie": {
    title: "Questions sant\xE9 | Anesth\xE9sie et op\xE9ration",
    description: "Posez une question g\xE9n\xE9rale sur l\u2019anesth\xE9sie ou une op\xE9ration et recevez une r\xE9ponse relue par email.",
    keywords: "questions anesth\xE9sie, information op\xE9ration, information sant\xE9, pr\xE9paration intervention"
  },
  "/recruitment": {
    title: "Recrutement sant\xE9 international | Hippocampus",
    description: "D\xE9couvrez les opportunit\xE9s internationales pour professionnels m\xE9dicaux et param\xE9dicaux.",
    keywords: "recrutement m\xE9dical international, recrutement param\xE9dical, Hippocampus Consulting"
  },
  "/recruitment/standard": {
    title: "Candidature sant\xE9 internationale | Hippocampus",
    description: "D\xE9posez votre candidature pour des opportunit\xE9s m\xE9dicales et param\xE9dicales internationales.",
    keywords: "candidature m\xE9dicale, emploi param\xE9dical, mobilit\xE9 internationale"
  },
  "/recruitment/unsubscribe": {
    title: "Pr\xE9f\xE9rences recrutement | Hippocampus Consulting",
    description: "G\xE9rez vos pr\xE9f\xE9rences de communications de recrutement.",
    noIndex: true
  },
  "/recruitment/vvip-offshore": {
    title: "Missions sant\xE9 offshore et Moyen-Orient | Hippocampus",
    description: "Postulez pour des missions m\xE9dicales sp\xE9cialis\xE9es offshore, industrielles et au Moyen-Orient.",
    keywords: "mission m\xE9dicale offshore, sant\xE9 Moyen-Orient, plateforme p\xE9troli\xE8re"
  },
  "/vvip-offshore": {
    title: "Missions sant\xE9 offshore et Moyen-Orient | Hippocampus",
    description: "Postulez pour des missions m\xE9dicales sp\xE9cialis\xE9es offshore, industrielles et au Moyen-Orient.",
    keywords: "mission m\xE9dicale offshore, sant\xE9 Moyen-Orient, plateforme p\xE9troli\xE8re"
  },
  "/employers": {
    title: "Recruter des soignants | Hippocampus Consulting",
    description: "Confiez votre besoin de recrutement m\xE9dical ou param\xE9dical international \xE0 Hippocampus Consulting.",
    keywords: "recrutement soignants, recrutement m\xE9dical, recrutement param\xE9dical"
  },
  "/why-hippocampus": {
    title: "Pourquoi Hippocampus Consulting | Employeurs",
    description: "M\xE9thode, confidentialit\xE9 et accompagnement pour vos recrutements m\xE9dicaux internationaux.",
    keywords: "cabinet recrutement m\xE9dical, m\xE9thode recrutement sant\xE9, Hippocampus Consulting"
  },
  "/testimonials": {
    title: "T\xE9moignages de partenaires | Dr. Ben Lallahom",
    description: "D\xE9couvrez les t\xE9moignages de partenaires ayant collabor\xE9 avec le Dr. Ahmed Ben Lallahom."
  },
  "/gdpr": {
    title: "Protection des donn\xE9es | Dr. Ben Lallahom",
    description: "Consultez les informations de protection des donn\xE9es personnelles et RGPD du site."
  },
  "/legal": {
    title: "Mentions l\xE9gales | Dr. Ben Lallahom",
    description: "Consultez les mentions l\xE9gales et conditions d\u2019utilisation du site Dr. Ahmed Ben Lallahom."
  },
  "/faq": {
    title: "Questions fr\xE9quentes | Dr. Ben Lallahom",
    description: "Retrouvez les informations pratiques sur la consultation, la r\xE9servation et Hippocampus Consulting."
  },
  "/search": {
    title: "Recherche | Dr. Ben Lallahom",
    description: "Recherchez les informations publiques du site.",
    noIndex: true
  },
  "/error": {
    title: "Service temporairement indisponible | Dr. Ben Lallahom",
    description: "Information de disponibilit\xE9 du service.",
    noIndex: true
  },
  "/maintenance": {
    title: "Maintenance en cours | Dr. Ben Lallahom",
    description: "Information de maintenance du service.",
    noIndex: true
  },
  "/venture/novarena": {
    title: "Novarena | Dr. Ben Lallahom",
    description: "D\xE9couvrez Novarena, initiative entrepreneuriale en sant\xE9 port\xE9e par le Dr. Ahmed Ben Lallahom."
  },
  "/venture/sawa4you": {
    title: "SAWA4YOU | Dr. Ben Lallahom",
    description: "D\xE9couvrez SAWA4YOU, initiative entrepreneuriale en sant\xE9 port\xE9e par le Dr. Ahmed Ben Lallahom."
  }
};
var PRIVATE_PREFIXES = ["/candidate/", "/admin"];
var escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
function getRouteSeo(url) {
  const pathname = new URL(url, ORIGIN).pathname.replace(/\/+$/, "") || "/";
  const known = PUBLIC_ROUTES[pathname];
  if (known) return { ...known, canonicalPath: pathname };
  if (pathname === "/booking/confirmation" || PRIVATE_PREFIXES.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix))) {
    return {
      title: `${SITE_NAME} | Espace s\xE9curis\xE9`,
      description: "Espace s\xE9curis\xE9 du site Dr. Ahmed Ben Lallahom.",
      canonicalPath: pathname,
      noIndex: true
    };
  }
  return {
    title: SITE_NAME,
    description: "Anesth\xE9siste-r\xE9animateur, entrepreneur en sant\xE9 et consultant m\xE9dical bas\xE9 en France.",
    canonicalPath: pathname,
    noIndex: true,
    notFound: true
  };
}
function renderRouteSeoHead(url) {
  const seo = getRouteSeo(url);
  const title = escapeHtml(seo.title);
  const description = escapeHtml(seo.description);
  const canonical = escapeHtml(`${ORIGIN}${seo.canonicalPath}`);
  const keywords = seo.keywords ? `<meta name="keywords" content="${escapeHtml(seo.keywords)}" />` : "";
  const robots = seo.noIndex ? "noindex, follow" : "index, follow";
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    keywords,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${DEFAULT_IMAGE}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:url" content="${canonical}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${DEFAULT_IMAGE}" />`,
    `<link rel="canonical" href="${canonical}" />`
  ].filter(Boolean).join("\n    ");
}

// server/_core/static.ts
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path.resolve(import.meta.dirname, "../..", "dist", "public") : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath, { index: false }));
  app.use("*", async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(
        path.resolve(distPath, "index.html"),
        "utf-8"
      );
      const seo = getRouteSeo(req.originalUrl);
      res.status(seo.notFound ? 404 : 200).set({ "Content-Type": "text/html" }).end(
        template.replace(
          "<!--route-seo-->",
          () => renderRouteSeoHead(req.originalUrl)
        )
      );
    } catch (error) {
      next(error);
    }
  });
}

// server/_core/index.ts
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/_core/oauth.ts
init_const();
init_db();
import { parse as parseCookieHeader2 } from "cookie";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/oauth.ts
init_sdk();
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/index.ts
init_env();

// server/googleDriveOAuthRoutes.ts
import { parse as parseCookieHeader3 } from "cookie";

// server/_core/context.ts
init_sdk();
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/googleDriveOAuthRoutes.ts
init_googleDriveExport();
var STATE_COOKIE = "__Host-google_drive_oauth_state";
function getQueryParam2(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
async function requireAdmin(req, res) {
  const context = await createContext({ req, res, info: {} });
  if (!context.user || context.user.role !== "admin") return null;
  return context.user;
}
function registerGoogleDriveOAuthRoutes(app) {
  app.get("/api/google-drive/oauth/connect", async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return res.status(403).send("Acc\xE8s administrateur requis.");
    try {
      const state = createGoogleDriveOAuthState();
      res.cookie(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 10 * 6e4 });
      return res.redirect(302, buildGoogleDriveAuthorizationUrl(state));
    } catch (error) {
      console.error("[GoogleDrive] OAuth start failed", error);
      return res.status(500).send("La connexion Google Drive n\u2019a pas pu \xEAtre d\xE9marr\xE9e.");
    }
  });
  app.get("/api/google-drive/oauth/callback", async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return res.status(403).send("Acc\xE8s administrateur requis.");
    const state = getQueryParam2(req, "state");
    const code = getQueryParam2(req, "code");
    const returnedError = getQueryParam2(req, "error");
    const expectedState = parseCookieHeader3(req.headers.cookie ?? "")[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: "/", secure: true, sameSite: "lax" });
    if (returnedError) return res.status(400).send("L\u2019autorisation Google Drive a \xE9t\xE9 refus\xE9e ou interrompue.");
    if (!code || !state || state !== expectedState || !verifyGoogleDriveOAuthState(state)) return res.status(403).send("La v\xE9rification de s\xE9curit\xE9 Google Drive a expir\xE9. Recommencez la connexion depuis l\u2019administration.");
    try {
      const tokens = await exchangeGoogleDriveAuthorizationCode(code);
      await saveGoogleDriveConnection({ authorizedByOpenId: user.openId, refreshToken: tokens.refresh_token, grantedScopes: tokens.scope });
      return res.redirect(302, "/admin?googleDrive=connected");
    } catch (error) {
      console.error("[GoogleDrive] OAuth callback failed", error);
      return res.status(500).send("La connexion Google Drive n\u2019a pas pu \xEAtre finalis\xE9e. V\xE9rifiez l\u2019URI de redirection et que l\u2019API Google Drive est activ\xE9e.");
    }
  });
}

// server/_core/storageProxy.ts
init_env();
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
init_const();
import { createHash as createHash5, randomUUID } from "node:crypto";

// server/_core/systemRouter.ts
init_notification();
init_trpc();
import { z } from "zod";
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
init_trpc();
import { TRPCError as TRPCError5 } from "@trpc/server";
import { z as z4 } from "zod";

// shared/candidateDocumentReanalysis.ts
var ACTIVE_ANALYSIS_STATES = /* @__PURE__ */ new Set(["queued", "extracting", "analyzing"]);
function canRequestCandidateDocumentReanalysis(input) {
  return input.status !== "rejected" && !ACTIVE_ANALYSIS_STATES.has(input.analysisStatus);
}

// server/routers.ts
init_db();
init_schema();
init_notification();
init_storage();

// server/recruitmentDownloadPolicy.ts
function canAdminDownloadCv(application) {
  const fileWasExplicitlyRetired = application.cvFileKey.startsWith("retired/");
  const fileWasRejected = application.fileValidationStatus === "rejected" || application.fileValidationStatus === "validation_failed";
  return !fileWasExplicitlyRetired && !fileWasRejected;
}
var CV_DOWNLOAD_UNAVAILABLE_MESSAGE = "Le document n\u2019est pas disponible car son contr\xF4le de s\xE9curit\xE9 a \xE9chou\xE9 ou il a \xE9t\xE9 supprim\xE9 \xE0 la demande de son titulaire.";

// server/routers.ts
init_notifications();
init_recruitmentAudit();
import { eq as eq11, and as and9, sql as sql2, desc as desc3, gte, inArray as inArray4, isNull as isNull3, lt as lt2, ne } from "drizzle-orm";
import Stripe from "stripe";

// server/clientBriefMatching.ts
var normalise = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").trim();
var containsTerm = (haystack, needle) => {
  const normalisedNeedle = normalise(needle);
  return normalisedNeedle.length > 1 && normalise(haystack).includes(normalisedNeedle);
};
function parseTerms(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((item) => {
        if (typeof item === "string") return [item];
        if (item && typeof item === "object") {
          const record = item;
          return [record.name, record.language].filter((item2) => typeof item2 === "string");
        }
        return [];
      });
    }
  } catch {
  }
  return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}
function specialtyMatches(candidateSpecialty, requestedSpecialty) {
  if (containsTerm(candidateSpecialty, requestedSpecialty) || containsTerm(requestedSpecialty, candidateSpecialty)) return true;
  const roots = (value) => normalise(value).split(/[^a-z]+/).filter((token) => token.length >= 5).map((token) => token.slice(0, 6));
  const candidateRoots = new Set(roots(candidateSpecialty));
  const requestedRoots = roots(requestedSpecialty);
  return requestedRoots.length > 0 && requestedRoots.every((root) => candidateRoots.has(root));
}
var matchesAny = (required, available) => required.filter(
  (requiredName) => available.some((candidateName) => containsTerm(candidateName, requiredName) || containsTerm(requiredName, candidateName))
);
function computeBriefCandidateMatch(brief, candidate) {
  const reasons = [];
  const breakdown = { specialty: 0, mobility: 0, certifications: 0, languages: 0, experience: 0, availability: 0 };
  if (specialtyMatches(candidate.specialty, brief.specialtyNeeded)) {
    breakdown.specialty = 35;
    reasons.push("sp\xE9cialit\xE9 compatible");
  }
  const countryEvidence = [...parseTerms(candidate.targetCountries), candidate.mobility || ""].join(" \xB7 ");
  if (containsTerm(countryEvidence, brief.country)) {
    breakdown.mobility = 15;
    reasons.push("mobilit\xE9 vers le pays de mission d\xE9clar\xE9e");
  }
  const requiredCertifications = parseTerms(brief.requiredCertifications);
  const availableCertifications = [
    ...candidate.certificationNames || [],
    ...parseTerms(candidate.normalizedCertifications),
    ...parseTerms(candidate.certifications)
  ];
  const matchedCertifications = matchesAny(requiredCertifications, availableCertifications);
  if (requiredCertifications.length > 0 && matchedCertifications.length > 0) {
    breakdown.certifications = Math.round(matchedCertifications.length / requiredCertifications.length * 20);
    reasons.push(`certifications correspondantes : ${matchedCertifications.join(", ")}`);
  }
  const requiredLanguages = parseTerms(brief.requiredLanguages);
  const availableLanguages = [
    ...candidate.languageNames || [],
    ...parseTerms(candidate.normalizedLanguages),
    ...parseTerms(candidate.languages)
  ];
  const matchedLanguages = matchesAny(requiredLanguages, availableLanguages);
  if (requiredLanguages.length > 0 && matchedLanguages.length > 0) {
    breakdown.languages = Math.round(matchedLanguages.length / requiredLanguages.length * 15);
    reasons.push(`langues correspondantes : ${matchedLanguages.join(", ")}`);
  }
  if (brief.minimumYearsExperience && candidate.yearsExperience !== null && candidate.yearsExperience !== void 0 && candidate.yearsExperience >= brief.minimumYearsExperience) {
    breakdown.experience = 10;
    reasons.push(`exp\xE9rience d\xE9clar\xE9e : ${candidate.yearsExperience} an(s) pour un minimum de ${brief.minimumYearsExperience}`);
  }
  if (brief.availabilityNeeded && candidate.availability && (containsTerm(candidate.availability, brief.availabilityNeeded) || containsTerm(brief.availabilityNeeded, candidate.availability))) {
    breakdown.availability = 5;
    reasons.push("disponibilit\xE9 compatible avec le besoin exprim\xE9");
  }
  const score = Object.values(breakdown).reduce((total, value) => total + value, 0);
  return { score: Math.min(score, 100), reasons, matchedCertifications, matchedLanguages, breakdown };
}

// server/routers.ts
init_candidatePortalRouter();
init_adminMfa();
init_candidateSecurity();
init_candidateAuth();
init_googleDriveExport();

// server/medicalQuestionsRouter.ts
init_schema();
init_trpc();
init_db();
init_candidateSecurity();
init_candidateTurnstile();
init_adminMfa();
import { TRPCError as TRPCError4 } from "@trpc/server";
import { and as and5, desc as desc2, eq as eq6 } from "drizzle-orm";
import { z as z3 } from "zod";

// server/medicalQuestionAssistant.ts
init_llm();
function redactContactMarkers(value) {
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email retir\xE9]").replace(/(?:\+?\d[\d .()/-]{7,}\d)/g, "[t\xE9l\xE9phone retir\xE9]");
}
async function improveMedicalAnswerDraft(adminDraft) {
  const sanitizedDraft = redactContactMarkers(adminDraft).trim();
  const result = await invokeLLM({
    model: "gpt-5-mini",
    maxCompletionTokens: 900,
    messages: [
      {
        role: "system",
        content: "Tu es un assistant de r\xE9vision r\xE9dactionnelle pour un m\xE9decin. Tu am\xE9liores uniquement la syntaxe, la clart\xE9, la structure et le ton d\u2019un brouillon d\xE9j\xE0 r\xE9dig\xE9 par le m\xE9decin. Tu ne dois ajouter aucun fait m\xE9dical, diagnostic, traitement, dosage, instruction clinique, pronostic ni conseil personnalis\xE9. Tu ne dois pas r\xE9pondre \xE0 une question m\xE9dicale : le texte source est l\u2019unique mati\xE8re. Pr\xE9serve les r\xE9serves et les rappels de consultation/urgence. R\xE9ponds uniquement avec une proposition de texte final, sans commentaire ni pr\xE9ambule."
      },
      { role: "user", content: sanitizedDraft }
    ]
  });
  const content = result.choices[0]?.message.content;
  const suggestion = typeof content === "string" ? content.trim() : "";
  if (!suggestion) throw new Error("La reformulation IA n\u2019est pas disponible.");
  return { suggestion, model: result.model || "gpt-5-mini" };
}

// server/medicalQuestionsRouter.ts
init_notifications();
var privateQuestionInput = z3.object({
  firstName: z3.string().trim().min(1).max(120),
  lastName: z3.string().trim().min(1).max(120),
  email: z3.string().trim().email().max(320),
  phone: z3.string().trim().min(5).max(50),
  question: z3.string().trim().min(30).max(3e3),
  language: z3.enum(["fr", "en", "de", "zh"]).default("fr"),
  privacyConsent: z3.literal(true),
  publicationConsent: z3.literal(true),
  urgencyAcknowledged: z3.literal(true),
  turnstileToken: z3.string().min(20).max(4096),
  website: z3.string().max(200).optional().default("")
});
var publicQuestionInput = z3.object({ limit: z3.number().int().min(1).max(50).default(12) }).optional();
var questionIdInput = z3.object({ id: z3.number().int().positive() });
function medicalQuestionTrackingId() {
  return `QMED-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}
async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Service temporairement indisponible." });
  return db;
}
async function auditQuestion(input) {
  const db = await requireDb();
  await db.insert(medicalQuestionAuditLogs).values({
    medicalQuestionId: input.questionId,
    actorOpenId: input.actorOpenId ?? null,
    action: input.action,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null
  });
}
async function requireMfa(ctx) {
  if (!await isAdminMfaVerified(ctx.req, ctx.user.openId)) throw new TRPCError4({ code: "FORBIDDEN", message: "Double authentification administrateur requise." });
}
var draftInput = z3.object({ id: z3.number().int().positive(), adminResponse: z3.string().trim().min(20).max(5e3), publicQuestion: z3.string().trim().max(1e3).optional().default(""), publicResponse: z3.string().trim().max(5e3).optional().default("") });
var medicalQuestionsRouter = router({
  submit: publicProcedure.input(privateQuestionInput).mutation(async ({ input, ctx }) => {
    if (input.website.trim()) throw new TRPCError4({ code: "BAD_REQUEST", message: "La demande n\u2019a pas pu \xEAtre trait\xE9e." });
    const ipHash = requestIpHash(ctx.req.headers);
    const ipSubject = ipHash ?? hashSecurityValue(ctx.req.ip || "unknown");
    if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
      try {
        await enforcePersistentRateLimit({
          action: "public_medical_question_submit",
          subject: `${ipSubject}:${input.email}`,
          maxAttempts: 3,
          windowMs: 24 * 60 * 60 * 1e3,
          blockMs: 24 * 60 * 60 * 1e3
        });
        await verifyCandidateTurnstile({ token: input.turnstileToken, remoteIp: ctx.req.ip });
      } catch {
        await logSecurityEvent({ actorKind: "anonymous", actorReference: input.email, category: "public_medical_question_protection", outcome: "blocked", severity: "warning", ipHash });
        throw new TRPCError4({ code: "BAD_REQUEST", message: "La v\xE9rification de s\xE9curit\xE9 doit \xEAtre renouvel\xE9e avant l\u2019envoi." });
      }
    }
    const db = await requireDb();
    const trackingId = medicalQuestionTrackingId();
    const result = await db.insert(medicalQuestions).values({
      trackingId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      question: input.question,
      language: input.language,
      privacyConsent: 1,
      publicationConsent: input.publicationConsent ? 1 : 0,
      urgencyAcknowledged: 1
    }).returning({ id: medicalQuestions.id });
    const questionId = Number(result[0].id);
    await auditQuestion({ questionId, action: "submitted", metadata: { publicationConsent: input.publicationConsent, language: input.language } });
    await logSecurityEvent({ actorKind: "anonymous", actorReference: input.email, category: "public_medical_question_submitted", outcome: "allowed", severity: "info", ipHash });
    return { trackingId };
  }),
  published: publicProcedure.input(publicQuestionInput).query(async ({ input }) => {
    const db = await requireDb();
    return db.select({
      id: medicalQuestions.id,
      question: medicalQuestions.publicQuestion,
      response: medicalQuestions.publicResponse,
      language: medicalQuestions.language,
      publishedAt: medicalQuestions.publishedAt
    }).from(medicalQuestions).where(and5(eq6(medicalQuestions.status, "published"), eq6(medicalQuestions.publicationConsent, 1))).orderBy(desc2(medicalQuestions.publishedAt)).limit(input?.limit ?? 12);
  }),
  admin: router({
    list: adminProcedure.input(z3.object({ status: z3.enum(["submitted", "drafting", "answered", "published", "rejected"]).optional(), limit: z3.number().int().min(1).max(100).default(50) }).optional()).query(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      return db.select().from(medicalQuestions).where(input?.status ? eq6(medicalQuestions.status, input.status) : void 0).orderBy(desc2(medicalQuestions.createdAt)).limit(input?.limit ?? 50);
    }),
    get: adminProcedure.input(questionIdInput).query(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      const [question] = await db.select().from(medicalQuestions).where(eq6(medicalQuestions.id, input.id)).limit(1);
      if (!question) throw new TRPCError4({ code: "NOT_FOUND", message: "Question introuvable." });
      return question;
    }),
    saveDraft: adminProcedure.input(draftInput).mutation(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      const [question] = await db.select().from(medicalQuestions).where(eq6(medicalQuestions.id, input.id)).limit(1);
      if (!question) throw new TRPCError4({ code: "NOT_FOUND", message: "Question introuvable." });
      await db.update(medicalQuestions).set({ adminResponse: input.adminResponse, publicQuestion: input.publicQuestion || null, publicResponse: input.publicResponse || null, status: "drafting", respondedByOpenId: ctx.user.openId }).where(eq6(medicalQuestions.id, input.id));
      await auditQuestion({ questionId: input.id, actorOpenId: ctx.user.openId, action: "draft_saved" });
      return { success: true };
    }),
    improveDraft: adminProcedure.input(z3.object({ adminResponse: z3.string().trim().min(20).max(5e3) })).mutation(async ({ input, ctx }) => {
      await requireMfa(ctx);
      try {
        const result = await improveMedicalAnswerDraft(input.adminResponse);
        return result;
      } catch {
        throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "La proposition de reformulation est temporairement indisponible." });
      }
    }),
    sendValidatedResponse: adminProcedure.input(draftInput.extend({ publish: z3.boolean().default(false) })).mutation(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      const [question] = await db.select().from(medicalQuestions).where(eq6(medicalQuestions.id, input.id)).limit(1);
      if (!question) throw new TRPCError4({ code: "NOT_FOUND", message: "Question introuvable." });
      if (input.publish && question.publicationConsent !== 1) throw new TRPCError4({ code: "BAD_REQUEST", message: "La publication exige l\u2019accord explicite de la personne." });
      if (input.publish && (!input.publicQuestion || !input.publicResponse)) throw new TRPCError4({ code: "BAD_REQUEST", message: "Une question et une r\xE9ponse anonymis\xE9es sont requises pour publier." });
      try {
        await sendMedicalQuestionResponseEmail({ email: question.email, firstName: question.firstName, trackingId: question.trackingId, response: input.adminResponse });
      } catch {
        throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "L\u2019email n\u2019a pas pu \xEAtre envoy\xE9. La r\xE9ponse n\u2019a pas \xE9t\xE9 publi\xE9e." });
      }
      const now = /* @__PURE__ */ new Date();
      await db.update(medicalQuestions).set({ adminResponse: input.adminResponse, publicQuestion: input.publish ? input.publicQuestion : null, publicResponse: input.publish ? input.publicResponse : null, status: input.publish ? "published" : "answered", respondedByOpenId: ctx.user.openId, responseSentAt: now, publishedAt: input.publish ? now : null }).where(eq6(medicalQuestions.id, input.id));
      await auditQuestion({ questionId: input.id, actorOpenId: ctx.user.openId, action: input.publish ? "response_sent_and_published" : "response_sent", metadata: { published: input.publish } });
      return { success: true, published: input.publish };
    }),
    unpublish: adminProcedure.input(questionIdInput).mutation(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      const [question] = await db.select().from(medicalQuestions).where(eq6(medicalQuestions.id, input.id)).limit(1);
      if (!question) throw new TRPCError4({ code: "NOT_FOUND", message: "Question introuvable." });
      if (question.status !== "published") throw new TRPCError4({ code: "BAD_REQUEST", message: "Cette question n\u2019est pas publi\xE9e." });
      await db.update(medicalQuestions).set({
        status: "answered",
        publicQuestion: null,
        publicResponse: null,
        publishedAt: null
      }).where(eq6(medicalQuestions.id, input.id));
      await auditQuestion({ questionId: input.id, actorOpenId: ctx.user.openId, action: "unpublished", metadata: { retainedPrivateRecord: true } });
      return { success: true };
    })
  })
});

// server/routers.ts
var stripeClient;
function getStripeClient() {
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!apiKey) throw new TRPCError5({ code: "PRECONDITION_FAILED", message: "Le service de paiement n\u2019est pas configur\xE9." });
  stripeClient ??= new Stripe(apiKey);
  return stripeClient;
}
var DEFAULT_PUBLIC_ORIGIN = process.env.PUBLIC_APP_ORIGIN || "https://drahmedbenlallahom.com";
var PARIS_TIME_ZONE = "Europe/Paris";
var CV_APPLICATION_STATUSES = ["new", "reviewing", "shortlisted", "placed", "rejected", "archived"];
var PUBLIC_FORM_RATE_LIMITS = {
  contact: { action: "public_contact_submit", maxAttempts: 5, windowMs: 15 * 60 * 1e3, blockMs: 60 * 60 * 1e3 },
  gdpr: { action: "public_gdpr_submit", maxAttempts: 3, windowMs: 24 * 60 * 60 * 1e3, blockMs: 24 * 60 * 60 * 1e3 }
};
async function enforcePublicFormRateLimit(input) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return;
  const ipHash = requestIpHash(input.headers);
  const policy = PUBLIC_FORM_RATE_LIMITS[input.kind];
  try {
    await enforcePersistentRateLimit({
      ...policy,
      subject: `${ipHash ?? "unknown"}:${input.email}`
    });
  } catch {
    await logSecurityEvent({
      actorKind: "anonymous",
      category: `${policy.action}_rate_limit`,
      outcome: "blocked",
      severity: "warning",
      ipHash
    });
    throw new TRPCError5({ code: "TOO_MANY_REQUESTS", message: "Veuillez patienter avant de soumettre une nouvelle demande." });
  }
}
var recruitmentPoolFiltersInput = z4.object({
  specialty: z4.string().trim().max(160).optional(),
  country: z4.string().trim().max(80).optional(),
  availability: z4.string().trim().max(100).optional(),
  mobility: z4.string().trim().max(150).optional(),
  certification: z4.string().trim().max(180).optional(),
  minimumScore: z4.number().int().min(0).max(100).optional(),
  limit: z4.number().int().min(1).max(200).optional().default(200)
}).optional();
function csvCell(value) {
  const text2 = value === null || value === void 0 ? "" : String(value);
  const protectedText = /^[=+\-@]/.test(text2) ? `'${text2}` : text2;
  return `"${protectedText.replace(/"/g, '""')}"`;
}
var PARIS_DAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};
function getParisParts(date) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PARIS_TIME_ZONE,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: String(values.weekday)
  };
}
function pad(value) {
  return String(value).padStart(2, "0");
}
function parisDateKey(date) {
  const parts = getParisParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}
function parisWallClockToUtc(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (!match) throw new Error("Invalid Paris local date");
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const wallClockMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let utcMs = wallClockMs;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = getParisParts(new Date(utcMs));
    const representedWallClockMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    utcMs = wallClockMs - (representedWallClockMs - wallClockMs);
  }
  return new Date(utcMs);
}
function parseAppointmentDate(value) {
  const hasExplicitTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = hasExplicitTimeZone ? new Date(value) : parisWallClockToUtc(value.length === 10 ? `${value}T00:00:00` : value.slice(0, 19));
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Invalid appointment date");
  }
  return parsed;
}
var appointmentDateInput = z4.string().min(1, "La date de consultation est requise").refine((value) => {
  try {
    parseAppointmentDate(value);
    return true;
  } catch {
    return false;
  }
}, "La date de consultation est invalide");
var calendarDateInput = z4.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date doit respecter le format YYYY-MM-DD").refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}, "La date calendaire est invalide");
function isNightRateForParis(date) {
  return getParisParts(date).hour >= 18 || getParisParts(date).hour < 8;
}
function getParisDateRange(dateKey) {
  const start = parisWallClockToUtc(`${dateKey}T00:00:00`);
  const [year, month, day] = dateKey.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextKey = `${nextDay.getUTCFullYear()}-${pad(nextDay.getUTCMonth() + 1)}-${pad(nextDay.getUTCDate())}`;
  return { start, end: parisWallClockToUtc(`${nextKey}T00:00:00`) };
}
function timeToMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? hours * 60 + minutes : Number.NaN;
}
function isWithinAvailability(date, slots, durationMinutes = 30) {
  const parts = getParisParts(date);
  const dayOfWeek = PARIS_DAY_INDEX[parts.weekday];
  const candidateStart = parts.hour * 60 + parts.minute;
  return slots.some((slot) => {
    if (slot.dayOfWeek !== dayOfWeek) return false;
    const slotStart = timeToMinutes(slot.startTime);
    const rawSlotEnd = timeToMinutes(slot.endTime);
    if (!Number.isFinite(slotStart) || !Number.isFinite(rawSlotEnd)) return false;
    const crossesMidnight = rawSlotEnd <= slotStart;
    const slotEnd = crossesMidnight ? rawSlotEnd + 24 * 60 : rawSlotEnd;
    const normalizedCandidateStart = crossesMidnight && candidateStart < slotStart ? candidateStart + 24 * 60 : candidateStart;
    return normalizedCandidateStart >= slotStart && normalizedCandidateStart + durationMinutes <= slotEnd;
  });
}
function getSafeCheckoutOrigin() {
  return DEFAULT_PUBLIC_ORIGIN;
}
var appRouter = router({
  system: systemRouter,
  candidatePortal: candidatePortalRouter,
  medicalQuestions: medicalQuestionsRouter,
  adminSecurity: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError5({ code: "FORBIDDEN", message: "Acc\xE8s administrateur requis." });
      return { verified: await isAdminMfaVerified(ctx.req, ctx.user.openId), email: ctx.user.email ?? null };
    }),
    begin: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError5({ code: "FORBIDDEN", message: "Acc\xE8s administrateur requis." });
      if (!ctx.user.email) throw new TRPCError5({ code: "BAD_REQUEST", message: "Aucun email administrateur v\xE9rifi\xE9 n\u2019est disponible pour la double authentification." });
      await issueAdminMfaChallenge({ openId: ctx.user.openId, email: ctx.user.email, req: ctx.req });
      return { success: true };
    }),
    verify: protectedProcedure.input(z4.object({ code: z4.string().regex(/^\d{6}$/) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError5({ code: "FORBIDDEN", message: "Acc\xE8s administrateur requis." });
      try {
        await verifyAdminMfaChallenge({ openId: ctx.user.openId, code: input.code, req: ctx.req, res: ctx.res });
        return { success: true };
      } catch {
        throw new TRPCError5({ code: "BAD_REQUEST", message: "Le code de s\xE9curit\xE9 est invalide ou expir\xE9." });
      }
    }),
    events: protectedProcedure.input(z4.object({ limit: z4.number().int().min(1).max(100).default(50) }).optional()).query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError5({ code: "FORBIDDEN", message: "Acc\xE8s administrateur requis." });
      if (!await isAdminMfaVerified(ctx.req, ctx.user.openId)) throw new TRPCError5({ code: "FORBIDDEN", message: "Double authentification administrateur requise." });
      const db = await getDb();
      if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR", message: "Base de donn\xE9es indisponible." });
      const events = await db.select({
        id: securityEvents.id,
        actorKind: securityEvents.actorKind,
        category: securityEvents.category,
        outcome: securityEvents.outcome,
        severity: securityEvents.severity,
        createdAt: securityEvents.createdAt
      }).from(securityEvents).orderBy(desc3(securityEvents.createdAt)).limit(input?.limit ?? 50);
      return events;
    })
  }),
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  contact: router({
    submit: publicProcedure.input(
      z4.object({
        name: z4.string().min(1, "Le nom est requis").max(255),
        email: z4.string().email("Email invalide").max(320),
        phone: z4.string().max(50).optional(),
        message: z4.string().min(1, "Le message est requis").max(5e3),
        gdprConsent: z4.number().int().min(0).max(1)
      })
    ).mutation(async ({ input, ctx }) => {
      if (input.gdprConsent !== 1) {
        throw new TRPCError5({ code: "BAD_REQUEST", message: "Le consentement RGPD est requis" });
      }
      await enforcePublicFormRateLimit({
        kind: "contact",
        email: input.email,
        headers: ctx.req.headers
      });
      const trackingId = `C${Math.random().toString(36).substring(2, 10).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const db = await getDb();
      if (db) {
        await db.execute(
          sql2`INSERT INTO contact_messages (tracking_id, name, email, phone, message, gdpr_consent) VALUES (${trackingId}, ${input.name}, ${input.email}, ${input.phone || null}, ${input.message}, ${input.gdprConsent})`
        );
      }
      await notifyOwner({
        title: `Nouveau message de contact de ${input.name} (${trackingId})`,
        content: `**Num\xE9ro de suivi:** ${trackingId}
**De:** ${input.name}
**Email:** ${input.email}
**T\xE9l\xE9phone:** ${input.phone || "Non renseign\xE9"}
**Consentement RGPD:** ${input.gdprConsent === 1 ? "\u2705 Accept\xE9" : "\u274C Refus\xE9"}

**Message:**
${input.message}`
      });
      return { success: true, trackingId };
    })
  }),
  gdpr: router({
    submit: publicProcedure.input(
      z4.object({
        name: z4.string().min(1, "Le nom est requis").max(255),
        email: z4.string().email("Email invalide").max(320),
        phone: z4.string().max(50).optional(),
        requestType: z4.enum(["access", "rectification", "deletion", "portability", "objection"]),
        description: z4.string().min(1, "La description est requise").max(5e3).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      await enforcePublicFormRateLimit({
        kind: "gdpr",
        email: input.email,
        headers: ctx.req.headers
      });
      const trackingId = `G${Math.random().toString(36).substring(2, 10).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const db = await getDb();
      if (db) {
        await db.execute(
          sql2`INSERT INTO gdpr_requests (tracking_id, name, email, phone, request_type, description, status) VALUES (${trackingId}, ${input.name}, ${input.email}, ${input.phone || null}, ${input.requestType}, ${input.description || null}, ${"pending"})`
        );
      }
      const requestTypeLabels = {
        access: "Acc\xE8s aux donn\xE9es",
        rectification: "Rectification de donn\xE9es",
        deletion: "Suppression de donn\xE9es (droit \xE0 l'oubli)",
        portability: "Portabilit\xE9 des donn\xE9es",
        objection: "Opposition au traitement"
      };
      await notifyOwner({
        title: `Nouvelle demande RGPD de ${input.name} (${trackingId})`,
        content: `**Num\xE9ro de suivi:** ${trackingId}
**Type de demande:** ${requestTypeLabels[input.requestType]}
**De:** ${input.name}
**Email:** ${input.email}
**T\xE9l\xE9phone:** ${input.phone || "Non renseign\xE9"}

**Description:**
${input.description || "Aucune description fournie"}`
      });
      return { success: true, trackingId };
    })
  }),
  testimonials: router({
    list: publicProcedure.input(
      z4.object({
        language: z4.string().optional().default("fr"),
        featured: z4.number().optional()
      })
    ).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [
        eq11(testimonials.language, input.language),
        eq11(testimonials.status, "approved")
      ];
      if (input.featured !== void 0) {
        conditions.push(eq11(testimonials.featured, input.featured));
      }
      return await db.select().from(testimonials).where(and9(...conditions));
    }),
    create: adminProcedure.input(
      z4.object({
        authorName: z4.string().min(1).max(100),
        rating: z4.number().min(1).max(5),
        title: z4.string().min(1).max(255),
        content: z4.string().min(1).max(5e3),
        specialty: z4.string().min(1).max(255),
        language: z4.string().default("fr"),
        featured: z4.number().optional().default(0)
      })
    ).mutation(async ({ input }) => {
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
        status: "approved"
      });
      return { success: true };
    })
  }),
  appointments: router({
    calculatePrice: publicProcedure.input(
      z4.object({
        appointmentDate: appointmentDateInput
      })
    ).query(({ input }) => {
      const date = parseAppointmentDate(input.appointmentDate);
      const basePrice = 100;
      const isNightRate = isNightRateForParis(date);
      const finalPrice = isNightRate ? basePrice * 1.5 : basePrice;
      return {
        basePrice,
        finalPrice,
        isNightRate
      };
    }),
    create: publicProcedure.input(
      z4.object({
        customerName: z4.string().min(1).max(255),
        customerEmail: z4.string().email().max(320),
        customerPhone: z4.string().min(1).max(50),
        appointmentDate: appointmentDateInput,
        requestDetails: z4.string().min(1).max(5e3)
      })
    ).mutation(async ({ input }) => {
      const date = parseAppointmentDate(input.appointmentDate);
      if (date.getTime() <= Date.now()) {
        throw new TRPCError5({ code: "BAD_REQUEST", message: "La date de consultation doit \xEAtre future" });
      }
      const basePrice = "100.00";
      const isNightRate = isNightRateForParis(date);
      const finalPrice = isNightRate ? "150.00" : "100.00";
      const trackingId = `APT${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
      const db = await getDb();
      if (!db) {
        throw new Error("Database connection failed");
      }
      try {
        const { getAppointmentHoldExpiry: getAppointmentHoldExpiry2, getExpiredAppointmentHoldUpdate: getExpiredAppointmentHoldUpdate2, releaseExpiredAppointmentHolds: releaseExpiredAppointmentHolds2 } = await Promise.resolve().then(() => (init_appointmentHolds(), appointmentHolds_exports));
        await releaseExpiredAppointmentHolds2();
        const dateKey = parisDateKey(date);
        const blockedDate = await db.select({ id: blockedDates.id }).from(blockedDates).where(eq11(blockedDates.date, dateKey)).limit(1);
        if (blockedDate.length > 0) {
          throw new TRPCError5({ code: "CONFLICT", message: "Cette date est indisponible" });
        }
        const activeSlots = await db.select({ dayOfWeek: availabilitySlots.dayOfWeek, startTime: availabilitySlots.startTime, endTime: availabilitySlots.endTime }).from(availabilitySlots).where(eq11(availabilitySlots.isActive, 1));
        if (activeSlots.length > 0 && !isWithinAvailability(date, activeSlots, 30)) {
          throw new TRPCError5({ code: "CONFLICT", message: "Ce cr\xE9neau ne correspond pas aux disponibilit\xE9s configur\xE9es" });
        }
        const appointmentEnd = new Date(date.getTime() + 30 * 60 * 1e3);
        const existingAppointments = await db.select({ id: appointments.id }).from(appointments).where(
          and9(
            sql2`appointment_date < ${appointmentEnd}`,
            sql2`appointment_date + (duration * INTERVAL '1 minute') > ${date}`,
            sql2`(
                  (payment_status = 'pending' AND appointment_status = 'held' AND hold_expires_at > NOW())
                  OR (payment_status = 'pending' AND appointment_status = 'confirmed')
                  OR (payment_status = 'completed' AND appointment_status IN ('confirmed', 'completed'))
                )`
          )
        ).limit(1);
        if (existingAppointments.length > 0) {
          throw new TRPCError5({ code: "CONFLICT", message: "Ce cr\xE9neau chevauche une r\xE9servation existante" });
        }
        const appointmentDateFormatted = date.toISOString().slice(0, 19).replace("T", " ");
        const slotKey = date.toISOString();
        const holdExpiresAt = getAppointmentHoldExpiry2();
        await db.execute(
          sql2`INSERT INTO appointments (tracking_id, customer_name, customer_email, customer_phone, consultation_type, request_details, appointment_date, slot_key, duration, base_price, final_price, is_night_rate, payment_status, appointment_status, hold_expires_at) VALUES (${trackingId}, ${input.customerName}, ${input.customerEmail}, ${input.customerPhone}, ${"health_advice"}, ${input.requestDetails}, ${appointmentDateFormatted}, ${slotKey}, ${30}, ${basePrice}, ${finalPrice}, ${isNightRate ? 1 : 0}, ${"pending"}, ${"held"}, ${holdExpiresAt})`
        );
        try {
          const session = await getStripeClient().checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{ price_data: { currency: "eur", product_data: { name: "Health Consultation - 30 minutes", description: `Appointment: ${trackingId}` }, unit_amount: Math.round(Number(finalPrice) * 100) }, quantity: 1 }],
            mode: "payment",
            customer_email: input.customerEmail,
            metadata: { trackingId, customerName: input.customerName },
            expires_at: Math.floor(holdExpiresAt.getTime() / 1e3),
            success_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=success&trackingId=${encodeURIComponent(trackingId)}`,
            cancel_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=canceled&session_id={CHECKOUT_SESSION_ID}`
          });
          if (!session.id || !session.url) throw new Error("stripe_checkout_session_unavailable");
          await db.update(appointments).set({ stripeSessionId: session.id }).where(and9(eq11(appointments.trackingId, trackingId), eq11(appointments.appointmentStatus, "held")));
          return { success: true, trackingId, finalPrice: parseFloat(finalPrice), checkoutUrl: session.url };
        } catch (stripeError) {
          await db.update(appointments).set(getExpiredAppointmentHoldUpdate2()).where(and9(eq11(appointments.trackingId, trackingId), eq11(appointments.paymentStatus, "pending"), eq11(appointments.appointmentStatus, "held")));
          throw stripeError;
        }
      } catch (dbError) {
        console.error("Database insert error:", dbError);
        if (dbError instanceof TRPCError5) throw dbError;
        if (String(dbError).toLowerCase().includes("appointments_active_slot_unique") || String(dbError).toLowerCase().includes("duplicate")) {
          throw new TRPCError5({ code: "CONFLICT", message: "Ce cr\xE9neau vient d\u2019\xEAtre r\xE9serv\xE9 par un autre patient. Veuillez en choisir un autre." });
        }
        throw new Error(`Failed to create appointment: ${dbError instanceof Error ? dbError.message : "Unknown error"}`);
      }
    }),
    createCheckoutSession: publicProcedure.input(
      z4.object({
        trackingId: z4.string(),
        finalPrice: z4.number(),
        customerEmail: z4.string().email(),
        customerName: z4.string()
      })
    ).mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const appointmentResult = await db.select({
          trackingId: appointments.trackingId,
          customerEmail: appointments.customerEmail,
          customerName: appointments.customerName,
          finalPrice: appointments.finalPrice,
          paymentStatus: appointments.paymentStatus,
          appointmentStatus: appointments.appointmentStatus,
          stripeSessionId: appointments.stripeSessionId,
          holdExpiresAt: appointments.holdExpiresAt
        }).from(appointments).where(eq11(appointments.trackingId, input.trackingId)).limit(1);
        const appointment = appointmentResult[0];
        if (!appointment) {
          throw new TRPCError5({ code: "NOT_FOUND", message: "Rendez-vous introuvable" });
        }
        if (appointment.paymentStatus !== "pending" || appointment.appointmentStatus !== "held" || !appointment.holdExpiresAt || appointment.holdExpiresAt <= /* @__PURE__ */ new Date()) {
          throw new TRPCError5({ code: "CONFLICT", message: "Ce rendez-vous ne peut plus \xEAtre pay\xE9" });
        }
        const expectedPrice = Number(appointment.finalPrice);
        if (!Number.isFinite(expectedPrice) || Math.round(expectedPrice * 100) !== Math.round(input.finalPrice * 100)) {
          throw new TRPCError5({ code: "BAD_REQUEST", message: "Le montant du paiement ne correspond pas au rendez-vous" });
        }
        if (appointment.customerEmail !== input.customerEmail || appointment.customerName !== input.customerName) {
          throw new TRPCError5({ code: "BAD_REQUEST", message: "Les informations du paiement ne correspondent pas au rendez-vous" });
        }
        if (appointment.stripeSessionId) {
          const existingSession = await getStripeClient().checkout.sessions.retrieve(appointment.stripeSessionId);
          if (existingSession.status === "open" && existingSession.url) return { success: true, checkoutUrl: existingSession.url };
          throw new TRPCError5({ code: "CONFLICT", message: "La session de paiement a expir\xE9" });
        }
        const amountInCents = Math.round(expectedPrice * 100);
        const session = await getStripeClient().checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "eur",
                product_data: {
                  name: "Health Consultation - 30 minutes",
                  description: `Appointment: ${input.trackingId}`
                },
                unit_amount: amountInCents
              },
              quantity: 1
            }
          ],
          mode: "payment",
          customer_email: input.customerEmail,
          metadata: {
            trackingId: input.trackingId,
            customerName: input.customerName
          },
          expires_at: Math.floor(appointment.holdExpiresAt.getTime() / 1e3),
          success_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=success&trackingId=${encodeURIComponent(input.trackingId)}`,
          cancel_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=canceled&session_id={CHECKOUT_SESSION_ID}`
        });
        if (session.id) {
          await db.update(appointments).set({ stripeSessionId: session.id }).where(and9(eq11(appointments.trackingId, input.trackingId), eq11(appointments.appointmentStatus, "held")));
        }
        return {
          success: true,
          checkoutUrl: session.url
        };
      } catch (error) {
        console.error("Stripe error:", error);
        if (error instanceof TRPCError5) throw error;
        throw new Error("Failed to create checkout session");
      }
    }),
    cancelPending: publicProcedure.input(z4.object({ sessionId: z4.string().min(1).max(255) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      let session;
      try {
        session = await getStripeClient().checkout.sessions.retrieve(input.sessionId);
      } catch {
        throw new TRPCError5({ code: "BAD_REQUEST", message: "Session Stripe invalide" });
      }
      const trackingId = session.metadata?.trackingId;
      if (!trackingId || session.payment_status === "paid") {
        return { success: true, cancelled: false };
      }
      const result = await db.update(appointments).set({ appointmentStatus: "cancelled", slotKey: null }).where(
        and9(
          eq11(appointments.trackingId, trackingId),
          eq11(appointments.stripeSessionId, input.sessionId),
          eq11(appointments.paymentStatus, "pending"),
          eq11(appointments.appointmentStatus, "confirmed")
        )
      );
      return { success: true, cancelled: Number(result.rowCount ?? 0) > 0 };
    })
  }),
  // Blog / Actualités
  blog: router({
    list: publicProcedure.input(
      z4.object({
        language: z4.string().optional().default("fr"),
        category: z4.string().optional(),
        limit: z4.number().min(1).max(50).optional().default(10),
        offset: z4.number().min(0).optional().default(0)
      })
    ).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const conditions = [
        eq11(blogPosts.published, 1),
        eq11(blogPosts.language, input.language)
      ];
      if (input.category) {
        conditions.push(eq11(blogPosts.category, input.category));
      }
      const whereClause = and9(...conditions);
      const items = await db.select().from(blogPosts).where(whereClause).orderBy(desc3(blogPosts.createdAt)).limit(input.limit).offset(input.offset);
      const [countResult] = await db.select({ count: sql2`COUNT(*)` }).from(blogPosts).where(whereClause);
      return { items, total: countResult?.count || 0 };
    }),
    getBySlug: publicProcedure.input(z4.object({ slug: z4.string() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const results = await db.select().from(blogPosts).where(and9(eq11(blogPosts.slug, input.slug), eq11(blogPosts.published, 1))).limit(1);
      return results[0] || null;
    })
  }),
  // Availability / Calendar
  availability: router({
    getSlots: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(availabilitySlots).where(eq11(availabilitySlots.isActive, 1));
    }),
    getBlockedDates: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(blockedDates);
    }),
    getBookedSlots: publicProcedure.input(z4.object({ date: calendarDateInput })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { start, end } = getParisDateRange(input.date);
      const results = await db.select({ appointmentDate: appointments.appointmentDate }).from(appointments).where(
        and9(
          gte(appointments.appointmentDate, start),
          lt2(appointments.appointmentDate, end),
          sql2`(
                (payment_status = 'pending' AND appointment_status = 'held' AND hold_expires_at > NOW())
                OR (payment_status = 'pending' AND appointment_status = 'confirmed')
                OR (payment_status = 'completed' AND appointment_status IN ('confirmed', 'completed'))
              )`
        )
      );
      return results.map((r) => r.appointmentDate);
    })
  }),
  recruitmentPreferences: router({
    unsubscribe: publicProcedure.input(z4.object({ token: z4.string().trim().min(24).max(80) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const [candidate] = await db.select({ id: cvApplications.id, marketingUnsubscribedAt: cvApplications.marketingUnsubscribedAt }).from(cvApplications).where(eq11(cvApplications.marketingUnsubscribeToken, input.token)).limit(1);
      if (!candidate) throw new TRPCError5({ code: "NOT_FOUND", message: "Lien de d\xE9sinscription invalide ou expir\xE9." });
      const alreadyUnsubscribed = Boolean(candidate.marketingUnsubscribedAt);
      if (!alreadyUnsubscribed) {
        await db.update(cvApplications).set({ marketingConsent: 0, marketingUnsubscribedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq11(cvApplications.id, candidate.id));
      }
      await db.insert(recruitmentAuditLogs).values({
        applicationId: candidate.id,
        adminOpenId: "public:unsubscribe",
        action: "unsubscribe",
        metadata: JSON.stringify({ source: "recruitment_preferences", alreadyUnsubscribed })
      });
      return { success: true, alreadyUnsubscribed };
    })
  }),
  // Admin Dashboard Procedures
  admin: router({
    // List all appointments with pagination
    appointments: router({
      list: adminProcedure.input(
        z4.object({
          limit: z4.number().min(1).max(100).optional().default(50),
          offset: z4.number().min(0).optional().default(0),
          status: z4.enum(["pending", "completed", "failed", "refunded"]).optional()
        })
      ).query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { items: [], total: 0 };
        const conditions = [];
        if (input.status) {
          conditions.push(eq11(appointments.paymentStatus, input.status));
        }
        const whereClause = conditions.length > 0 ? and9(...conditions) : void 0;
        const items = await db.select().from(appointments).where(whereClause).orderBy(desc3(appointments.createdAt)).limit(input.limit).offset(input.offset);
        const countResult = await db.select({ count: sql2`COUNT(*)` }).from(appointments).where(whereClause);
        return { items, total: countResult[0]?.count || 0 };
      }),
      updateStatus: adminProcedure.input(
        z4.object({
          trackingId: z4.string(),
          appointmentStatus: z4.enum(["confirmed", "cancelled", "completed", "no_show"])
        })
      ).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        await db.update(appointments).set({ appointmentStatus: input.appointmentStatus, slotKey: input.appointmentStatus === "cancelled" ? null : void 0 }).where(eq11(appointments.trackingId, input.trackingId));
        return { success: true };
      }),
      refund: adminProcedure.input(
        z4.object({
          trackingId: z4.string().min(1),
          reason: z4.string().min(1).max(500)
        })
      ).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const [appointment] = await db.select({
          trackingId: appointments.trackingId,
          appointmentDate: appointments.appointmentDate,
          paymentStatus: appointments.paymentStatus,
          appointmentStatus: appointments.appointmentStatus,
          stripePaymentIntentId: appointments.stripePaymentIntentId,
          finalPrice: appointments.finalPrice,
          customerEmail: appointments.customerEmail,
          customerName: appointments.customerName
        }).from(appointments).where(eq11(appointments.trackingId, input.trackingId)).limit(1);
        if (!appointment) {
          throw new TRPCError5({ code: "NOT_FOUND", message: "Rendez-vous introuvable" });
        }
        if (appointment.paymentStatus === "refunded") {
          throw new TRPCError5({ code: "CONFLICT", message: "Ce rendez-vous a d\xE9j\xE0 \xE9t\xE9 rembours\xE9" });
        }
        if (appointment.paymentStatus !== "completed" || !appointment.stripePaymentIntentId) {
          throw new TRPCError5({ code: "CONFLICT", message: "Le rendez-vous n\u2019est pas \xE9ligible au remboursement" });
        }
        const hoursUntilAppointment = (new Date(appointment.appointmentDate).getTime() - Date.now()) / (60 * 60 * 1e3);
        if (hoursUntilAppointment < 24) {
          throw new TRPCError5({ code: "CONFLICT", message: "Le remboursement int\xE9gral est disponible jusqu\u2019\xE0 24 heures avant la consultation" });
        }
        try {
          const refund = await getStripeClient().refunds.create(
            {
              payment_intent: appointment.stripePaymentIntentId,
              metadata: {
                trackingId: appointment.trackingId,
                reason: input.reason
              }
            },
            { idempotencyKey: `refund_${appointment.trackingId}` }
          );
          const refundAmount = ((refund.amount ?? Math.round(Number(appointment.finalPrice) * 100)) / 100).toFixed(2);
          const now = /* @__PURE__ */ new Date();
          await db.update(appointments).set({
            paymentStatus: "refunded",
            appointmentStatus: "cancelled",
            slotKey: null,
            cancellationReason: input.reason,
            cancelledAt: now,
            refundAmount,
            refundedAt: now
          }).where(
            and9(
              eq11(appointments.trackingId, input.trackingId),
              eq11(appointments.paymentStatus, "completed")
            )
          );
          await sendRefundConfirmationEmail(
            appointment.customerEmail,
            appointment.customerName,
            appointment.trackingId,
            new Date(appointment.appointmentDate),
            refundAmount
          );
          return { success: true, refundId: refund.id, refundAmount };
        } catch (error) {
          console.error("Stripe refund error:", error);
          if (error instanceof TRPCError5) throw error;
          throw new TRPCError5({ code: "BAD_REQUEST", message: "Le remboursement Stripe a \xE9chou\xE9" });
        }
      })
    }),
    // International recruitment applications
    recruitment: router({
      driveExport: router({
        status: adminProcedure.query(async () => googleDriveExportStatus())
      }),
      list: adminProcedure.input(
        z4.object({
          limit: z4.number().min(1).max(100).optional().default(50),
          offset: z4.number().min(0).optional().default(0),
          status: z4.enum(CV_APPLICATION_STATUSES).optional(),
          specialty: z4.string().trim().max(160).optional(),
          country: z4.string().trim().max(80).optional(),
          language: z4.string().trim().max(80).optional(),
          certification: z4.string().trim().max(160).optional(),
          minimumScore: z4.number().int().min(0).max(100).optional(),
          profileId: z4.number().int().positive().optional()
        })
      ).query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { items: [], total: 0 };
        const conditions = [];
        if (input.status) conditions.push(eq11(cvApplications.status, input.status));
        if (input.specialty) conditions.push(sql2`LOWER(${cvApplications.specialty}) LIKE LOWER(${`%${input.specialty}%`})`);
        if (input.country) conditions.push(sql2`${cvApplications.targetCountries} LIKE ${`%${input.country}%`}`);
        if (input.language) conditions.push(sql2`(${cvApplications.normalizedLanguages} LIKE ${`%${input.language}%`} OR ${cvApplications.languages} LIKE ${`%${input.language}%`})`);
        if (input.certification) conditions.push(sql2`(${cvApplications.normalizedCertifications} LIKE ${`%${input.certification}%`} OR ${cvApplications.certifications} LIKE ${`%${input.certification}%`})`);
        let profile = null;
        if (input.profileId) {
          const [selectedProfile] = await db.select().from(recruitmentMatchProfiles).where(and9(eq11(recruitmentMatchProfiles.id, input.profileId), eq11(recruitmentMatchProfiles.active, 1))).limit(1);
          if (!selectedProfile) throw new TRPCError5({ code: "NOT_FOUND", message: "Profil de matching introuvable" });
          profile = selectedProfile;
          conditions.push(sql2`${cvApplications.aiScore} >= ${selectedProfile.minimumScore}`);
          if (selectedProfile.specialty) conditions.push(sql2`LOWER(${cvApplications.specialty}) LIKE LOWER(${`%${selectedProfile.specialty}%`})`);
          if (selectedProfile.targetCountry) conditions.push(sql2`${cvApplications.targetCountries} LIKE ${`%${selectedProfile.targetCountry}%`}`);
        }
        if (input.minimumScore !== void 0) conditions.push(sql2`${cvApplications.aiScore} >= ${input.minimumScore}`);
        const whereClause = conditions.length > 0 ? and9(...conditions) : void 0;
        const rawItems = await db.select({
          id: cvApplications.id,
          trackingId: cvApplications.trackingId,
          firstName: cvApplications.firstName,
          lastName: cvApplications.lastName,
          email: cvApplications.email,
          phone: cvApplications.phone,
          specialty: cvApplications.specialty,
          diplomaCountry: cvApplications.diplomaCountry,
          targetCountries: cvApplications.targetCountries,
          languages: cvApplications.languages,
          yearsExperience: cvApplications.yearsExperience,
          availability: cvApplications.availability,
          mobility: cvApplications.mobility,
          certifications: cvApplications.certifications,
          normalizedCertifications: cvApplications.normalizedCertifications,
          normalizedLanguages: cvApplications.normalizedLanguages,
          normalizedExperiences: cvApplications.normalizedExperiences,
          message: cvApplications.message,
          cvOriginalName: cvApplications.cvOriginalName,
          cvMimeType: cvApplications.cvMimeType,
          cvSizeBytes: cvApplications.cvSizeBytes,
          fileValidationStatus: cvApplications.fileValidationStatus,
          fileSecurityScanVersion: cvApplications.fileSecurityScanVersion,
          fileValidationNotes: cvApplications.fileValidationNotes,
          gdprConsent: cvApplications.gdprConsent,
          marketingConsent: cvApplications.marketingConsent,
          status: cvApplications.status,
          adminNotes: cvApplications.adminNotes,
          consentAt: cvApplications.consentAt,
          retentionUntil: cvApplications.retentionUntil,
          aiSummary: cvApplications.aiSummary,
          aiScore: cvApplications.aiScore,
          aiStrengths: cvApplications.aiStrengths,
          aiWeaknesses: cvApplications.aiWeaknesses,
          aiExtractedSkills: cvApplications.aiExtractedSkills,
          aiMatchReasoning: cvApplications.aiMatchReasoning,
          aiAnalyzedAt: cvApplications.aiAnalyzedAt,
          analysisStatus: cvApplications.analysisStatus,
          analysisAttempts: cvApplications.analysisAttempts,
          analysisLastError: cvApplications.analysisLastError,
          analysisModel: cvApplications.analysisModel,
          analysisPromptVersion: cvApplications.analysisPromptVersion,
          extractionMethod: cvApplications.extractionMethod,
          extractionPageCount: cvApplications.extractionPageCount,
          extractionTotalPages: cvApplications.extractionTotalPages,
          ocrConfidence: cvApplications.ocrConfidence,
          ocrModelVersion: cvApplications.ocrModelVersion,
          extractionWarnings: cvApplications.extractionWarnings,
          analysisRequestedAt: cvApplications.analysisRequestedAt,
          createdAt: cvApplications.createdAt,
          updatedAt: cvApplications.updatedAt
        }).from(cvApplications).where(whereClause).orderBy(desc3(cvApplications.createdAt)).limit(profile ? 1e3 : input.limit).offset(profile ? 0 : input.offset);
        const matchedItems = profile ? rawItems.filter((item) => matchesRecruitmentProfile({
          score: item.aiScore,
          specialty: item.specialty,
          targetCountries: parseRecruitmentJsonArray(item.targetCountries),
          languages: parseRecruitmentJsonArray(item.languages),
          extractedSkills: (() => {
            try {
              const parsed = item.aiExtractedSkills ? JSON.parse(item.aiExtractedSkills) : {};
              return Array.isArray(parsed.skills) ? parsed.skills.filter((value) => typeof value === "string") : [];
            } catch {
              return [];
            }
          })(),
          profile
        })) : rawItems;
        const applicationIds = rawItems.map((item) => item.id);
        const portalAccounts = applicationIds.length ? await db.select({ linkedApplicationId: candidateAccounts.linkedApplicationId, emailVerifiedAt: candidateAccounts.emailVerifiedAt }).from(candidateAccounts).where(inArray4(candidateAccounts.linkedApplicationId, applicationIds)) : [];
        const activePortalApplicationIds = new Set(portalAccounts.filter((account) => account.emailVerifiedAt && account.linkedApplicationId).map((account) => account.linkedApplicationId));
        const items = (profile ? matchedItems.slice(input.offset, input.offset + input.limit) : matchedItems).map((item) => ({ ...item, candidatePortalActive: activePortalApplicationIds.has(item.id) }));
        const countResult = profile ? [{ count: matchedItems.length }] : await db.select({ count: sql2`COUNT(*)` }).from(cvApplications).where(whereClause);
        return { items, total: countResult[0]?.count || 0 };
      }),
      pool: router({
        list: adminProcedure.input(recruitmentPoolFiltersInput).query(async ({ input }) => {
          const db = await getDb();
          if (!db) return [];
          const conditions = [
            eq11(cvApplications.marketingConsent, 1),
            isNull3(cvApplications.marketingUnsubscribedAt),
            isNull3(cvApplications.marketingSuppressedAt),
            sql2`${cvApplications.status} NOT IN ('rejected', 'archived')`
          ];
          if (input?.specialty) conditions.push(sql2`LOWER(${cvApplications.specialty}) LIKE LOWER(${`%${input.specialty}%`})`);
          if (input?.country) conditions.push(sql2`${cvApplications.targetCountries} LIKE ${`%${input.country}%`}`);
          if (input?.availability) conditions.push(sql2`LOWER(COALESCE(${cvApplications.availability}, '')) LIKE LOWER(${`%${input.availability}%`})`);
          if (input?.mobility) conditions.push(sql2`(LOWER(COALESCE(${cvApplications.mobility}, '')) LIKE LOWER(${`%${input.mobility}%`}) OR LOWER(COALESCE(${cvApplications.targetCountries}, '')) LIKE LOWER(${`%${input.mobility}%`}))`);
          if (input?.certification) conditions.push(sql2`(LOWER(COALESCE(${cvApplications.certifications}, '')) LIKE LOWER(${`%${input.certification}%`}) OR LOWER(COALESCE(${cvApplications.normalizedCertifications}, '')) LIKE LOWER(${`%${input.certification}%`}))`);
          if (input?.minimumScore !== void 0) conditions.push(sql2`${cvApplications.aiScore} >= ${input.minimumScore}`);
          return db.select({
            id: cvApplications.id,
            firstName: cvApplications.firstName,
            lastName: cvApplications.lastName,
            email: cvApplications.email,
            specialty: cvApplications.specialty,
            targetCountries: cvApplications.targetCountries,
            languages: cvApplications.languages,
            availability: cvApplications.availability,
            mobility: cvApplications.mobility,
            certifications: cvApplications.certifications,
            aiScore: cvApplications.aiScore,
            status: cvApplications.status,
            marketingConsent: cvApplications.marketingConsent,
            createdAt: cvApplications.createdAt
          }).from(cvApplications).where(and9(...conditions)).orderBy(desc3(cvApplications.aiScore), desc3(cvApplications.createdAt)).limit(input?.limit || 200);
        })
      }),
      campaigns: router({
        previewAudience: adminProcedure.input(z4.object({
          mode: z4.enum(["selected", "all_eligible", "filtered"]),
          selectedIds: z4.array(z4.number().int().positive()).max(200).default([]),
          specialty: z4.string().trim().max(160).optional(),
          country: z4.string().trim().max(80).optional(),
          minimumScore: z4.number().int().min(0).max(100).optional()
        })).query(async ({ input }) => {
          const db = await getDb();
          if (!db) return [];
          const conditions = [eq11(cvApplications.marketingConsent, 1), isNull3(cvApplications.marketingUnsubscribedAt), isNull3(cvApplications.marketingSuppressedAt), sql2`${cvApplications.status} NOT IN ('rejected', 'archived')`];
          if (input.mode === "selected") {
            if (!input.selectedIds.length) return [];
            conditions.push(inArray4(cvApplications.id, input.selectedIds));
          }
          if (input.mode === "filtered") {
            if (input.specialty) conditions.push(sql2`LOWER(${cvApplications.specialty}) LIKE LOWER(${`%${input.specialty}%`})`);
            if (input.country) conditions.push(sql2`${cvApplications.targetCountries} LIKE ${`%${input.country}%`}`);
            if (input.minimumScore !== void 0) conditions.push(sql2`${cvApplications.aiScore} >= ${input.minimumScore}`);
          }
          return db.select({
            id: cvApplications.id,
            firstName: cvApplications.firstName,
            lastName: cvApplications.lastName,
            email: cvApplications.email,
            specialty: cvApplications.specialty,
            aiScore: cvApplications.aiScore
          }).from(cvApplications).where(and9(...conditions)).orderBy(desc3(cvApplications.aiScore), desc3(cvApplications.createdAt)).limit(200);
        }),
        list: adminProcedure.query(async () => {
          const db = await getDb();
          if (!db) return [];
          const campaigns = await db.select().from(recruitmentCampaigns).orderBy(desc3(recruitmentCampaigns.createdAt)).limit(50);
          if (!campaigns.length) return [];
          const metrics = await db.select({
            campaignId: recruitmentCampaignRecipients.campaignId,
            total: sql2`COUNT(DISTINCT ${recruitmentCampaignRecipients.id})`,
            delivered: sql2`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delivered' THEN ${recruitmentCampaignRecipients.id} END)`,
            sent: sql2`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} IN ('sent', 'delivered') THEN ${recruitmentCampaignRecipients.id} END)`,
            failed: sql2`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} IN ('failed', 'bounced', 'complained', 'suppressed') THEN ${recruitmentCampaignRecipients.id} END)`,
            delayed: sql2`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delayed' THEN ${recruitmentCampaignRecipients.id} END)`,
            opened: sql2`COUNT(DISTINCT CASE WHEN ${recruitmentEmailEvents.eventType} = 'email.opened' THEN ${recruitmentCampaignRecipients.id} END)`
          }).from(recruitmentCampaignRecipients).leftJoin(recruitmentEmailEvents, eq11(recruitmentEmailEvents.campaignRecipientId, recruitmentCampaignRecipients.id)).where(inArray4(recruitmentCampaignRecipients.campaignId, campaigns.map((campaign) => campaign.id))).groupBy(recruitmentCampaignRecipients.campaignId);
          const metricByCampaign = new Map(metrics.map((metric) => [metric.campaignId, metric]));
          return campaigns.map((campaign) => ({ ...campaign, delivery: metricByCampaign.get(campaign.id) || { total: 0, sent: 0, delivered: 0, failed: 0, delayed: 0, opened: 0 } }));
        }),
        send: adminProcedure.input(z4.object({
          title: z4.string().trim().min(3).max(180),
          subject: z4.string().trim().min(3).max(255),
          body: z4.string().trim().min(10).max(8e3),
          language: z4.enum(["fr", "en"]),
          mode: z4.enum(["selected", "all_eligible", "filtered"]),
          selectedIds: z4.array(z4.number().int().positive()).max(200).default([]),
          specialty: z4.string().trim().max(160).optional(),
          country: z4.string().trim().max(80).optional(),
          minimumScore: z4.number().int().min(0).max(100).optional(),
          confirmed: z4.literal(true)
        })).mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          const conditions = [eq11(cvApplications.marketingConsent, 1), isNull3(cvApplications.marketingUnsubscribedAt), isNull3(cvApplications.marketingSuppressedAt), sql2`${cvApplications.status} NOT IN ('rejected', 'archived')`];
          if (input.mode === "selected") {
            if (!input.selectedIds.length) throw new TRPCError5({ code: "BAD_REQUEST", message: "S\xE9lectionnez au moins un profil \xE9ligible" });
            conditions.push(inArray4(cvApplications.id, input.selectedIds));
          }
          if (input.mode === "filtered") {
            if (input.specialty) conditions.push(sql2`LOWER(${cvApplications.specialty}) LIKE LOWER(${`%${input.specialty}%`})`);
            if (input.country) conditions.push(sql2`${cvApplications.targetCountries} LIKE ${`%${input.country}%`}`);
            if (input.minimumScore !== void 0) conditions.push(sql2`${cvApplications.aiScore} >= ${input.minimumScore}`);
          }
          const audience = await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, lastName: cvApplications.lastName, email: cvApplications.email, marketingUnsubscribeToken: cvApplications.marketingUnsubscribeToken }).from(cvApplications).where(and9(...conditions)).limit(200);
          if (!audience.length) throw new TRPCError5({ code: "BAD_REQUEST", message: "Aucun profil \xE9ligible : seuls les candidats ayant accept\xE9 les communications de recrutement peuvent \xEAtre contact\xE9s." });
          const [campaignResult] = await db.insert(recruitmentCampaigns).values({
            title: input.title,
            subject: input.subject,
            body: input.body,
            language: input.language,
            audienceMode: input.mode,
            audienceFilters: JSON.stringify({ specialty: input.specialty || null, country: input.country || null, minimumScore: input.minimumScore ?? null, selectedIds: input.mode === "selected" ? input.selectedIds : void 0 }),
            recipientCount: audience.length,
            status: "sending",
            createdByOpenId: ctx.user.openId
          }).returning({ id: recruitmentCampaigns.id });
          const campaignId = Number(campaignResult.id);
          let sent = 0;
          let failed = 0;
          for (const candidate of audience) {
            const unsubscribeToken = candidate.marketingUnsubscribeToken || randomUUID().replace(/-/g, "");
            if (!candidate.marketingUnsubscribeToken) {
              await db.update(cvApplications).set({ marketingUnsubscribeToken: unsubscribeToken }).where(eq11(cvApplications.id, candidate.id));
            }
            const [recipientResult] = await db.insert(recruitmentCampaignRecipients).values({ campaignId, applicationId: candidate.id, recipientEmail: candidate.email, deliveryStatus: "queued" }).returning({ id: recruitmentCampaignRecipients.id });
            const recipientId = Number(recipientResult.id);
            try {
              const email = await sendRecruitmentCampaignEmail({
                candidateEmail: candidate.email,
                candidateName: `${candidate.firstName} ${candidate.lastName}`,
                campaignTitle: input.title,
                subject: input.subject,
                body: input.body,
                language: input.language,
                unsubscribeUrl: `${DEFAULT_PUBLIC_ORIGIN}/recruitment/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
              });
              const contactedAt = /* @__PURE__ */ new Date();
              await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "sent", providerEmailId: email.id || null, sentAt: contactedAt, lastEventAt: contactedAt }).where(eq11(recruitmentCampaignRecipients.id, recipientId));
              await db.update(cvApplications).set({ lastContactedAt: contactedAt }).where(eq11(cvApplications.id, candidate.id));
              await db.insert(recruitmentFollowUpTasks).values([
                { applicationId: candidate.id, campaignId, kind: "follow_up_7", dueAt: new Date(contactedAt.getTime() + 7 * 24 * 60 * 60 * 1e3), notes: "Relance sugg\xE9r\xE9e \xE0 J+7 \u2014 aucun email n\u2019est envoy\xE9 automatiquement." },
                { applicationId: candidate.id, campaignId, kind: "follow_up_14", dueAt: new Date(contactedAt.getTime() + 14 * 24 * 60 * 60 * 1e3), notes: "Relance sugg\xE9r\xE9e \xE0 J+14 \u2014 aucun email n\u2019est envoy\xE9 automatiquement." }
              ]);
              await logRecruitmentAction({ applicationId: candidate.id, adminOpenId: ctx.user.openId, action: "email", metadata: { campaignId, resendId: email.id, language: input.language } });
              sent += 1;
            } catch (error) {
              await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "failed", error: error instanceof Error ? error.message.slice(0, 2e3) : "Unknown campaign email failure" }).where(eq11(recruitmentCampaignRecipients.id, recipientId));
              failed += 1;
            }
          }
          await db.update(recruitmentCampaigns).set({ status: failed === 0 ? "sent" : sent > 0 ? "partially_sent" : "failed", sentAt: /* @__PURE__ */ new Date() }).where(eq11(recruitmentCampaigns.id, campaignId));
          return { campaignId, total: audience.length, sent, failed };
        })
      }),
      dashboard: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return null;
        const [candidateStats] = await db.select({
          total: sql2`COUNT(*)`,
          marketingEligible: sql2`SUM(CASE WHEN ${cvApplications.marketingConsent} = 1 AND ${cvApplications.marketingUnsubscribedAt} IS NULL AND ${cvApplications.marketingSuppressedAt} IS NULL THEN 1 ELSE 0 END)`,
          analysesQueued: sql2`SUM(CASE WHEN ${cvApplications.analysisStatus} = 'queued' THEN 1 ELSE 0 END)`,
          analysesInProgress: sql2`SUM(CASE WHEN ${cvApplications.analysisStatus} IN ('extracting', 'analyzing') THEN 1 ELSE 0 END)`,
          analysesCompleted: sql2`SUM(CASE WHEN ${cvApplications.analysisStatus} = 'completed' THEN 1 ELSE 0 END)`,
          analysesNeedsReview: sql2`SUM(CASE WHEN ${cvApplications.analysisStatus} = 'needs_review' THEN 1 ELSE 0 END)`,
          analysesFailed: sql2`SUM(CASE WHEN ${cvApplications.analysisStatus} = 'failed' THEN 1 ELSE 0 END)`,
          contacted: sql2`SUM(CASE WHEN ${cvApplications.lastContactedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
          responded: sql2`SUM(CASE WHEN ${cvApplications.lastCandidateResponseAt} IS NOT NULL THEN 1 ELSE 0 END)`
        }).from(cvApplications);
        const [campaignStats] = await db.select({
          total: sql2`COUNT(*)`,
          sent: sql2`SUM(CASE WHEN ${recruitmentCampaigns.status} IN ('sent', 'partially_sent') THEN 1 ELSE 0 END)`
        }).from(recruitmentCampaigns);
        const [deliveryStats] = await db.select({
          delivered: sql2`SUM(CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delivered' THEN 1 ELSE 0 END)`,
          failed: sql2`SUM(CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} IN ('failed', 'bounced', 'complained', 'suppressed') THEN 1 ELSE 0 END)`,
          delayed: sql2`SUM(CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delayed' THEN 1 ELSE 0 END)`
        }).from(recruitmentCampaignRecipients);
        const [followUpStats] = await db.select({
          pending: sql2`SUM(CASE WHEN ${recruitmentFollowUpTasks.status} = 'suggested' THEN 1 ELSE 0 END)`,
          due: sql2`SUM(CASE WHEN ${recruitmentFollowUpTasks.status} = 'suggested' AND ${recruitmentFollowUpTasks.dueAt} <= NOW() THEN 1 ELSE 0 END)`
        }).from(recruitmentFollowUpTasks);
        const [briefStats] = await db.select({
          total: sql2`COUNT(*)`,
          active: sql2`SUM(CASE WHEN ${clientBriefs.status} IN ('new', 'reviewing', 'shortlist_sent') THEN 1 ELSE 0 END)`
        }).from(clientBriefs);
        return { candidateStats, campaignStats, deliveryStats, followUpStats, briefStats };
      }),
      candidate: router({
        sendPortalInvitation: adminProcedure.input(z4.object({ id: z4.number().int().positive() })).mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR", message: "Base de donn\xE9es indisponible." });
          const application = (await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, email: cvApplications.email, trackingId: cvApplications.trackingId }).from(cvApplications).where(eq11(cvApplications.id, input.id)).limit(1))[0];
          if (!application) throw new TRPCError5({ code: "NOT_FOUND", message: "Candidature introuvable." });
          const existingAccount = (await db.select({ emailVerifiedAt: candidateAccounts.emailVerifiedAt }).from(candidateAccounts).where(sql2`LOWER(${candidateAccounts.email}) = LOWER(${application.email})`).limit(1))[0];
          if (existingAccount?.emailVerifiedAt) throw new TRPCError5({ code: "CONFLICT", message: "Un espace candidat actif existe d\xE9j\xE0 pour cette adresse email." });
          const invitationToken = createCandidateInvitationToken(application.id);
          const invitationUrl = `${getSafeCheckoutOrigin()}/candidate/access?invite=${encodeURIComponent(invitationToken)}`;
          const result = await sendCandidatePortalAccessEmail({ to: application.email, firstName: application.firstName, kind: "invite", actionUrl: invitationUrl });
          await logRecruitmentAction({ applicationId: application.id, adminOpenId: ctx.user.openId, action: "email", metadata: { template: "candidate_portal_invitation", resendId: result.id, trackingId: application.trackingId } });
          return { success: true };
        }),
        detail: adminProcedure.input(z4.object({ id: z4.number().int().positive() })).query(async ({ input }) => {
          const db = await getDb();
          if (!db) return null;
          const [candidate] = await db.select().from(cvApplications).where(eq11(cvApplications.id, input.id)).limit(1);
          if (!candidate) throw new TRPCError5({ code: "NOT_FOUND", message: "Candidature introuvable" });
          const [audits, campaignRecipients, followUps] = await Promise.all([
            db.select().from(recruitmentAuditLogs).where(eq11(recruitmentAuditLogs.applicationId, input.id)).orderBy(desc3(recruitmentAuditLogs.createdAt)).limit(100),
            db.select({
              id: recruitmentCampaignRecipients.id,
              campaignId: recruitmentCampaignRecipients.campaignId,
              campaignTitle: recruitmentCampaigns.title,
              deliveryStatus: recruitmentCampaignRecipients.deliveryStatus,
              error: recruitmentCampaignRecipients.error,
              sentAt: recruitmentCampaignRecipients.sentAt,
              deliveredAt: recruitmentCampaignRecipients.deliveredAt,
              lastEventAt: recruitmentCampaignRecipients.lastEventAt
            }).from(recruitmentCampaignRecipients).leftJoin(recruitmentCampaigns, eq11(recruitmentCampaignRecipients.campaignId, recruitmentCampaigns.id)).where(eq11(recruitmentCampaignRecipients.applicationId, input.id)).orderBy(desc3(recruitmentCampaignRecipients.createdAt)).limit(100),
            db.select().from(recruitmentFollowUpTasks).where(eq11(recruitmentFollowUpTasks.applicationId, input.id)).orderBy(recruitmentFollowUpTasks.status, recruitmentFollowUpTasks.dueAt).limit(50)
          ]);
          return { candidate, audits, campaignRecipients, followUps };
        }),
        markResponse: adminProcedure.input(z4.object({ id: z4.number().int().positive(), note: z4.string().trim().max(1e3).optional() })).mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          const responseAt = /* @__PURE__ */ new Date();
          await db.update(cvApplications).set({ lastCandidateResponseAt: responseAt, updatedAt: responseAt }).where(eq11(cvApplications.id, input.id));
          await logRecruitmentAction({ applicationId: input.id, adminOpenId: ctx.user.openId, action: "status_update", metadata: { event: "candidate_response", note: input.note || null } });
          return { success: true, responseAt };
        })
      }),
      followUps: router({
        list: adminProcedure.input(z4.object({ status: z4.enum(["suggested", "completed", "dismissed"]).optional() }).optional()).query(async ({ input }) => {
          const db = await getDb();
          if (!db) return [];
          const whereClause = input?.status ? eq11(recruitmentFollowUpTasks.status, input.status) : void 0;
          return db.select({
            id: recruitmentFollowUpTasks.id,
            applicationId: recruitmentFollowUpTasks.applicationId,
            campaignId: recruitmentFollowUpTasks.campaignId,
            kind: recruitmentFollowUpTasks.kind,
            dueAt: recruitmentFollowUpTasks.dueAt,
            status: recruitmentFollowUpTasks.status,
            notes: recruitmentFollowUpTasks.notes,
            completedAt: recruitmentFollowUpTasks.completedAt,
            firstName: cvApplications.firstName,
            lastName: cvApplications.lastName,
            specialty: cvApplications.specialty,
            email: cvApplications.email
          }).from(recruitmentFollowUpTasks).innerJoin(cvApplications, eq11(recruitmentFollowUpTasks.applicationId, cvApplications.id)).where(whereClause).orderBy(recruitmentFollowUpTasks.dueAt).limit(200);
        }),
        update: adminProcedure.input(z4.object({ id: z4.number().int().positive(), status: z4.enum(["suggested", "completed", "dismissed"]), notes: z4.string().trim().max(2e3).optional() })).mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          const [task] = await db.select().from(recruitmentFollowUpTasks).where(eq11(recruitmentFollowUpTasks.id, input.id)).limit(1);
          if (!task) throw new TRPCError5({ code: "NOT_FOUND", message: "Relance introuvable" });
          await db.update(recruitmentFollowUpTasks).set({
            status: input.status,
            notes: input.notes ?? task.notes,
            completedAt: input.status === "suggested" ? null : /* @__PURE__ */ new Date(),
            completedByOpenId: input.status === "suggested" ? null : ctx.user.openId,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(eq11(recruitmentFollowUpTasks.id, input.id));
          await logRecruitmentAction({ applicationId: task.applicationId, adminOpenId: ctx.user.openId, action: "status_update", metadata: { event: "follow_up", taskId: task.id, status: input.status } });
          return { success: true };
        })
      }),
      offerTemplates: router({
        list: adminProcedure.query(async () => {
          const db = await getDb();
          if (!db) return [];
          return db.select().from(recruitmentOfferTemplates).orderBy(desc3(recruitmentOfferTemplates.updatedAt)).limit(100);
        }),
        create: adminProcedure.input(z4.object({ name: z4.string().trim().min(3).max(180), category: z4.enum(["europe", "canada", "middle_east", "vvip_offshore", "paramedical", "general"]), language: z4.enum(["fr", "en"]), subject: z4.string().trim().min(3).max(255), body: z4.string().trim().min(10).max(8e3) })).mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          const [result] = await db.insert(recruitmentOfferTemplates).values({ ...input, createdByOpenId: ctx.user.openId }).returning({ id: recruitmentOfferTemplates.id });
          return { success: true, id: Number(result.id) };
        }),
        update: adminProcedure.input(z4.object({ id: z4.number().int().positive(), name: z4.string().trim().min(3).max(180), category: z4.enum(["europe", "canada", "middle_east", "vvip_offshore", "paramedical", "general"]), language: z4.enum(["fr", "en"]), subject: z4.string().trim().min(3).max(255), body: z4.string().trim().min(10).max(8e3), active: z4.number().int().min(0).max(1) })).mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          await db.update(recruitmentOfferTemplates).set({ ...input, updatedAt: /* @__PURE__ */ new Date() }).where(eq11(recruitmentOfferTemplates.id, input.id));
          return { success: true };
        })
      }),
      exportCsv: adminProcedure.input(z4.object({ type: z4.enum(["pool", "shortlist"]), briefId: z4.number().int().positive().optional(), candidateIds: z4.array(z4.number().int().positive()).max(200).optional().default([]) })).mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        let candidateIds = input.candidateIds;
        if (input.type === "shortlist") {
          if (!input.briefId) throw new TRPCError5({ code: "BAD_REQUEST", message: "Une mission est requise pour exporter une shortlist." });
          const associations = await db.select({ applicationId: clientBriefCandidates.applicationId }).from(clientBriefCandidates).where(and9(eq11(clientBriefCandidates.briefId, input.briefId), eq11(clientBriefCandidates.status, "shortlisted")));
          candidateIds = associations.map((association) => association.applicationId);
        }
        const conditions = [sql2`${cvApplications.status} NOT IN ('rejected', 'archived')`];
        if (candidateIds.length) conditions.push(inArray4(cvApplications.id, candidateIds));
        if (input.type === "pool") {
          conditions.push(eq11(cvApplications.marketingConsent, 1), isNull3(cvApplications.marketingUnsubscribedAt), isNull3(cvApplications.marketingSuppressedAt));
        }
        const rows = await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, lastName: cvApplications.lastName, email: cvApplications.email, phone: cvApplications.phone, specialty: cvApplications.specialty, targetCountries: cvApplications.targetCountries, languages: cvApplications.languages, yearsExperience: cvApplications.yearsExperience, availability: cvApplications.availability, mobility: cvApplications.mobility, certifications: cvApplications.certifications, aiScore: cvApplications.aiScore, status: cvApplications.status }).from(cvApplications).where(and9(...conditions)).orderBy(desc3(cvApplications.aiScore), desc3(cvApplications.createdAt)).limit(200);
        const header = ["Pr\xE9nom", "Nom", "Email", "T\xE9l\xE9phone", "Sp\xE9cialit\xE9", "Pays cibl\xE9s", "Langues", "Exp\xE9rience (ans)", "Disponibilit\xE9", "Mobilit\xE9", "Certifications", "Score IA", "Statut"];
        const csv = [header.map(csvCell).join(";"), ...rows.map((row) => [row.firstName, row.lastName, row.email, row.phone, row.specialty, row.targetCountries, row.languages, row.yearsExperience, row.availability, row.mobility, row.certifications, row.aiScore, row.status].map(csvCell).join(";"))].join("\n");
        await Promise.all(rows.map((row) => logRecruitmentAction({ applicationId: row.id, adminOpenId: ctx.user.openId, action: "export", metadata: { type: input.type, briefId: input.briefId || null } })));
        return { filename: `${input.type}-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`, csv, count: rows.length };
      }),
      profiles: router({
        list: adminProcedure.query(async () => {
          const db = await getDb();
          if (!db) return [];
          return db.select().from(recruitmentMatchProfiles).where(eq11(recruitmentMatchProfiles.active, 1)).orderBy(desc3(recruitmentMatchProfiles.updatedAt));
        }),
        create: adminProcedure.input(z4.object({
          name: z4.string().trim().min(1).max(160),
          targetCountry: z4.string().trim().max(120).optional(),
          specialty: z4.string().trim().max(160).optional(),
          minimumScore: z4.number().int().min(0).max(100).default(0),
          requiredLanguages: z4.array(z4.string().trim().min(1).max(80)).max(12).default([]),
          requiredSkills: z4.array(z4.string().trim().min(1).max(120)).max(30).default([])
        })).mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          const result = await db.insert(recruitmentMatchProfiles).values({
            name: input.name,
            targetCountry: input.targetCountry || null,
            specialty: input.specialty || null,
            minimumScore: input.minimumScore,
            requiredLanguages: JSON.stringify(input.requiredLanguages),
            requiredSkills: JSON.stringify(input.requiredSkills)
          }).returning({ id: recruitmentMatchProfiles.id });
          return { success: true, id: Number(result[0]?.id || 0) };
        }),
        delete: adminProcedure.input(z4.object({ id: z4.number().int().positive() })).mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          await db.update(recruitmentMatchProfiles).set({ active: 0, updatedAt: /* @__PURE__ */ new Date() }).where(eq11(recruitmentMatchProfiles.id, input.id));
          return { success: true };
        })
      }),
      updateStatus: adminProcedure.input(
        z4.object({
          id: z4.number(),
          status: z4.enum(CV_APPLICATION_STATUSES),
          adminNotes: z4.string().trim().max(5e3).optional()
        })
      ).mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        await db.update(cvApplications).set({ status: input.status, adminNotes: input.adminNotes ?? null, updatedAt: /* @__PURE__ */ new Date() }).where(eq11(cvApplications.id, input.id));
        await logRecruitmentAction({ applicationId: input.id, adminOpenId: ctx.user.openId, action: "status_update", metadata: { status: input.status } });
        return { success: true };
      }),
      getDownloadUrl: adminProcedure.input(z4.object({ id: z4.number() })).mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const [application] = await db.select({ cvFileKey: cvApplications.cvFileKey, cvOriginalName: cvApplications.cvOriginalName, status: cvApplications.status, fileValidationStatus: cvApplications.fileValidationStatus }).from(cvApplications).where(eq11(cvApplications.id, input.id)).limit(1);
        if (!application) throw new TRPCError5({ code: "NOT_FOUND", message: "Candidature introuvable" });
        if (!canAdminDownloadCv(application)) {
          throw new TRPCError5({ code: "NOT_FOUND", message: CV_DOWNLOAD_UNAVAILABLE_MESSAGE });
        }
        await logRecruitmentAction({ applicationId: input.id, adminOpenId: ctx.user.openId, action: "download", metadata: { fileName: application.cvOriginalName } });
        const signedUrl = await storageGetSignedUrl(application.cvFileKey);
        return { url: signedUrl, fileName: application.cvOriginalName };
      }),
      reanalyze: adminProcedure.input(z4.object({ id: z4.number() })).mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const [application] = await db.select({
          id: cvApplications.id,
          firstName: cvApplications.firstName,
          lastName: cvApplications.lastName,
          specialty: cvApplications.specialty,
          targetCountries: cvApplications.targetCountries,
          languages: cvApplications.languages,
          yearsExperience: cvApplications.yearsExperience,
          message: cvApplications.message,
          cvFileKey: cvApplications.cvFileKey,
          cvMimeType: cvApplications.cvMimeType
        }).from(cvApplications).where(eq11(cvApplications.id, input.id)).limit(1);
        if (!application) throw new TRPCError5({ code: "NOT_FOUND", message: "Candidature introuvable" });
        const { enqueueCvAnalysis: enqueueCvAnalysis2 } = await Promise.resolve().then(() => (init_recruitmentProcessing(), recruitmentProcessing_exports));
        await enqueueCvAnalysis2(application.id);
        await logRecruitmentAction({ applicationId: application.id, adminOpenId: ctx.user.openId, action: "reanalyze", metadata: { queued: true } });
        return { success: true, queued: true };
      }),
      reanalyzeFailed: adminProcedure.input(z4.object({ limit: z4.number().int().min(1).max(25).default(10) }).optional()).mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const failedApplications = await db.select({ id: cvApplications.id, trackingId: cvApplications.trackingId }).from(cvApplications).where(and9(eq11(cvApplications.analysisStatus, "failed"), ne(cvApplications.status, "rejected"), ne(cvApplications.status, "archived"))).orderBy(cvApplications.updatedAt).limit(input?.limit ?? 10);
        const { enqueueCvAnalysis: enqueueCvAnalysis2 } = await Promise.resolve().then(() => (init_recruitmentProcessing(), recruitmentProcessing_exports));
        for (const application of failedApplications) {
          await enqueueCvAnalysis2(application.id);
          await logRecruitmentAction({ applicationId: application.id, adminOpenId: ctx.user.openId, action: "reanalyze", metadata: { queued: true, batch: true } });
        }
        return { success: true, queued: failedApplications.length };
      }),
      sendTemplateEmail: adminProcedure.input(z4.object({
        id: z4.number(),
        template: z4.enum(["profile_interest", "additional_information"]),
        language: z4.enum(["fr", "en"]).optional().default("fr"),
        customRequest: z4.string().trim().max(3e3).optional()
      })).mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const [application] = await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, lastName: cvApplications.lastName, email: cvApplications.email, trackingId: cvApplications.trackingId }).from(cvApplications).where(eq11(cvApplications.id, input.id)).limit(1);
        if (!application) throw new TRPCError5({ code: "NOT_FOUND", message: "Candidature introuvable" });
        const result = await sendRecruitmentTemplateEmail(
          application.email,
          `${application.firstName} ${application.lastName}`,
          application.trackingId,
          input.template,
          { language: input.language, customRequest: input.customRequest }
        );
        await logRecruitmentAction({ applicationId: input.id, adminOpenId: ctx.user.openId, action: "email", metadata: { template: input.template, language: input.language, customRequest: input.customRequest || null, resendId: result.id } });
        return { success: true };
      }),
      erase: adminProcedure.input(z4.object({ id: z4.number() })).mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const [application] = await db.select({ id: cvApplications.id, trackingId: cvApplications.trackingId, cvFileKey: cvApplications.cvFileKey }).from(cvApplications).where(eq11(cvApplications.id, input.id)).limit(1);
        if (!application) throw new TRPCError5({ code: "NOT_FOUND", message: "Candidature introuvable" });
        const storageKeyFingerprint = createHash5("sha256").update(application.cvFileKey).digest("hex");
        await logRecruitmentAction({
          applicationId: input.id,
          adminOpenId: ctx.user.openId,
          action: "erase",
          metadata: {
            trackingId: application.trackingId,
            storageKeyFingerprint,
            storageDisposition: "dereferenced_managed_storage_no_delete_api",
            erasureMode: "manual_rgpd",
            performedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        });
        await db.delete(cvApplications).where(eq11(cvApplications.id, input.id));
        return { success: true, storageDisposition: "dereferenced", physicalDeletionAvailable: false };
      })
    }),
    // Employer mission briefs and their human-reviewed candidate associations.
    clientBriefs: router({
      list: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return db.select().from(clientBriefs).orderBy(desc3(clientBriefs.createdAt));
      }),
      updateStatus: adminProcedure.input(z4.object({ id: z4.number().int().positive(), status: z4.enum(["new", "reviewing", "shortlist_sent", "contract_signed", "closed"]) })).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        await db.update(clientBriefs).set({ status: input.status }).where(eq11(clientBriefs.id, input.id));
        return { success: true };
      }),
      candidates: adminProcedure.input(z4.object({
        briefId: z4.number().int().positive(),
        page: z4.number().int().min(0).max(1e4).default(0),
        limit: z4.number().int().min(10).max(50).default(25)
      })).query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { brief: null, candidates: [], pagination: { page: input.page, limit: input.limit, total: 0, totalPages: 0 } };
        const [brief] = await db.select().from(clientBriefs).where(eq11(clientBriefs.id, input.briefId)).limit(1);
        if (!brief) throw new TRPCError5({ code: "NOT_FOUND", message: "Brief employeur introuvable" });
        const candidateConditions = [sql2`${cvApplications.status} NOT IN ('rejected', 'archived')`];
        const [countResult] = await db.select({ total: sql2`COUNT(*)` }).from(cvApplications).where(and9(...candidateConditions));
        const applications = await db.select({
          id: cvApplications.id,
          trackingId: cvApplications.trackingId,
          firstName: cvApplications.firstName,
          lastName: cvApplications.lastName,
          specialty: cvApplications.specialty,
          targetCountries: cvApplications.targetCountries,
          certifications: cvApplications.certifications,
          normalizedCertifications: cvApplications.normalizedCertifications,
          languages: cvApplications.languages,
          normalizedLanguages: cvApplications.normalizedLanguages,
          yearsExperience: cvApplications.yearsExperience,
          availability: cvApplications.availability,
          mobility: cvApplications.mobility,
          aiScore: cvApplications.aiScore,
          status: cvApplications.status
        }).from(cvApplications).where(and9(...candidateConditions)).orderBy(desc3(cvApplications.aiScore), desc3(cvApplications.createdAt), desc3(cvApplications.id)).limit(input.limit).offset(input.page * input.limit);
        const applicationIds = applications.map((application) => application.id);
        const [certificationRows, languageRows, associations] = applicationIds.length > 0 ? await Promise.all([
          db.select({ applicationId: cvCandidateCertifications.applicationId, name: cvCandidateCertifications.name }).from(cvCandidateCertifications).where(inArray4(cvCandidateCertifications.applicationId, applicationIds)),
          db.select({ applicationId: cvCandidateLanguages.applicationId, language: cvCandidateLanguages.language }).from(cvCandidateLanguages).where(inArray4(cvCandidateLanguages.applicationId, applicationIds)),
          db.select().from(clientBriefCandidates).where(and9(eq11(clientBriefCandidates.briefId, brief.id), inArray4(clientBriefCandidates.applicationId, applicationIds)))
        ]) : [[], [], []];
        const certificationsByApplication = /* @__PURE__ */ new Map();
        for (const certification of certificationRows) {
          certificationsByApplication.set(certification.applicationId, [
            ...certificationsByApplication.get(certification.applicationId) || [],
            certification.name
          ]);
        }
        const languagesByApplication = /* @__PURE__ */ new Map();
        for (const language of languageRows) {
          languagesByApplication.set(language.applicationId, [
            ...languagesByApplication.get(language.applicationId) || [],
            language.language
          ]);
        }
        const associationByApplication = new Map(associations.map((association) => [association.applicationId, association]));
        const candidates = applications.map((application) => ({
          ...application,
          match: computeBriefCandidateMatch(brief, {
            ...application,
            certificationNames: certificationsByApplication.get(application.id) || [],
            languageNames: languagesByApplication.get(application.id) || []
          }),
          association: associationByApplication.get(application.id) ?? null
        }));
        const total = Number(countResult?.total || 0);
        return { brief, candidates, pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) } };
      }),
      associateCandidate: adminProcedure.input(z4.object({
        briefId: z4.number().int().positive(),
        applicationId: z4.number().int().positive(),
        matchScore: z4.number().int().min(0).max(100).optional(),
        status: z4.enum(["suggested", "reviewing", "shortlisted", "declined"]).default("suggested"),
        notes: z4.string().trim().max(5e3).optional()
      })).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const [existing] = await db.select().from(clientBriefCandidates).where(and9(eq11(clientBriefCandidates.briefId, input.briefId), eq11(clientBriefCandidates.applicationId, input.applicationId))).limit(1);
        if (existing) {
          await db.update(clientBriefCandidates).set({
            matchScore: input.matchScore ?? existing.matchScore,
            status: input.status,
            notes: input.notes ?? existing.notes,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(eq11(clientBriefCandidates.id, existing.id));
        } else {
          await db.insert(clientBriefCandidates).values({
            briefId: input.briefId,
            applicationId: input.applicationId,
            matchScore: input.matchScore ?? null,
            status: input.status,
            notes: input.notes ?? null
          });
        }
        return { success: true };
      })
    }),
    candidateDocuments: router({
      list: adminProcedure.input(z4.object({
        status: z4.enum(["uploaded", "validating", "analyzing", "needs_review", "reviewed", "rejected", "archived"]).optional(),
        limit: z4.number().int().min(1).max(100).default(50)
      })).query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = input.status ? eq11(candidateDocuments.status, input.status) : void 0;
        return db.select({
          id: candidateDocuments.id,
          candidateId: candidateDocuments.candidateId,
          candidateEmail: candidateAccounts.email,
          firstName: candidateAccounts.firstName,
          lastName: candidateAccounts.lastName,
          category: candidateDocuments.category,
          categoryOtherLabel: candidateDocuments.categoryOtherLabel,
          originalName: candidateDocuments.originalName,
          mimeType: candidateDocuments.mimeType,
          sizeBytes: candidateDocuments.sizeBytes,
          validationStatus: candidateDocuments.validationStatus,
          status: candidateDocuments.status,
          analysisStatus: candidateDocuments.analysisStatus,
          aiSummary: candidateDocuments.aiSummary,
          aiExtractedData: candidateDocuments.aiExtractedData,
          aiConfidence: candidateDocuments.aiConfidence,
          aiFlags: candidateDocuments.aiFlags,
          aiModel: candidateDocuments.aiModel,
          reviewNotes: candidateDocuments.reviewNotes,
          createdAt: candidateDocuments.createdAt,
          analyzedAt: candidateDocuments.analyzedAt
        }).from(candidateDocuments).innerJoin(candidateAccounts, eq11(candidateDocuments.candidateId, candidateAccounts.id)).where(conditions).orderBy(desc3(candidateDocuments.createdAt)).limit(input.limit);
      }),
      review: adminProcedure.input(z4.object({ id: z4.number().int().positive(), status: z4.enum(["reviewed", "rejected", "archived"]), notes: z4.string().trim().min(1).max(5e3) })).mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR", message: "Le coffre documentaire est temporairement indisponible." });
        const document = (await db.select().from(candidateDocuments).where(eq11(candidateDocuments.id, input.id)).limit(1))[0];
        if (!document) throw new TRPCError5({ code: "NOT_FOUND", message: "Document introuvable." });
        await db.update(candidateDocuments).set({ status: input.status, reviewedByOpenId: ctx.user.openId, reviewedAt: /* @__PURE__ */ new Date(), reviewNotes: input.notes }).where(eq11(candidateDocuments.id, input.id));
        await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "admin", actorReference: ctx.user.openId, action: "reviewed", metadata: JSON.stringify({ status: input.status }) });
        return { success: true };
      }),
      reanalyze: adminProcedure.input(z4.object({ id: z4.number().int().positive() })).mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR", message: "Le coffre documentaire est temporairement indisponible." });
        const document = (await db.select().from(candidateDocuments).where(eq11(candidateDocuments.id, input.id)).limit(1))[0];
        if (!document) throw new TRPCError5({ code: "NOT_FOUND", message: "Document introuvable." });
        if (!canRequestCandidateDocumentReanalysis(document)) {
          throw new TRPCError5({ code: document.status === "rejected" ? "BAD_REQUEST" : "CONFLICT", message: document.status === "rejected" ? "Un document refus\xE9 ne peut pas \xEAtre relanc\xE9." : "Une analyse de ce document est d\xE9j\xE0 en cours." });
        }
        const { enqueueCandidateDocumentAnalysis: enqueueCandidateDocumentAnalysis2 } = await Promise.resolve().then(() => (init_candidateDocumentProcessing(), candidateDocumentProcessing_exports));
        await enqueueCandidateDocumentAnalysis2(document.id);
        await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "admin", actorReference: ctx.user.openId, action: "analysis_requested", metadata: JSON.stringify({ source: "admin_reanalysis" }) });
        return { success: true, queued: true };
      }),
      download: adminProcedure.input(z4.object({ id: z4.number().int().positive() })).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR", message: "Le coffre documentaire est temporairement indisponible." });
        const document = (await db.select().from(candidateDocuments).where(eq11(candidateDocuments.id, input.id)).limit(1))[0];
        if (!document) throw new TRPCError5({ code: "NOT_FOUND", message: "Document introuvable." });
        return { url: `/api/admin/candidate-documents/${document.id}/download`, filename: document.originalName };
      })
    }),
    // List all contact messages
    contacts: router({
      list: adminProcedure.input(
        z4.object({
          limit: z4.number().min(1).max(100).optional().default(50),
          offset: z4.number().min(0).optional().default(0)
        })
      ).query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { items: [], total: 0 };
        const items = await db.select().from(contactMessages).orderBy(desc3(contactMessages.createdAt)).limit(input.limit).offset(input.offset);
        const countResult = await db.select({ count: sql2`COUNT(*)` }).from(contactMessages);
        return { items, total: countResult[0]?.count || 0 };
      }),
      markRead: adminProcedure.input(z4.object({ id: z4.number() })).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        await db.update(contactMessages).set({ read: 1 }).where(eq11(contactMessages.id, input.id));
        return { success: true };
      })
    }),
    // List all GDPR requests
    gdprRequests: router({
      list: adminProcedure.input(
        z4.object({
          limit: z4.number().min(1).max(100).optional().default(50),
          offset: z4.number().min(0).optional().default(0)
        })
      ).query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { items: [], total: 0 };
        const items = await db.select().from(gdprRequests).orderBy(desc3(gdprRequests.createdAt)).limit(input.limit).offset(input.offset);
        const countResult = await db.select({ count: sql2`COUNT(*)` }).from(gdprRequests);
        return { items, total: countResult[0]?.count || 0 };
      }),
      updateStatus: adminProcedure.input(
        z4.object({
          id: z4.number(),
          status: z4.enum(["pending", "in_progress", "completed", "rejected"]),
          notes: z4.string().optional()
        })
      ).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const updateData = { status: input.status };
        if (input.notes) updateData.notes = input.notes;
        if (input.status === "completed") updateData.responseDate = /* @__PURE__ */ new Date();
        await db.update(gdprRequests).set(updateData).where(eq11(gdprRequests.id, input.id));
        return { success: true };
      })
    }),
    // Dashboard stats
    stats: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { appointments: 0, contacts: 0, gdpr: 0, revenue: 0 };
      const [aptCount] = await db.select({ count: sql2`COUNT(*)` }).from(appointments);
      const [contactCount] = await db.select({ count: sql2`COUNT(*)` }).from(contactMessages);
      const [gdprCount] = await db.select({ count: sql2`COUNT(*)` }).from(gdprRequests);
      const [revenueResult] = await db.select({ total: sql2`COALESCE(SUM(CAST(final_price AS DECIMAL(10,2))), 0)` }).from(appointments).where(eq11(appointments.paymentStatus, "completed"));
      return {
        appointments: aptCount?.count || 0,
        contacts: contactCount?.count || 0,
        gdpr: gdprCount?.count || 0,
        revenue: revenueResult?.total || 0
      };
    }),
    // Manage testimonials
    testimonials: router({
      list: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(testimonials).orderBy(desc3(testimonials.createdAt));
      }),
      updateStatus: adminProcedure.input(
        z4.object({
          id: z4.number(),
          status: z4.enum(["pending", "approved", "rejected"]),
          featured: z4.number().optional()
        })
      ).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const updateData = { status: input.status };
        if (input.featured !== void 0) updateData.featured = input.featured;
        await db.update(testimonials).set(updateData).where(eq11(testimonials.id, input.id));
        return { success: true };
      }),
      delete: adminProcedure.input(z4.object({ id: z4.number() })).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        await db.delete(testimonials).where(eq11(testimonials.id, input.id));
        return { success: true };
      })
    }),
    // Blog management
    blog: router({
      list: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(blogPosts).orderBy(desc3(blogPosts.createdAt));
      }),
      create: adminProcedure.input(
        z4.object({
          title: z4.string().min(1).max(500),
          slug: z4.string().min(1).max(255),
          excerpt: z4.string().optional(),
          content: z4.string().min(1),
          coverImage: z4.string().optional(),
          category: z4.string().default("general"),
          language: z4.string().default("fr"),
          source: z4.string().optional(),
          published: z4.number().default(0)
        })
      ).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        await db.insert(blogPosts).values(input);
        return { success: true };
      }),
      update: adminProcedure.input(
        z4.object({
          id: z4.number(),
          title: z4.string().optional(),
          excerpt: z4.string().optional(),
          content: z4.string().optional(),
          coverImage: z4.string().optional(),
          category: z4.string().optional(),
          language: z4.string().optional(),
          source: z4.string().optional(),
          published: z4.number().optional()
        })
      ).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const { id, ...data } = input;
        await db.update(blogPosts).set(data).where(eq11(blogPosts.id, id));
        return { success: true };
      }),
      delete: adminProcedure.input(z4.object({ id: z4.number() })).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        await db.delete(blogPosts).where(eq11(blogPosts.id, input.id));
        return { success: true };
      })
    }),
    // Availability management
    availability: router({
      listSlots: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(availabilitySlots);
      }),
      addSlot: adminProcedure.input(
        z4.object({
          dayOfWeek: z4.number().min(0).max(6),
          startTime: z4.string().regex(/^\d{2}:\d{2}$/),
          endTime: z4.string().regex(/^\d{2}:\d{2}$/)
        })
      ).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        await db.insert(availabilitySlots).values(input);
        return { success: true };
      }),
      deleteSlot: adminProcedure.input(z4.object({ id: z4.number() })).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        await db.delete(availabilitySlots).where(eq11(availabilitySlots.id, input.id));
        return { success: true };
      }),
      listBlockedDates: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(blockedDates);
      }),
      addBlockedDate: adminProcedure.input(
        z4.object({
          date: z4.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          reason: z4.string().optional()
        })
      ).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        await db.insert(blockedDates).values(input);
        return { success: true };
      }),
      removeBlockedDate: adminProcedure.input(z4.object({ id: z4.number() })).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        await db.delete(blockedDates).where(eq11(blockedDates.id, input.id));
        return { success: true };
      })
    })
  })
});

// server/_core/index.ts
init_storage();
init_notification();
init_recruitmentFileValidation();
init_db();
init_schema();
import { eq as eq14, sql as sql4 } from "drizzle-orm";

// server/candidateDocumentValidation.ts
import { createHash as createHash6 } from "node:crypto";
var PDF_SIGNATURE2 = Buffer.from("%PDF-");
var OLE_SIGNATURE2 = Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]);
var ZIP_SIGNATURE2 = Buffer.from([80, 75, 3, 4]);
var PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
var JPEG_PREFIX = Buffer.from([255, 216, 255]);
var CANDIDATE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
var candidateDocumentMimeTypes = /* @__PURE__ */ new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png"
]);
var expectedExtensions = {
  "application/pdf": ["pdf"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"]
};
function safeCandidateDocumentName(value) {
  const safe = value.normalize("NFKC").replace(/[\\/\0]/g, "_").replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\.{2,}/g, ".").trim().slice(0, 180);
  return safe || "document";
}
function validatePdf(buffer) {
  const source = buffer.toString("latin1");
  if (/\/Encrypt\b/.test(source)) throw new Error("candidate_document_pdf_encrypted");
  if (/(?:\/JavaScript\b|\/JS\b|\/Launch\b|\/OpenAction\b|\/EmbeddedFile\b)/.test(source)) throw new Error("candidate_document_pdf_active_content");
  const pageCount = (source.match(/\/Type\s*\/Page\b/g) ?? []).length;
  if (pageCount === 0 || pageCount > 25) throw new Error("candidate_document_pdf_page_limit");
}
function validateDocx(buffer) {
  const container = buffer.toString("latin1", 0, Math.min(buffer.length, 256 * 1024));
  if (!container.includes("[Content_Types].xml")) throw new Error("candidate_document_docx_container_invalid");
  if (/(?:vbaProject\.bin|TargetMode="External"|word\/embeddings\/)/i.test(container)) throw new Error("candidate_document_docx_active_content");
}
function hasExpectedSignature(buffer, mimeType) {
  if (mimeType === "application/pdf") return buffer.subarray(0, PDF_SIGNATURE2.length).equals(PDF_SIGNATURE2);
  if (mimeType === "application/msword") return buffer.subarray(0, OLE_SIGNATURE2.length).equals(OLE_SIGNATURE2);
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return buffer.subarray(0, ZIP_SIGNATURE2.length).equals(ZIP_SIGNATURE2);
  if (mimeType === "image/jpeg") return buffer.subarray(0, JPEG_PREFIX.length).equals(JPEG_PREFIX);
  if (mimeType === "image/png") return buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  return false;
}
function validateCandidateDocument(input) {
  const originalName = safeCandidateDocumentName(input.originalName);
  const extension = originalName.toLowerCase().split(".").pop();
  if (!candidateDocumentMimeTypes.has(input.mimeType) || !expectedExtensions[input.mimeType]?.includes(extension ?? "")) throw new Error("candidate_document_type_mismatch");
  if (input.size < 256 || input.size > CANDIDATE_DOCUMENT_MAX_BYTES || input.buffer.length !== input.size) throw new Error("candidate_document_size_invalid");
  if (!hasExpectedSignature(input.buffer, input.mimeType)) throw new Error("candidate_document_signature_invalid");
  if (input.mimeType === "application/pdf") validatePdf(input.buffer);
  if (input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") validateDocx(input.buffer);
  const warnings = input.mimeType === "application/msword" ? ["legacy_doc_format_limited_security_inspection"] : [];
  return {
    checksum: createHash6("sha256").update(input.buffer).digest("hex"),
    notes: ["signature_verified", `mime=${input.mimeType}`, `bytes=${input.size}`, "security_scan=candidate-document-safety-v1", ...warnings].join("; "),
    mimeType: input.mimeType,
    securityScanVersion: "candidate-document-safety-v1",
    warnings
  };
}

// server/_core/index.ts
init_candidateAuth();
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
var RECRUITMENT_MAX_FILE_SIZE = 5 * 1024 * 1024;
var RECRUITMENT_MAX_TARGET_COUNTRIES = 18;
var RECRUITMENT_ALLOWED_MIME_TYPES = /* @__PURE__ */ new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);
var PUBLIC_APP_ORIGIN = process.env.PUBLIC_APP_ORIGIN || "https://drahmedbenlallahom.com";
var recruitmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RECRUITMENT_MAX_FILE_SIZE, files: 1, fields: 20 },
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLowerCase().split(".").pop();
    const allowedExtension = extension === "pdf" || extension === "doc" || extension === "docx";
    if (!allowedExtension || !RECRUITMENT_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new Error("Format de CV non accept\xE9. Utilisez PDF, DOC ou DOCX."));
      return;
    }
    callback(null, true);
  }
});
var candidateDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CANDIDATE_DOCUMENT_MAX_BYTES, files: 1, fields: 8 },
  fileFilter: (_req, file, callback) => {
    if (!candidateDocumentMimeTypes.has(file.mimetype)) {
      callback(new Error("Format de document non accept\xE9."));
      return;
    }
    callback(null, true);
  }
});
var recruitmentApplicationSchema = z5.object({
  firstName: z5.string().trim().min(1).max(120),
  lastName: z5.string().trim().min(1).max(120),
  email: z5.string().trim().email().max(320),
  phone: z5.string().trim().max(50).optional().default(""),
  specialty: z5.string().trim().min(1).max(160),
  diplomaCountry: z5.string().trim().min(1).max(100),
  targetCountries: z5.array(z5.string().trim().min(1).max(80)).min(1).max(RECRUITMENT_MAX_TARGET_COUNTRIES),
  languages: z5.array(z5.string().trim().min(1).max(80)).max(12).default([]),
  yearsExperience: z5.number().int().min(0).max(70).optional(),
  availability: z5.string().trim().max(100).optional().default(""),
  mobility: z5.string().trim().max(150).optional().default(""),
  certifications: z5.string().trim().max(1e3).optional().default(""),
  message: z5.string().trim().max(5e3).optional().default(""),
  gdprConsent: z5.literal("1"),
  marketingConsent: z5.enum(["0", "1"]).default("0"),
  website: z5.string().max(200).optional().default(""),
  turnstileToken: z5.string().min(20).max(4096)
});
function parseListField(value) {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === "string");
  } catch {
  }
  return [];
}
function safeFileName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "cv";
}
async function createApp() {
  const app = express2();
  app.set("trust proxy", 1);
  const server = createServer(app);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    res.setHeader("Content-Security-Policy", [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' ws: wss: https://api.stripe.com https://challenges.cloudflare.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests"
    ].join("; "));
    next();
  });
  app.post("/api/stripe/webhook", express2.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    let event;
    try {
      const Stripe2 = (await import("stripe")).default;
      const stripe = new Stripe2(process.env.STRIPE_SECRET_KEY || "");
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (error) {
      console.error("Stripe webhook signature validation failed", error);
      return res.status(400).json({ error: "Invalid webhook" });
    }
    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        console.log("Payment successful:", session.id);
        const { getDb: getDb2 } = await Promise.resolve().then(() => (init_db(), db_exports));
        const { appointments: appointments2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
        const { eq: eq15 } = await import("drizzle-orm");
        const db = await getDb2();
        if (!db) throw new Error("Database connection failed");
        const trackingId = session.metadata?.trackingId;
        if (!trackingId) {
          console.error("Stripe webhook rejected: missing appointment reference");
          return res.status(400).json({ error: "Invalid webhook" });
        }
        const appointmentResult = await db.select().from(appointments2).where(eq15(appointments2.trackingId, trackingId)).limit(1);
        const appointment = appointmentResult[0];
        if (!appointment) {
          console.error("Stripe webhook rejected: appointment not found");
          return res.status(400).json({ error: "Invalid webhook" });
        }
        const { enqueueAppointmentFulfillment: enqueueAppointmentFulfillment2 } = await Promise.resolve().then(() => (init_appointmentFulfillment(), appointmentFulfillment_exports));
        if (appointment.paymentStatus === "completed") {
          await enqueueAppointmentFulfillment2(appointment.id);
          return res.json({ received: true, duplicate: true });
        }
        const paidAmount = Number(session.amount_total);
        const expectedAmount = Math.round(Number(appointment.finalPrice) * 100);
        if (!Number.isFinite(paidAmount) || paidAmount !== expectedAmount) {
          console.error("Stripe webhook rejected: amount mismatch");
          return res.status(400).json({ error: "Invalid webhook" });
        }
        await db.update(appointments2).set({
          paymentStatus: "completed",
          appointmentStatus: "confirmed",
          holdExpiresAt: null,
          stripePaymentIntentId: session.payment_intent
        }).where(eq15(appointments2.trackingId, trackingId));
        console.log(`Payment confirmed for appointment: ${trackingId}`);
        await enqueueAppointmentFulfillment2(appointment.id);
      } else if (event.type === "checkout.session.expired") {
        const session = event.data.object;
        const trackingId = session.metadata?.trackingId;
        if (trackingId) {
          const { getDb: getDb2 } = await Promise.resolve().then(() => (init_db(), db_exports));
          const { appointments: appointments2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
          const { and: and12, eq: eq15 } = await import("drizzle-orm");
          const { getExpiredAppointmentHoldUpdate: getExpiredAppointmentHoldUpdate2 } = await Promise.resolve().then(() => (init_appointmentHolds(), appointmentHolds_exports));
          const db = await getDb2();
          if (!db) throw new Error("Database connection failed");
          await db.update(appointments2).set(getExpiredAppointmentHoldUpdate2()).where(
            and12(
              eq15(appointments2.trackingId, trackingId),
              eq15(appointments2.stripeSessionId, session.id),
              eq15(appointments2.paymentStatus, "pending"),
              eq15(appointments2.appointmentStatus, "held")
            )
          );
        }
      }
      res.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook processing failed", error);
      res.status(500).json({ received: false });
    }
  });
  app.post("/api/webhooks/resend", express2.raw({ type: "application/json" }), async (req, res) => {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(503).send("Resend webhook is not configured");
      return;
    }
    try {
      const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
      const event = new Webhook(webhookSecret).verify(payload, {
        "svix-id": String(req.headers["svix-id"] || ""),
        "svix-timestamp": String(req.headers["svix-timestamp"] || ""),
        "svix-signature": String(req.headers["svix-signature"] || "")
      });
      const providerEventId = String(req.headers["svix-id"] || "");
      if (!providerEventId || !event.type) {
        res.status(400).send("Invalid Resend webhook payload");
        return;
      }
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const [alreadyRecorded] = await db.select({ id: recruitmentEmailEvents.id }).from(recruitmentEmailEvents).where(eq14(recruitmentEmailEvents.providerEventId, providerEventId)).limit(1);
      if (alreadyRecorded) {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }
      const data = event.data || {};
      const providerEmailId = typeof data.email_id === "string" ? data.email_id : null;
      const recipientEmail = Array.isArray(data.to) && typeof data.to[0] === "string" ? data.to[0].toLowerCase() : null;
      const statusByEvent = {
        "email.sent": "sent",
        "email.delivered": "delivered",
        "email.delivery_delayed": "delayed",
        "email.bounced": "bounced",
        "email.complained": "complained",
        "email.failed": "failed",
        "email.suppressed": "suppressed"
      };
      const deliveryStatus = statusByEvent[event.type];
      const recipients = providerEmailId ? await db.select().from(recruitmentCampaignRecipients).where(eq14(recruitmentCampaignRecipients.providerEmailId, providerEmailId)).limit(5) : [];
      const recipient = recipients[0];
      const occurredAt = event.created_at && Number.isFinite(new Date(event.created_at).getTime()) ? new Date(event.created_at) : /* @__PURE__ */ new Date();
      await db.insert(recruitmentEmailEvents).values({
        providerEventId,
        providerEmailId,
        campaignRecipientId: recipient?.id || null,
        applicationId: recipient?.applicationId || null,
        eventType: event.type,
        recipientEmail,
        payload: payload.slice(0, 2e4),
        occurredAt
      });
      if (recipient && deliveryStatus) {
        await db.update(recruitmentCampaignRecipients).set({
          deliveryStatus,
          error: deliveryStatus === "bounced" || deliveryStatus === "failed" ? String(data.bounce?.message || data.error?.message || data.error || "Email delivery failed").slice(0, 2e3) : null,
          deliveredAt: deliveryStatus === "delivered" ? occurredAt : recipient.deliveredAt,
          lastEventAt: occurredAt
        }).where(eq14(recruitmentCampaignRecipients.id, recipient.id));
        if (["bounced", "complained", "suppressed"].includes(deliveryStatus)) {
          await db.update(cvApplications).set({ marketingConsent: 0, marketingSuppressedAt: occurredAt, updatedAt: /* @__PURE__ */ new Date() }).where(eq14(cvApplications.id, recipient.applicationId));
        }
      }
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Resend webhook verification failed:", error);
      res.status(400).send("Invalid Resend webhook");
    }
  });
  app.use(express2.json({ limit: "1mb" }));
  app.use(express2.urlencoded({ limit: "1mb", extended: true }));
  const clientBriefSchema = z5.object({
    organizationName: z5.string().trim().min(1).max(180),
    contactName: z5.string().trim().min(1).max(120),
    email: z5.string().trim().email().max(320),
    phone: z5.string().trim().max(50).optional().default(""),
    targetEnvironment: z5.string().trim().min(1).max(120),
    specialtyNeeded: z5.string().trim().min(1).max(160),
    country: z5.string().trim().min(1).max(100),
    requiredCertifications: z5.string().trim().max(1e3).optional().default(""),
    timeline: z5.string().trim().max(100).optional().default(""),
    notes: z5.string().trim().max(3e3).optional().default(""),
    website: z5.string().max(200).optional().default("")
  });
  app.post("/api/client-briefs", async (req, res) => {
    try {
      const parsed = clientBriefSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Les informations du brief sont invalides." });
        return;
      }
      if (parsed.data.website.trim()) {
        res.status(400).json({ error: "Requ\xEAte non autoris\xE9e." });
        return;
      }
      const briefId = `BRIEF${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).slice(-6).toUpperCase()}`;
      const db = await (await Promise.resolve().then(() => (init_db(), db_exports))).getDb();
      if (!db) {
        res.status(503).json({ error: "Service temporairement indisponible." });
        return;
      }
      await db.execute(sql4`INSERT INTO client_briefs (
        brief_id, organization_name, contact_name, email, phone,
        target_environment, specialty_needed, country, required_certifications,
        timeline, notes, brief_status
      ) VALUES (
        ${briefId}, ${parsed.data.organizationName}, ${parsed.data.contactName}, ${parsed.data.email}, ${parsed.data.phone},
        ${parsed.data.targetEnvironment}, ${parsed.data.specialtyNeeded}, ${parsed.data.country}, ${parsed.data.requiredCertifications},
        ${parsed.data.timeline}, ${parsed.data.notes}, 'new'
      )`);
      try {
        await notifyOwner({
          title: `Nouveau brief employeur (${briefId})`,
          content: `Organisation: ${parsed.data.organizationName}
Contact: ${parsed.data.contactName} (${parsed.data.email})
Environnement: ${parsed.data.targetEnvironment}
Sp\xE9cialit\xE9: ${parsed.data.specialtyNeeded} (${parsed.data.country})`
        });
      } catch {
      }
      res.json({ success: true, briefId });
    } catch (error) {
      console.error("Client brief error:", error);
      res.status(500).json({ error: "\xC9chec de l'enregistrement du brief." });
    }
  });
  app.post("/api/recruitment/apply", (req, res, next) => {
    recruitmentUpload.single("cv")(req, res, async (uploadError) => {
      if (uploadError) {
        const message = uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE" ? "Le CV ne doit pas d\xE9passer 5 Mo." : uploadError.message || "Le fichier CV n\u2019a pas pu \xEAtre re\xE7u.";
        res.status(400).json({ error: message });
        return;
      }
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "Le CV est requis." });
          return;
        }
        const parsed = recruitmentApplicationSchema.safeParse({
          ...req.body,
          diplomaCountry: req.body.diplomaCountry,
          targetCountries: parseListField(req.body.targetCountries),
          languages: parseListField(req.body.languages),
          yearsExperience: req.body.yearsExperience === "" || req.body.yearsExperience === void 0 ? void 0 : Number(req.body.yearsExperience)
        });
        if (!parsed.success) {
          const targetCountriesTooMany = parsed.error.issues.some((issue) => issue.path[0] === "targetCountries" && issue.code === "too_big");
          res.status(400).json({
            error: targetCountriesTooMany ? `Vous pouvez s\xE9lectionner jusqu\u2019\xE0 ${RECRUITMENT_MAX_TARGET_COUNTRIES} pays cibl\xE9s.` : "Les informations de candidature sont invalides."
          });
          return;
        }
        if (parsed.data.website.trim()) {
          res.status(400).json({ error: "La candidature n\u2019a pas pu \xEAtre trait\xE9e." });
          return;
        }
        const { verifyCandidateTurnstile: verifyCandidateTurnstile2 } = await Promise.resolve().then(() => (init_candidateTurnstile(), candidateTurnstile_exports));
        const { enforcePersistentRateLimit: enforcePersistentRateLimit2, hashSecurityValue: hashSecurityValue2, logSecurityEvent: logSecurityEvent2 } = await Promise.resolve().then(() => (init_candidateSecurity(), candidateSecurity_exports));
        const clientIp = req.ip || "unknown";
        const ipHash = hashSecurityValue2(clientIp);
        if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
          try {
            await enforcePersistentRateLimit2({ action: "public_recruitment_apply", subject: `${clientIp}:${parsed.data.email}`, maxAttempts: 3, windowMs: 24 * 60 * 60 * 1e3, blockMs: 24 * 60 * 60 * 1e3 });
            await verifyCandidateTurnstile2({ token: parsed.data.turnstileToken, remoteIp: clientIp });
          } catch {
            await logSecurityEvent2({ actorKind: "anonymous", actorReference: parsed.data.email, category: "public_recruitment_apply_protection", outcome: "blocked", severity: "warning", ipHash });
            res.status(400).json({ error: "La v\xE9rification de s\xE9curit\xE9 doit \xEAtre renouvel\xE9e avant l\u2019envoi." });
            return;
          }
        }
        const trackingId = `CV${Math.random().toString(36).slice(2, 10).toUpperCase()}${Date.now().toString(36).slice(-8).toUpperCase()}`;
        const originalName = safeFileName(file.originalname);
        let fileValidation;
        try {
          fileValidation = validateCvFile({
            buffer: file.buffer,
            mimeType: file.mimetype,
            originalName,
            size: file.size
          });
        } catch (validationError) {
          const code = validationError instanceof Error ? validationError.message : "cv_validation_failed";
          res.status(400).json({ error: "Le contenu du CV ne correspond pas \xE0 un document PDF, DOC ou DOCX valide.", code });
          return;
        }
        const db = await (await Promise.resolve().then(() => (init_db(), db_exports))).getDb();
        if (!db) {
          res.status(503).json({ error: "Le service de candidature est temporairement indisponible." });
          return;
        }
        const [duplicate] = await db.select({ id: cvApplications.id }).from(cvApplications).where(eq14(cvApplications.fileChecksum, fileValidation.checksum)).limit(1);
        if (duplicate) {
          await logSecurityEvent2({ actorKind: "anonymous", actorReference: parsed.data.email, category: "public_recruitment_apply_duplicate_file", outcome: "blocked", severity: "info", ipHash });
          res.status(202).json({ success: true, duplicate: true });
          return;
        }
        const queuedJobs = await db.select({ id: cvProcessingJobs.id }).from(cvProcessingJobs).where(sql4`${cvProcessingJobs.status} IN ('queued', 'retry', 'running')`).limit(201);
        if (queuedJobs.length >= 200) {
          await logSecurityEvent2({ actorKind: "system", category: "public_recruitment_apply_queue_backpressure", outcome: "blocked", severity: "high", ipHash });
          res.status(503).json({ error: "Le service de candidature re\xE7oit actuellement un volume \xE9lev\xE9. Veuillez r\xE9essayer ult\xE9rieurement." });
          return;
        }
        const storageResult = await storagePut(
          `recruitment/quarantine/${trackingId}-${originalName}`,
          file.buffer,
          file.mimetype
        );
        const retentionUntil = /* @__PURE__ */ new Date();
        retentionUntil.setFullYear(retentionUntil.getFullYear() + 2);
        const insertResult = await db.execute(sql4`INSERT INTO cv_applications (
          tracking_id, first_name, last_name, email, phone, specialty, diploma_country,
          target_countries, languages, years_experience, availability, mobility, certifications, message,
          cv_file_key, cv_original_name, cv_mime_type, cv_size_bytes,
          file_validation_status, file_checksum, file_validation_notes,
          gdpr_consent, marketing_consent, status, consent_at, retention_until
        ) VALUES (
          ${trackingId}, ${parsed.data.firstName}, ${parsed.data.lastName}, ${parsed.data.email},
          ${parsed.data.phone || null}, ${parsed.data.specialty}, ${parsed.data.diplomaCountry}, ${JSON.stringify(parsed.data.targetCountries)},
          ${JSON.stringify(parsed.data.languages)}, ${parsed.data.yearsExperience ?? null},
          ${parsed.data.availability || null}, ${parsed.data.mobility || null}, ${parsed.data.certifications || null},
          ${parsed.data.message || null}, ${storageResult.key}, ${originalName}, ${file.mimetype}, ${file.size},
          'quarantined', ${fileValidation.checksum}, ${fileValidation.notes}, 1,
          ${parsed.data.marketingConsent === "1" ? 1 : 0}, 'new', NOW(), ${retentionUntil}
        ) RETURNING id`);
        const insertedId = Number(insertResult.rows[0]?.id || 0);
        const candidateName = `${parsed.data.firstName} ${parsed.data.lastName}`;
        const candidatePortalInviteUrl = insertedId ? `${PUBLIC_APP_ORIGIN}/candidate/access?invite=${encodeURIComponent(createCandidateInvitationToken(Number(insertedId)))}` : void 0;
        await Promise.allSettled([
          (async () => {
            const { sendCvApplicationConfirmationEmail: sendCvApplicationConfirmationEmail2 } = await Promise.resolve().then(() => (init_notifications(), notifications_exports));
            await sendCvApplicationConfirmationEmail2(
              parsed.data.email,
              candidateName,
              trackingId,
              parsed.data.specialty,
              parsed.data.targetCountries.join(", "),
              candidatePortalInviteUrl
            );
          })(),
          notifyOwner({
            title: `Nouvelle candidature recrutement \u2014 ${candidateName}`,
            content: `**R\xE9f\xE9rence:** ${trackingId}
**Email:** ${parsed.data.email}
**Sp\xE9cialit\xE9:** ${parsed.data.specialty}
**Pays du dipl\xF4me:** ${parsed.data.diplomaCountry}
**Pays cibl\xE9s:** ${parsed.data.targetCountries.join(", ")}
**CV:** re\xE7u et stock\xE9 de mani\xE8re priv\xE9e`
          })
        ]);
        if (insertedId) {
          const { enqueueCvAnalysis: enqueueCvAnalysis2 } = await Promise.resolve().then(() => (init_recruitmentProcessing(), recruitmentProcessing_exports));
          const { enqueueCvGoogleDriveExport: enqueueCvGoogleDriveExport2 } = await Promise.resolve().then(() => (init_googleDriveExport(), googleDriveExport_exports));
          await Promise.all([
            enqueueCvAnalysis2(Number(insertedId)),
            enqueueCvGoogleDriveExport2(Number(insertedId))
          ]);
        }
        res.status(201).json({ success: true, trackingId });
      } catch (error) {
        console.error("Recruitment application error:", error);
        res.status(500).json({ error: "La candidature n\u2019a pas pu \xEAtre enregistr\xE9e." });
      }
    });
  });
  app.post("/api/candidate/documents", (req, res) => {
    candidateDocumentUpload.single("document")(req, res, async (uploadError) => {
      if (uploadError) {
        const message = uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE" ? "Le document ne doit pas d\xE9passer 10 Mo." : uploadError.message || "Le document n\u2019a pas pu \xEAtre re\xE7u.";
        res.status(400).json({ error: message });
        return;
      }
      try {
        const { getCandidateSession: getCandidateSession2 } = await Promise.resolve().then(() => (init_candidatePortalRouter(), candidatePortalRouter_exports));
        const candidate = await getCandidateSession2(req);
        if (!candidate) {
          res.status(401).json({ error: "Votre session a expir\xE9. Veuillez vous reconnecter." });
          return;
        }
        const parsed = z5.object({
          category: z5.enum(["identity_document", "medical_license", "diploma", "certificate", "professional_insurance", "vaccination_record", "criminal_record", "employment_evidence", "proof_of_address", "other"]),
          categoryOtherLabel: z5.string().trim().max(160).optional(),
          turnstileToken: z5.string().min(20).max(4096)
        }).safeParse(req.body);
        const file = req.file;
        if (!file || !parsed.success || parsed.data.category === "other" && !parsed.data.categoryOtherLabel) {
          res.status(400).json({ error: "Les informations du document sont invalides." });
          return;
        }
        const { candidateRequestIp: candidateRequestIp2, verifyCandidateTurnstile: verifyCandidateTurnstile2 } = await Promise.resolve().then(() => (init_candidateTurnstile(), candidateTurnstile_exports));
        const { enforcePersistentRateLimit: enforcePersistentRateLimit2, logSecurityEvent: logSecurityEvent2, requestIpHash: requestIpHash2 } = await Promise.resolve().then(() => (init_candidateSecurity(), candidateSecurity_exports));
        const ipHash = requestIpHash2(req.headers);
        try {
          await enforcePersistentRateLimit2({ action: "candidate_document_upload", subject: `${candidate.id}:${ipHash ?? "unknown"}`, maxAttempts: 12, windowMs: 60 * 60 * 1e3, blockMs: 60 * 60 * 1e3 });
          await verifyCandidateTurnstile2({ token: parsed.data.turnstileToken, remoteIp: candidateRequestIp2(req.headers) });
        } catch {
          await logSecurityEvent2({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_document_upload_protection", outcome: "blocked", severity: "warning", ipHash });
          res.status(400).json({ error: "La v\xE9rification de s\xE9curit\xE9 doit \xEAtre renouvel\xE9e avant l\u2019envoi." });
          return;
        }
        const originalName = safeCandidateDocumentName(file.originalname);
        let validation;
        try {
          validation = validateCandidateDocument({ buffer: file.buffer, mimeType: file.mimetype, originalName, size: file.size });
        } catch (error) {
          res.status(400).json({ error: "Le document est refus\xE9 par le contr\xF4le de s\xE9curit\xE9.", code: error instanceof Error ? error.message : "candidate_document_validation_failed" });
          return;
        }
        const { encryptCandidateDocument: encryptCandidateDocument2 } = await Promise.resolve().then(() => (init_candidateDocumentEncryption(), candidateDocumentEncryption_exports));
        const encrypted = encryptCandidateDocument2(file.buffer);
        const stored = await storagePut(`candidate-documents/quarantine/${candidate.id}/${Date.now()}-${originalName}.enc`, encrypted.encrypted, "application/octet-stream");
        const db = await getDb();
        if (!db) {
          res.status(503).json({ error: "Le coffre documentaire est temporairement indisponible." });
          return;
        }
        const retentionUntil = /* @__PURE__ */ new Date();
        retentionUntil.setFullYear(retentionUntil.getFullYear() + 2);
        const result = await db.insert(candidateDocuments).values({
          candidateId: candidate.id,
          applicationId: candidate.linkedApplicationId ?? null,
          category: parsed.data.category,
          categoryOtherLabel: parsed.data.category === "other" ? parsed.data.categoryOtherLabel.trim() : null,
          originalName,
          storageKey: stored.key,
          mimeType: validation.mimeType,
          sizeBytes: file.size,
          checksum: validation.checksum,
          validationStatus: "quarantined",
          validationNotes: validation.notes,
          securityScanVersion: validation.securityScanVersion,
          malwareScanStatus: "unavailable",
          malwareScanProvider: "structural_validation_pending_private_scanner",
          encryptionAlgorithm: encrypted.algorithm,
          encryptionIv: encrypted.iv,
          encryptionAuthTag: encrypted.authTag,
          status: "uploaded",
          analysisStatus: "queued",
          retentionUntil
        }).returning({ id: candidateDocuments.id });
        const documentId = Number(result[0].id);
        await db.insert(candidateDocumentProcessingJobs).values({ documentId, status: "queued" });
        await db.insert(candidateDocumentAuditLogs).values({
          candidateId: candidate.id,
          documentId,
          actorType: "candidate",
          actorReference: String(candidate.id),
          action: "upload",
          metadata: JSON.stringify({ category: parsed.data.category, mimeType: validation.mimeType, checksum: validation.checksum })
        });
        res.status(201).json({ success: true, documentId });
      } catch (error) {
        console.error("Candidate document upload error:", error);
        res.status(500).json({ error: "Le document n\u2019a pas pu \xEAtre enregistr\xE9 dans le coffre." });
      }
    });
  });
  app.get("/api/candidate/documents/:id/download", async (req, res) => {
    try {
      const documentId = Number(req.params.id);
      if (!Number.isSafeInteger(documentId) || documentId <= 0) return res.status(400).json({ error: "Document invalide." });
      const { getCandidateSession: getCandidateSession2 } = await Promise.resolve().then(() => (init_candidatePortalRouter(), candidatePortalRouter_exports));
      const candidate = await getCandidateSession2(req);
      if (!candidate) return res.status(401).json({ error: "Votre session a expir\xE9. Veuillez vous reconnecter." });
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Le coffre documentaire est temporairement indisponible." });
      const document = (await db.select().from(candidateDocuments).where(sql4`${candidateDocuments.id} = ${documentId} AND ${candidateDocuments.candidateId} = ${candidate.id}`).limit(1))[0];
      if (!document) return res.status(404).json({ error: "Document introuvable." });
      const signedUrl = await storageGetSignedUrl(document.storageKey);
      const stored = await fetch(signedUrl);
      if (!stored.ok) throw new Error(`candidate_document_storage_read_failed_${stored.status}`);
      let content = new Uint8Array(await stored.arrayBuffer());
      if (document.encryptionAlgorithm) {
        if (document.encryptionAlgorithm !== "aes-256-gcm" || !document.encryptionIv || !document.encryptionAuthTag) throw new Error("candidate_document_encryption_metadata_invalid");
        const { decryptCandidateDocument: decryptCandidateDocument2 } = await Promise.resolve().then(() => (init_candidateDocumentEncryption(), candidateDocumentEncryption_exports));
        content = decryptCandidateDocument2(Buffer.from(content), document.encryptionIv, document.encryptionAuthTag);
      }
      await db.insert(candidateDocumentAuditLogs).values({ candidateId: candidate.id, documentId: document.id, actorType: "candidate", actorReference: String(candidate.id), action: "download" });
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader("Content-Length", String(content.byteLength));
      res.setHeader("Content-Disposition", `attachment; filename="${safeFileName(document.originalName)}"`);
      res.setHeader("Cache-Control", "no-store, private");
      res.send(content);
    } catch (error) {
      console.error("Candidate document secure download error:", error);
      res.status(500).json({ error: "Le document n\u2019a pas pu \xEAtre t\xE9l\xE9charg\xE9 de mani\xE8re s\xE9curis\xE9e." });
    }
  });
  app.get("/api/admin/candidate-documents/:id/download", async (req, res) => {
    try {
      const requestContext = await createContext({ req, res, info: {} });
      if (!requestContext.user || requestContext.user.role !== "admin") return res.status(403).json({ error: "Acc\xE8s administrateur requis." });
      const { isAdminMfaVerified: isAdminMfaVerified2 } = await Promise.resolve().then(() => (init_adminMfa(), adminMfa_exports));
      if (!await isAdminMfaVerified2(req, requestContext.user.openId)) return res.status(403).json({ error: "Double authentification requise." });
      const documentId = Number(req.params.id);
      if (!Number.isSafeInteger(documentId) || documentId <= 0) return res.status(400).json({ error: "Document invalide." });
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Le coffre documentaire est temporairement indisponible." });
      const document = (await db.select().from(candidateDocuments).where(eq14(candidateDocuments.id, documentId)).limit(1))[0];
      if (!document) return res.status(404).json({ error: "Document introuvable." });
      const signedUrl = await storageGetSignedUrl(document.storageKey);
      const stored = await fetch(signedUrl);
      if (!stored.ok) throw new Error(`candidate_document_storage_read_failed_${stored.status}`);
      let content = new Uint8Array(await stored.arrayBuffer());
      if (document.encryptionAlgorithm) {
        if (document.encryptionAlgorithm !== "aes-256-gcm" || !document.encryptionIv || !document.encryptionAuthTag) throw new Error("candidate_document_encryption_metadata_invalid");
        const { decryptCandidateDocument: decryptCandidateDocument2 } = await Promise.resolve().then(() => (init_candidateDocumentEncryption(), candidateDocumentEncryption_exports));
        content = decryptCandidateDocument2(Buffer.from(content), document.encryptionIv, document.encryptionAuthTag);
      }
      await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "admin", actorReference: requestContext.user.openId, action: "download", metadata: JSON.stringify({ mfa: true }) });
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader("Content-Length", String(content.byteLength));
      res.setHeader("Content-Disposition", `attachment; filename="${safeFileName(document.originalName)}"`);
      res.setHeader("Cache-Control", "no-store, private");
      res.send(content);
    } catch (error) {
      console.error("Admin candidate document secure download error:", error);
      res.status(500).json({ error: "Le document n\u2019a pas pu \xEAtre t\xE9l\xE9charg\xE9 de mani\xE8re s\xE9curis\xE9e." });
    }
  });
  app.get("/sitemap.xml", async (_req, res) => {
    const origin = "https://drahmedbenlallahom.com";
    const publicPaths = [
      "/",
      "/venture/novarena",
      "/venture/sawa4you",
      "/legal",
      "/gdpr",
      "/testimonials",
      "/booking",
      "/recruitment",
      "/recruitment/standard",
      "/recruitment/vvip-offshore",
      "/employers",
      "/why-hippocampus"
    ];
    const staticEntries = publicPaths.map((path2) => `<url><loc>${origin}${path2}</loc></url>`);
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticEntries.join("")}</urlset>`);
  });
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerGoogleDriveOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  app.post("/api/scheduled/reminder", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await Promise.resolve().then(() => (init_sdk(), sdk_exports));
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }
      const { getDb: getDb2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const { appointments: appointments2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { and: and12, eq: eq15, gte: gte2, lte: lte6, sql: sql5 } = await import("drizzle-orm");
      const db = await getDb2();
      if (!db) throw new Error("Database connection failed");
      const now = /* @__PURE__ */ new Date();
      const from = new Date(now.getTime() + 22 * 60 * 60 * 1e3);
      const to = new Date(now.getTime() + 26 * 60 * 60 * 1e3);
      const upcoming = await db.select().from(appointments2).where(
        and12(
          eq15(appointments2.paymentStatus, "completed"),
          eq15(appointments2.appointmentStatus, "confirmed"),
          eq15(appointments2.reminderSent, 0),
          gte2(appointments2.appointmentDate, from),
          lte6(appointments2.appointmentDate, to)
        )
      );
      console.log(`[Reminder] Found ${upcoming.length} appointments to remind`);
      const { sendReminderEmail: sendReminderEmail2 } = await Promise.resolve().then(() => (init_notifications(), notifications_exports));
      for (const apt of upcoming) {
        try {
          await sendReminderEmail2(
            apt.customerEmail,
            apt.customerName,
            apt.trackingId,
            apt.appointmentDate
          );
          await db.update(appointments2).set({ reminderSent: 1 }).where(eq15(appointments2.id, apt.id));
          console.log(`[Reminder] Sent to ${apt.customerEmail} for ${apt.trackingId}`);
        } catch (e) {
          console.error(`[Reminder] Failed for ${apt.trackingId}:`, e);
        }
      }
      res.json({ ok: true, reminded: upcoming.length });
    } catch (error) {
      console.error("[Reminder] Handler error:", error);
      res.status(500).json({ error: error.message, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
  });
  app.post("/api/scheduled/recruitment-retention", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await Promise.resolve().then(() => (init_sdk(), sdk_exports));
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const { runRecruitmentRetentionCleanup: runRecruitmentRetentionCleanup2 } = await Promise.resolve().then(() => (init_recruitmentRetention(), recruitmentRetention_exports));
      const result = await runRecruitmentRetentionCleanup2(`heartbeat:${user.taskUid}`);
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[RecruitmentRetention] Handler error:", error);
      return res.status(500).json({ error: error.message, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
  });
  app.post("/api/scheduled/recruitment-processing", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await Promise.resolve().then(() => (init_sdk(), sdk_exports));
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const { processDueCvAnalysisJobs: processDueCvAnalysisJobs2 } = await Promise.resolve().then(() => (init_recruitmentProcessing(), recruitmentProcessing_exports));
      const { processDueCvGoogleDriveExports: processDueCvGoogleDriveExports2 } = await Promise.resolve().then(() => (init_googleDriveExport(), googleDriveExport_exports));
      const analysis = await processDueCvAnalysisJobs2(2);
      const driveExports = await processDueCvGoogleDriveExports2(2);
      return res.json({ ok: true, taskUid: user.taskUid, analysis, driveExports });
    } catch (error) {
      console.error("[RecruitmentProcessing] Handler error:", error);
      return res.status(500).json({ error: error.message, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
  });
  app.post("/api/scheduled/appointment-fulfillment", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await Promise.resolve().then(() => (init_sdk(), sdk_exports));
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const { processDueAppointmentFulfillmentJobs: processDueAppointmentFulfillmentJobs2 } = await Promise.resolve().then(() => (init_appointmentFulfillment(), appointmentFulfillment_exports));
      const result = await processDueAppointmentFulfillmentJobs2(3);
      return res.json({ ok: true, taskUid: user.taskUid, ...result });
    } catch (error) {
      console.error("[AppointmentFulfillment] Handler error:", error);
      return res.status(500).json({ error: error.message, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
  });
  app.post("/api/scheduled/appointment-hold-cleanup", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await Promise.resolve().then(() => (init_sdk(), sdk_exports));
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const { releaseExpiredAppointmentHolds: releaseExpiredAppointmentHolds2 } = await Promise.resolve().then(() => (init_appointmentHolds(), appointmentHolds_exports));
      const result = await releaseExpiredAppointmentHolds2();
      return res.json({ ok: true, taskUid: user.taskUid, ...result });
    } catch (error) {
      console.error("[AppointmentHoldCleanup] Handler error:", error);
      return res.status(500).json({ error: error.message, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
  });
  app.post("/api/scheduled/candidate-document-processing", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await Promise.resolve().then(() => (init_sdk(), sdk_exports));
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const { processDueCandidateDocumentAnalysisJobs: processDueCandidateDocumentAnalysisJobs2 } = await Promise.resolve().then(() => (init_candidateDocumentProcessing(), candidateDocumentProcessing_exports));
      const result = await processDueCandidateDocumentAnalysisJobs2(2);
      return res.json({ ok: true, taskUid: user.taskUid, ...result });
    } catch (error) {
      console.error("[CandidateDocumentProcessing] Handler error:", error);
      return res.status(500).json({ error: error.message, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
  });
  app.post("/api/scheduled/security-posture", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await Promise.resolve().then(() => (init_sdk(), sdk_exports));
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "security_database_unavailable" });
      const { candidateSecurityRateLimits: candidateSecurityRateLimits2, securityEvents: securityEvents2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { and: and12, gte: gte2, lt: lt4 } = await import("drizzle-orm");
      const now = /* @__PURE__ */ new Date();
      const cleanupBefore = new Date(now.getTime() - 48 * 60 * 60 * 1e3);
      await db.delete(candidateSecurityRateLimits2).where(and12(lt4(candidateSecurityRateLimits2.lastAttemptAt, cleanupBefore), lt4(candidateSecurityRateLimits2.blockedUntil, now)));
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
      const recentAlerts = await db.select({ id: securityEvents2.id }).from(securityEvents2).where(and12(gte2(securityEvents2.createdAt, since), sql4`${securityEvents2.severity} IN ('high', 'critical')`));
      if (recentAlerts.length > 0) await notifyOwner({ title: "Bilan quotidien de s\xE9curit\xE9", content: `${recentAlerts.length} \xE9v\xE9nement(s) de s\xE9curit\xE9 \xE0 gravit\xE9 \xE9lev\xE9e ont \xE9t\xE9 d\xE9tect\xE9s sur les derni\xE8res 24 heures. Consultez le journal administrateur.` });
      return res.json({ ok: true, taskUid: user.taskUid, highSeverityEvents24h: recentAlerts.length });
    } catch (error) {
      console.error("[SecurityPosture] Handler error:", error);
      return res.status(500).json({ error: error.message, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
  });
  if (process.env.NODE_ENV === "development") {
    const viteModulePath = "./vite";
    const { setupVite } = await import(viteModulePath);
    await setupVite(app, server);
  } else if (process.env.VERCEL !== "1") {
    serveStatic(app);
  }
  return app;
}
async function startServer() {
  assertCriticalProductionEnvironment();
  const app = await createApp();
  const server = createServer(app);
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
if (process.env.VERCEL !== "1") {
  startServer().catch(console.error);
}

// server/vercelEntry.ts
var appPromise = createApp();
async function handler(req, res) {
  const app = await appPromise;
  return app(req, res);
}
export {
  handler as default
};

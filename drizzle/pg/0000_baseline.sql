CREATE TABLE "admin_mfa_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(128) NOT NULL,
	"code_hash" varchar(128) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_mfa_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(128) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_mfa_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "appointment_fulfillment_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"appointment_id" integer NOT NULL,
	"job_type" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_for" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracking_id" varchar(20) NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"customer_email" varchar(320) NOT NULL,
	"customer_phone" varchar(50) NOT NULL,
	"consultation_type" varchar(100) DEFAULT 'health_advice' NOT NULL,
	"request_details" text NOT NULL,
	"appointment_date" timestamp NOT NULL,
	"slot_key" varchar(64),
	"duration" integer DEFAULT 30 NOT NULL,
	"base_price" varchar(20) NOT NULL,
	"final_price" varchar(20) NOT NULL,
	"is_night_rate" integer DEFAULT 0 NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"stripe_session_id" varchar(255),
	"payment_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"appointment_status" varchar(32) DEFAULT 'held' NOT NULL,
	"hold_expires_at" timestamp,
	"meet_link" varchar(500),
	"cancellation_reason" text,
	"cancelled_at" timestamp,
	"refund_amount" varchar(20),
	"refunded_at" timestamp,
	"email_sent" integer DEFAULT 0 NOT NULL,
	"sms_sent" integer DEFAULT 0 NOT NULL,
	"reminder_sent" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_tracking_id_unique" UNIQUE("tracking_id")
);
--> statement-breakpoint
CREATE TABLE "availability_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_dates" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" varchar(10) NOT NULL,
	"reason" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"excerpt" text,
	"content" text NOT NULL,
	"cover_image" varchar(500),
	"category" varchar(100) DEFAULT 'general' NOT NULL,
	"language" varchar(10) DEFAULT 'fr' NOT NULL,
	"source" varchar(500),
	"published" integer DEFAULT 0 NOT NULL,
	"author_id" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "candidate_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"first_name" varchar(120),
	"last_name" varchar(120),
	"password_hash" varchar(512) NOT NULL,
	"email_verified_at" timestamp,
	"verification_token_hash" varchar(128),
	"verification_expires_at" timestamp,
	"password_reset_token_hash" varchar(128),
	"password_reset_expires_at" timestamp,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"last_login_at" timestamp,
	"linked_application_id" integer,
	"terms_accepted_at" timestamp,
	"document_consent_at" timestamp,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "candidate_document_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer,
	"candidate_id" integer,
	"actor_type" varchar(32) NOT NULL,
	"actor_reference" varchar(128),
	"action" varchar(32) NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_document_processing_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_for" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"application_id" integer,
	"category" varchar(32) NOT NULL,
	"category_other_label" varchar(160),
	"original_name" varchar(255) NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"validation_status" varchar(32) DEFAULT 'quarantined' NOT NULL,
	"validation_notes" text,
	"security_scan_version" varchar(40),
	"malware_scan_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"malware_scan_provider" varchar(80),
	"malware_scanned_at" timestamp,
	"encryption_algorithm" varchar(80),
	"encryption_iv" varchar(128),
	"encryption_auth_tag" varchar(128),
	"status" varchar(32) DEFAULT 'uploaded' NOT NULL,
	"ai_summary" text,
	"ai_extracted_data" text,
	"ai_confidence" integer,
	"ai_flags" text,
	"ai_model" varchar(100),
	"analysis_status" varchar(32) DEFAULT 'queued' NOT NULL,
	"analysis_attempts" integer DEFAULT 0 NOT NULL,
	"analysis_last_error" text,
	"analyzed_at" timestamp,
	"reviewed_by_open_id" varchar(128),
	"reviewed_at" timestamp,
	"review_notes" text,
	"retention_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_security_rate_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" varchar(80) NOT NULL,
	"subject_hash" varchar(128) NOT NULL,
	"window_started_at" timestamp NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"blocked_until" timestamp,
	"last_attempt_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"device_label" varchar(180),
	"ip_hash" varchar(128),
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "client_brief_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"brief_id" integer NOT NULL,
	"application_id" integer NOT NULL,
	"match_score" integer,
	"match_breakdown" text,
	"association_status" varchar(32) DEFAULT 'suggested' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_briefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"brief_id" varchar(20) NOT NULL,
	"organization_name" varchar(180) NOT NULL,
	"contact_name" varchar(120) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(50),
	"target_environment" varchar(120) NOT NULL,
	"specialty_needed" varchar(160) NOT NULL,
	"country" varchar(100) NOT NULL,
	"required_certifications" text,
	"required_languages" text,
	"minimum_years_experience" integer,
	"availability_needed" varchar(100),
	"job_description" text,
	"timeline" varchar(100),
	"notes" text,
	"brief_status" varchar(32) DEFAULT 'new' NOT NULL,
	"acknowledged_at" timestamp,
	"shortlist_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_briefs_brief_id_unique" UNIQUE("brief_id")
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracking_id" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(50),
	"message" text NOT NULL,
	"gdpr_consent" integer DEFAULT 0 NOT NULL,
	"read" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contact_messages_tracking_id_unique" UNIQUE("tracking_id")
);
--> statement-breakpoint
CREATE TABLE "cv_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracking_id" varchar(20) NOT NULL,
	"first_name" varchar(120) NOT NULL,
	"last_name" varchar(120) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(50),
	"specialty" varchar(160) NOT NULL,
	"diploma_country" varchar(100),
	"target_countries" text NOT NULL,
	"languages" text,
	"years_experience" integer,
	"availability" varchar(100),
	"mobility" varchar(150),
	"certifications" text,
	"message" text,
	"cv_file_key" varchar(500) NOT NULL,
	"cv_original_name" varchar(255) NOT NULL,
	"cv_mime_type" varchar(100) NOT NULL,
	"cv_size_bytes" integer NOT NULL,
	"file_validation_status" varchar(32) DEFAULT 'quarantined' NOT NULL,
	"file_checksum" varchar(64),
	"file_validation_notes" text,
	"file_validated_at" timestamp,
	"file_security_scan_version" varchar(40),
	"normalized_certifications" text,
	"normalized_languages" text,
	"normalized_experiences" text,
	"gdpr_consent" integer DEFAULT 0 NOT NULL,
	"marketing_consent" integer DEFAULT 0 NOT NULL,
	"marketing_unsubscribe_token" varchar(80),
	"marketing_unsubscribed_at" timestamp,
	"marketing_suppressed_at" timestamp,
	"last_contacted_at" timestamp,
	"last_candidate_response_at" timestamp,
	"status" varchar(32) DEFAULT 'new' NOT NULL,
	"admin_notes" text,
	"consent_at" timestamp,
	"retention_until" timestamp,
	"retention_review_notified_at" timestamp,
	"ai_summary" text,
	"ai_score" integer,
	"ai_strengths" text,
	"ai_weaknesses" text,
	"ai_extracted_skills" text,
	"ai_match_reasoning" text,
	"extracted_text" text,
	"ai_analyzed_at" timestamp,
	"analysis_status" varchar(32) DEFAULT 'queued' NOT NULL,
	"analysis_attempts" integer DEFAULT 0 NOT NULL,
	"analysis_last_error" text,
	"analysis_model" varchar(100),
	"analysis_prompt_version" varchar(40),
	"extraction_method" varchar(40),
	"extraction_page_count" integer,
	"extraction_total_pages" integer,
	"ocr_confidence" integer,
	"ocr_model_version" varchar(100),
	"extraction_warnings" text,
	"analysis_requested_at" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cv_applications_tracking_id_unique" UNIQUE("tracking_id")
);
--> statement-breakpoint
CREATE TABLE "cv_candidate_certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"name" varchar(180) NOT NULL,
	"issuing_body" varchar(180),
	"country" varchar(100),
	"expires_at" varchar(10),
	"evidence" text,
	"source" varchar(32) DEFAULT 'extracted' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_candidate_experiences" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"role" varchar(180) NOT NULL,
	"organization" varchar(180) NOT NULL,
	"start_date" varchar(10),
	"end_date" varchar(10),
	"employment_type" varchar(32) DEFAULT 'unknown' NOT NULL,
	"specialty" varchar(160) NOT NULL,
	"country" varchar(100),
	"duration_months" integer,
	"evidence" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_candidate_languages" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"language" varchar(80) NOT NULL,
	"proficiency" varchar(32) DEFAULT 'unknown' NOT NULL,
	"evidence" text,
	"source" varchar(32) DEFAULT 'extracted' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_google_drive_export_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"scheduled_for" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"last_error" text,
	"drive_file_id" varchar(128),
	"drive_file_url" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cv_google_drive_export_jobs_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
CREATE TABLE "cv_processing_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"job_type" varchar(32) DEFAULT 'analyze_cv' NOT NULL,
	"job_status" varchar(32) DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_for" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gdpr_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracking_id" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(50),
	"request_type" varchar(32) NOT NULL,
	"description" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"response_date" timestamp,
	"notes" text,
	"read" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gdpr_requests_tracking_id_unique" UNIQUE("tracking_id")
);
--> statement-breakpoint
CREATE TABLE "google_drive_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"connection_key" varchar(64) NOT NULL,
	"authorized_by_open_id" varchar(128) NOT NULL,
	"folder_id" varchar(128) NOT NULL,
	"refresh_token_ciphertext" text NOT NULL,
	"refresh_token_iv" varchar(32) NOT NULL,
	"refresh_token_auth_tag" varchar(32) NOT NULL,
	"granted_scopes" text,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"last_error" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_drive_connections_connection_key_unique" UNIQUE("connection_key")
);
--> statement-breakpoint
CREATE TABLE "medical_question_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"medical_question_id" integer NOT NULL,
	"actor_open_id" varchar(64),
	"action" varchar(80) NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracking_id" varchar(32) NOT NULL,
	"first_name" varchar(120) NOT NULL,
	"last_name" varchar(120) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(50) NOT NULL,
	"question" text NOT NULL,
	"language" varchar(10) DEFAULT 'fr' NOT NULL,
	"privacy_consent" integer DEFAULT 0 NOT NULL,
	"publication_consent" integer DEFAULT 0 NOT NULL,
	"urgency_acknowledged" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'submitted' NOT NULL,
	"admin_response" text,
	"public_question" text,
	"public_response" text,
	"responded_by_open_id" varchar(64),
	"response_sent_at" timestamp,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "medical_questions_tracking_id_unique" UNIQUE("tracking_id")
);
--> statement-breakpoint
CREATE TABLE "recruitment_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer,
	"admin_open_id" varchar(128) NOT NULL,
	"action" varchar(32) NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_campaign_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"application_id" integer NOT NULL,
	"recipient_email" varchar(320) NOT NULL,
	"delivery_status" varchar(32) DEFAULT 'queued' NOT NULL,
	"provider_email_id" varchar(120),
	"error" text,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"last_event_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(180) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"language" varchar(32) DEFAULT 'fr' NOT NULL,
	"audience_mode" varchar(32) NOT NULL,
	"audience_filters" text,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"created_by_open_id" varchar(128) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "recruitment_email_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_event_id" varchar(120) NOT NULL,
	"provider_email_id" varchar(120),
	"campaign_recipient_id" integer,
	"application_id" integer,
	"event_type" varchar(80) NOT NULL,
	"recipient_email" varchar(320),
	"payload" text,
	"occurred_at" timestamp NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_email_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "recruitment_follow_up_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"campaign_id" integer,
	"kind" varchar(32) NOT NULL,
	"due_at" timestamp NOT NULL,
	"status" varchar(32) DEFAULT 'suggested' NOT NULL,
	"notes" text,
	"completed_at" timestamp,
	"completed_by_open_id" varchar(128),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_match_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"target_country" varchar(120),
	"specialty" varchar(160),
	"minimum_score" integer DEFAULT 0 NOT NULL,
	"required_languages" text,
	"required_skills" text,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_offer_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"category" varchar(32) DEFAULT 'general' NOT NULL,
	"language" varchar(32) DEFAULT 'fr' NOT NULL,
	"subject" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_by_open_id" varchar(128) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"security_event_actor_kind" varchar(32) NOT NULL,
	"actor_reference" varchar(160),
	"category" varchar(100) NOT NULL,
	"security_event_outcome" varchar(32) NOT NULL,
	"security_event_severity" varchar(32) DEFAULT 'info' NOT NULL,
	"ip_hash" varchar(128),
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_name" varchar(100) NOT NULL,
	"rating" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"specialty" varchar(100),
	"verified" integer DEFAULT 0 NOT NULL,
	"featured" integer DEFAULT 0 NOT NULL,
	"language" varchar(10) DEFAULT 'fr' NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" varchar(32) DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE INDEX "admin_mfa_challenge_openid_expiry_idx" ON "admin_mfa_challenges" USING btree ("open_id","expires_at");--> statement-breakpoint
CREATE INDEX "admin_mfa_session_openid_expiry_idx" ON "admin_mfa_sessions" USING btree ("open_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_fulfillment_unique" ON "appointment_fulfillment_jobs" USING btree ("appointment_id","job_type");--> statement-breakpoint
CREATE INDEX "appointment_fulfillment_due_idx" ON "appointment_fulfillment_jobs" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_active_slot_unique" ON "appointments" USING btree ("slot_key");--> statement-breakpoint
CREATE INDEX "appointments_hold_expiry_idx" ON "appointments" USING btree ("appointment_status","payment_status","hold_expires_at");--> statement-breakpoint
CREATE INDEX "candidate_accounts_email_verified_idx" ON "candidate_accounts" USING btree ("email","email_verified_at");--> statement-breakpoint
CREATE INDEX "candidate_accounts_application_idx" ON "candidate_accounts" USING btree ("linked_application_id");--> statement-breakpoint
CREATE INDEX "candidate_document_audit_document_created_idx" ON "candidate_document_audit_logs" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_document_audit_candidate_created_idx" ON "candidate_document_audit_logs" USING btree ("candidate_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_document_jobs_schedule_idx" ON "candidate_document_processing_jobs" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "candidate_document_jobs_document_idx" ON "candidate_document_processing_jobs" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "candidate_documents_candidate_created_idx" ON "candidate_documents" USING btree ("candidate_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_documents_review_queue_idx" ON "candidate_documents" USING btree ("status","analysis_status");--> statement-breakpoint
CREATE INDEX "candidate_documents_application_idx" ON "candidate_documents" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_security_rate_limit_subject_unique" ON "candidate_security_rate_limits" USING btree ("action","subject_hash");--> statement-breakpoint
CREATE INDEX "candidate_security_rate_limit_blocked_idx" ON "candidate_security_rate_limits" USING btree ("blocked_until");--> statement-breakpoint
CREATE INDEX "candidate_sessions_candidate_expiry_idx" ON "candidate_sessions" USING btree ("candidate_id","expires_at");--> statement-breakpoint
CREATE INDEX "client_brief_candidates_brief_idx" ON "client_brief_candidates" USING btree ("brief_id");--> statement-breakpoint
CREATE INDEX "client_brief_candidates_application_idx" ON "client_brief_candidates" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "cv_candidate_certifications_application_idx" ON "cv_candidate_certifications" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "cv_candidate_certifications_name_idx" ON "cv_candidate_certifications" USING btree ("name");--> statement-breakpoint
CREATE INDEX "cv_candidate_experiences_application_idx" ON "cv_candidate_experiences" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "cv_candidate_experiences_specialty_idx" ON "cv_candidate_experiences" USING btree ("specialty");--> statement-breakpoint
CREATE INDEX "cv_candidate_languages_application_idx" ON "cv_candidate_languages" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "cv_candidate_languages_language_idx" ON "cv_candidate_languages" USING btree ("language");--> statement-breakpoint
CREATE INDEX "cv_drive_export_due_idx" ON "cv_google_drive_export_jobs" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "cv_processing_jobs_schedule_idx" ON "cv_processing_jobs" USING btree ("job_status","scheduled_for");--> statement-breakpoint
CREATE INDEX "cv_processing_jobs_application_idx" ON "cv_processing_jobs" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "medical_question_audit_question_created_idx" ON "medical_question_audit_logs" USING btree ("medical_question_id","created_at");--> statement-breakpoint
CREATE INDEX "medical_questions_status_created_idx" ON "medical_questions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "medical_questions_publication_idx" ON "medical_questions" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "recruitment_audit_application_idx" ON "recruitment_audit_logs" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "recruitment_audit_created_idx" ON "recruitment_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "recruitment_campaign_recipients_campaign_idx" ON "recruitment_campaign_recipients" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "recruitment_campaign_recipients_application_idx" ON "recruitment_campaign_recipients" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "recruitment_campaigns_status_idx" ON "recruitment_campaigns" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "recruitment_email_events_provider_email_idx" ON "recruitment_email_events" USING btree ("provider_email_id");--> statement-breakpoint
CREATE INDEX "recruitment_email_events_application_idx" ON "recruitment_email_events" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "recruitment_follow_up_tasks_application_idx" ON "recruitment_follow_up_tasks" USING btree ("application_id","status","due_at");--> statement-breakpoint
CREATE INDEX "recruitment_follow_up_tasks_campaign_idx" ON "recruitment_follow_up_tasks" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "recruitment_offer_templates_active_idx" ON "recruitment_offer_templates" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "security_events_created_idx" ON "security_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "security_events_actor_created_idx" ON "security_events" USING btree ("security_event_actor_kind","actor_reference","created_at");--> statement-breakpoint
CREATE INDEX "security_events_severity_created_idx" ON "security_events" USING btree ("security_event_severity","created_at");
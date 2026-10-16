CREATE TABLE `candidate_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`first_name` varchar(120),
	`last_name` varchar(120),
	`password_hash` varchar(512) NOT NULL,
	`email_verified_at` timestamp,
	`verification_token_hash` varchar(128),
	`verification_expires_at` timestamp,
	`password_reset_token_hash` varchar(128),
	`password_reset_expires_at` timestamp,
	`failed_login_count` int NOT NULL DEFAULT 0,
	`locked_until` timestamp,
	`last_login_at` timestamp,
	`linked_application_id` int,
	`terms_accepted_at` timestamp,
	`document_consent_at` timestamp,
	`candidate_account_status` enum('active','disabled','erased') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `candidate_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `candidate_accounts_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `candidate_document_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`document_id` int,
	`candidate_id` int,
	`candidate_document_actor_type` enum('candidate','admin','system') NOT NULL,
	`actor_reference` varchar(128),
	`candidate_document_audit_action` enum('upload','download','view','analysis_requested','analysis_completed','reviewed','erased','login','logout') NOT NULL,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `candidate_document_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `candidate_document_processing_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`document_id` int NOT NULL,
	`candidate_document_job_status` enum('queued','running','completed','retry','failed') NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 3,
	`scheduled_for` timestamp NOT NULL DEFAULT (now()),
	`started_at` timestamp,
	`finished_at` timestamp,
	`last_error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `candidate_document_processing_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `candidate_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`candidate_id` int NOT NULL,
	`application_id` int,
	`candidate_document_category` enum('identity_document','medical_license','diploma','certificate','professional_insurance','vaccination_record','criminal_record','employment_evidence','proof_of_address','other') NOT NULL,
	`category_other_label` varchar(160),
	`original_name` varchar(255) NOT NULL,
	`storage_key` varchar(500) NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`size_bytes` int NOT NULL,
	`checksum` varchar(64) NOT NULL,
	`candidate_document_validation_status` enum('quarantined','accepted','rejected','validation_failed') NOT NULL DEFAULT 'quarantined',
	`validation_notes` text,
	`security_scan_version` varchar(40),
	`candidate_document_status` enum('uploaded','validating','analyzing','needs_review','reviewed','rejected','archived') NOT NULL DEFAULT 'uploaded',
	`ai_summary` text,
	`ai_extracted_data` text,
	`ai_confidence` int,
	`ai_flags` text,
	`ai_model` varchar(100),
	`candidate_document_analysis_status` enum('queued','extracting','analyzing','completed','needs_review','failed') NOT NULL DEFAULT 'queued',
	`analysis_attempts` int NOT NULL DEFAULT 0,
	`analysis_last_error` text,
	`analyzed_at` timestamp,
	`reviewed_by_open_id` varchar(128),
	`reviewed_at` timestamp,
	`review_notes` text,
	`retention_until` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `candidate_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `candidate_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`candidate_id` int NOT NULL,
	`token_hash` varchar(128) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `candidate_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `candidate_sessions_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE INDEX `candidate_accounts_email_verified_idx` ON `candidate_accounts` (`email`,`email_verified_at`);--> statement-breakpoint
CREATE INDEX `candidate_accounts_application_idx` ON `candidate_accounts` (`linked_application_id`);--> statement-breakpoint
CREATE INDEX `candidate_document_audit_document_created_idx` ON `candidate_document_audit_logs` (`document_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `candidate_document_audit_candidate_created_idx` ON `candidate_document_audit_logs` (`candidate_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `candidate_document_jobs_schedule_idx` ON `candidate_document_processing_jobs` (`candidate_document_job_status`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `candidate_document_jobs_document_idx` ON `candidate_document_processing_jobs` (`document_id`);--> statement-breakpoint
CREATE INDEX `candidate_documents_candidate_created_idx` ON `candidate_documents` (`candidate_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `candidate_documents_review_queue_idx` ON `candidate_documents` (`candidate_document_status`,`candidate_document_analysis_status`);--> statement-breakpoint
CREATE INDEX `candidate_documents_application_idx` ON `candidate_documents` (`application_id`);--> statement-breakpoint
CREATE INDEX `candidate_sessions_candidate_expiry_idx` ON `candidate_sessions` (`candidate_id`,`expires_at`);
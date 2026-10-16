CREATE TABLE `client_briefs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brief_id` varchar(20) NOT NULL,
	`organization_name` varchar(180) NOT NULL,
	`contact_name` varchar(120) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(50),
	`target_environment` varchar(120) NOT NULL,
	`specialty_needed` varchar(160) NOT NULL,
	`country` varchar(100) NOT NULL,
	`required_certifications` text,
	`timeline` varchar(100),
	`notes` text,
	`brief_status` enum('new','reviewing','shortlist_sent','contract_signed','closed') NOT NULL DEFAULT 'new',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_briefs_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_briefs_brief_id_unique` UNIQUE(`brief_id`)
);
--> statement-breakpoint
CREATE TABLE `cv_processing_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`application_id` int NOT NULL,
	`job_type` enum('analyze_cv') NOT NULL DEFAULT 'analyze_cv',
	`job_status` enum('queued','running','completed','retry','failed') NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 3,
	`scheduled_for` timestamp NOT NULL DEFAULT (now()),
	`started_at` timestamp,
	`finished_at` timestamp,
	`last_error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cv_processing_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `availability` varchar(100);--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `mobility` varchar(150);--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `certifications` text;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `analysis_status` enum('queued','extracting','analyzing','completed','needs_review','failed') DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `analysis_attempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `analysis_last_error` text;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `analysis_model` varchar(100);--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `analysis_prompt_version` varchar(40);--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `extraction_method` varchar(40);--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `extraction_page_count` int;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `analysis_requested_at` timestamp;--> statement-breakpoint
CREATE INDEX `cv_processing_jobs_schedule_idx` ON `cv_processing_jobs` (`job_status`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `cv_processing_jobs_application_idx` ON `cv_processing_jobs` (`application_id`);
CREATE TABLE `appointment_fulfillment_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appointment_id` int NOT NULL,
	`job_type` enum('confirmation','invoice') NOT NULL,
	`status` enum('queued','running','retry','completed','failed') NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 3,
	`scheduled_for` timestamp NOT NULL DEFAULT (now()),
	`last_error` text,
	`started_at` timestamp,
	`finished_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointment_fulfillment_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `appointment_fulfillment_unique` UNIQUE(`appointment_id`,`job_type`)
);
--> statement-breakpoint
CREATE INDEX `appointment_fulfillment_due_idx` ON `appointment_fulfillment_jobs` (`status`,`scheduled_for`);
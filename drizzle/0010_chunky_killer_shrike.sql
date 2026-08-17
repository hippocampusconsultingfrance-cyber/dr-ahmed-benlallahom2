CREATE TABLE `recruitment_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`application_id` int,
	`admin_open_id` varchar(128) NOT NULL,
	`action` enum('download','reanalyze','erase','email','status_update','retention_cleanup') NOT NULL,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recruitment_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recruitment_match_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`target_country` varchar(120),
	`specialty` varchar(160),
	`minimum_score` int NOT NULL DEFAULT 0,
	`required_languages` text,
	`required_skills` text,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recruitment_match_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `recruitment_audit_application_idx` ON `recruitment_audit_logs` (`application_id`);--> statement-breakpoint
CREATE INDEX `recruitment_audit_created_idx` ON `recruitment_audit_logs` (`created_at`);
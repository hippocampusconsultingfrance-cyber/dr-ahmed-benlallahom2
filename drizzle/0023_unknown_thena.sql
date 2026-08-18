CREATE TABLE `admin_mfa_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`open_id` varchar(128) NOT NULL,
	`code_hash` varchar(128) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	`attempts` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_mfa_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admin_mfa_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`open_id` varchar(128) NOT NULL,
	`token_hash` varchar(128) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_mfa_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_mfa_sessions_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `candidate_security_rate_limits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` varchar(80) NOT NULL,
	`subject_hash` varchar(128) NOT NULL,
	`window_started_at` timestamp NOT NULL,
	`attempt_count` int NOT NULL DEFAULT 0,
	`blocked_until` timestamp,
	`last_attempt_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `candidate_security_rate_limits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`security_event_actor_kind` enum('candidate','admin','anonymous','system') NOT NULL,
	`actor_reference` varchar(160),
	`category` varchar(100) NOT NULL,
	`security_event_outcome` enum('allowed','blocked','failed','alert') NOT NULL,
	`security_event_severity` enum('info','warning','high','critical') NOT NULL DEFAULT 'info',
	`ip_hash` varchar(128),
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `security_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `candidate_documents` ADD `candidate_document_malware_scan_status` enum('pending','clean','suspicious','unavailable') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `candidate_documents` ADD `malware_scan_provider` varchar(80);--> statement-breakpoint
ALTER TABLE `candidate_documents` ADD `malware_scanned_at` timestamp;--> statement-breakpoint
ALTER TABLE `candidate_documents` ADD `encryption_algorithm` varchar(80);--> statement-breakpoint
ALTER TABLE `candidate_documents` ADD `encryption_iv` varchar(128);--> statement-breakpoint
ALTER TABLE `candidate_documents` ADD `encryption_auth_tag` varchar(128);--> statement-breakpoint
ALTER TABLE `candidate_sessions` ADD `device_label` varchar(180);--> statement-breakpoint
ALTER TABLE `candidate_sessions` ADD `ip_hash` varchar(128);--> statement-breakpoint
ALTER TABLE `candidate_sessions` ADD `last_seen_at` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
CREATE INDEX `admin_mfa_challenge_openid_expiry_idx` ON `admin_mfa_challenges` (`open_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `admin_mfa_session_openid_expiry_idx` ON `admin_mfa_sessions` (`open_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `candidate_security_rate_limit_subject_idx` ON `candidate_security_rate_limits` (`action`,`subject_hash`);--> statement-breakpoint
CREATE INDEX `candidate_security_rate_limit_blocked_idx` ON `candidate_security_rate_limits` (`blocked_until`);--> statement-breakpoint
CREATE INDEX `security_events_created_idx` ON `security_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `security_events_actor_created_idx` ON `security_events` (`security_event_actor_kind`,`actor_reference`,`created_at`);--> statement-breakpoint
CREATE INDEX `security_events_severity_created_idx` ON `security_events` (`security_event_severity`,`created_at`);
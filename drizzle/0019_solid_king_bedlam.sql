CREATE TABLE `recruitment_email_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider_event_id` varchar(120) NOT NULL,
	`provider_email_id` varchar(120),
	`campaign_recipient_id` int,
	`application_id` int,
	`event_type` varchar(80) NOT NULL,
	`recipient_email` varchar(320),
	`payload` text,
	`occurred_at` timestamp NOT NULL,
	`received_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recruitment_email_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `recruitment_email_events_provider_event_id_unique` UNIQUE(`provider_event_id`)
);
--> statement-breakpoint
CREATE TABLE `recruitment_follow_up_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`application_id` int NOT NULL,
	`campaign_id` int,
	`kind` enum('follow_up_7','follow_up_14','custom') NOT NULL,
	`due_at` timestamp NOT NULL,
	`status` enum('suggested','completed','dismissed') NOT NULL DEFAULT 'suggested',
	`notes` text,
	`completed_at` timestamp,
	`completed_by_open_id` varchar(128),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recruitment_follow_up_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recruitment_offer_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`category` enum('europe','canada','middle_east','vvip_offshore','paramedical','general') NOT NULL DEFAULT 'general',
	`language` enum('fr','en') NOT NULL DEFAULT 'fr',
	`subject` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`created_by_open_id` varchar(128) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recruitment_offer_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `recruitment_campaign_recipients` MODIFY COLUMN `delivery_status` enum('queued','sent','delivered','delayed','bounced','complained','failed','suppressed','skipped') NOT NULL DEFAULT 'queued';--> statement-breakpoint
ALTER TABLE `client_brief_candidates` ADD `match_breakdown` text;--> statement-breakpoint
ALTER TABLE `client_briefs` ADD `required_languages` text;--> statement-breakpoint
ALTER TABLE `client_briefs` ADD `minimum_years_experience` int;--> statement-breakpoint
ALTER TABLE `client_briefs` ADD `availability_needed` varchar(100);--> statement-breakpoint
ALTER TABLE `client_briefs` ADD `job_description` text;--> statement-breakpoint
ALTER TABLE `client_briefs` ADD `acknowledged_at` timestamp;--> statement-breakpoint
ALTER TABLE `client_briefs` ADD `shortlist_sent_at` timestamp;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `marketing_unsubscribe_token` varchar(80);--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `marketing_unsubscribed_at` timestamp;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `marketing_suppressed_at` timestamp;--> statement-breakpoint
ALTER TABLE `recruitment_campaign_recipients` ADD `delivered_at` timestamp;--> statement-breakpoint
ALTER TABLE `recruitment_campaign_recipients` ADD `last_event_at` timestamp;--> statement-breakpoint
CREATE INDEX `recruitment_email_events_provider_email_idx` ON `recruitment_email_events` (`provider_email_id`);--> statement-breakpoint
CREATE INDEX `recruitment_email_events_application_idx` ON `recruitment_email_events` (`application_id`);--> statement-breakpoint
CREATE INDEX `recruitment_follow_up_tasks_application_idx` ON `recruitment_follow_up_tasks` (`application_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `recruitment_follow_up_tasks_campaign_idx` ON `recruitment_follow_up_tasks` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `recruitment_offer_templates_active_idx` ON `recruitment_offer_templates` (`active`,`updated_at`);
CREATE TABLE `recruitment_campaign_recipients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaign_id` int NOT NULL,
	`application_id` int NOT NULL,
	`recipient_email` varchar(320) NOT NULL,
	`delivery_status` enum('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
	`provider_email_id` varchar(120),
	`error` text,
	`sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recruitment_campaign_recipients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recruitment_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(180) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`language` enum('fr','en') NOT NULL DEFAULT 'fr',
	`audience_mode` enum('selected','all_eligible','filtered') NOT NULL,
	`audience_filters` text,
	`recipient_count` int NOT NULL DEFAULT 0,
	`status` enum('draft','sending','sent','partially_sent','failed') NOT NULL DEFAULT 'draft',
	`created_by_open_id` varchar(128) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`sent_at` timestamp,
	CONSTRAINT `recruitment_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `recruitment_campaign_recipients_campaign_idx` ON `recruitment_campaign_recipients` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `recruitment_campaign_recipients_application_idx` ON `recruitment_campaign_recipients` (`application_id`);--> statement-breakpoint
CREATE INDEX `recruitment_campaigns_status_idx` ON `recruitment_campaigns` (`status`,`created_at`);
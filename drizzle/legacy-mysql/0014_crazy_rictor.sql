CREATE TABLE `client_brief_candidates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brief_id` int NOT NULL,
	`application_id` int NOT NULL,
	`match_score` int,
	`association_status` enum('suggested','reviewing','shortlisted','declined') NOT NULL DEFAULT 'suggested',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_brief_candidates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `client_brief_candidates_brief_idx` ON `client_brief_candidates` (`brief_id`);--> statement-breakpoint
CREATE INDEX `client_brief_candidates_application_idx` ON `client_brief_candidates` (`application_id`);
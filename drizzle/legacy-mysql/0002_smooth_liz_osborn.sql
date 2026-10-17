CREATE TABLE `gdpr_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(50),
	`request_type` enum('access','rectification','deletion','portability','objection') NOT NULL,
	`description` text,
	`status` enum('pending','in_progress','completed','rejected') NOT NULL DEFAULT 'pending',
	`response_date` timestamp,
	`notes` text,
	`read` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gdpr_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `contact_messages` ADD `gdpr_consent` int DEFAULT 0 NOT NULL;
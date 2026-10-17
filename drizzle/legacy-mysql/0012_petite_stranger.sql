ALTER TABLE `cv_applications` ADD `file_validation_status` enum('quarantined','accepted','rejected','validation_failed') DEFAULT 'quarantined' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `file_checksum` varchar(64);--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `file_validation_notes` text;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `file_validated_at` timestamp;
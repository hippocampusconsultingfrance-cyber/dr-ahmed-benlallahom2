ALTER TABLE `contact_messages` ADD `tracking_id` varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE `gdpr_requests` ADD `tracking_id` varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_messages` ADD CONSTRAINT `contact_messages_tracking_id_unique` UNIQUE(`tracking_id`);--> statement-breakpoint
ALTER TABLE `gdpr_requests` ADD CONSTRAINT `gdpr_requests_tracking_id_unique` UNIQUE(`tracking_id`);
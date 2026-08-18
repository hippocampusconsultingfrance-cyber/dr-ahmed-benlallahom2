ALTER TABLE `appointments` ADD `slot_key` varchar(64);--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_active_slot_unique` UNIQUE(`slot_key`);
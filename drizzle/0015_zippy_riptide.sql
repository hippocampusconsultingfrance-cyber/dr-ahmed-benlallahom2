ALTER TABLE `cv_applications` ADD `file_security_scan_version` varchar(40);--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `extraction_total_pages` int;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `ocr_confidence` int;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `ocr_model_version` varchar(100);--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `extraction_warnings` text;
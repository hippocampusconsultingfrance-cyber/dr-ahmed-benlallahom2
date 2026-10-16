ALTER TABLE `cv_applications` ADD `ai_summary` text;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `ai_score` int;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `ai_strengths` text;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `ai_weaknesses` text;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `ai_extracted_skills` text;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `ai_match_reasoning` text;--> statement-breakpoint
ALTER TABLE `cv_applications` ADD `ai_analyzed_at` timestamp;
CREATE TABLE `cv_candidate_certifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`application_id` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`issuing_body` varchar(180),
	`country` varchar(100),
	`expires_at` varchar(10),
	`evidence` text,
	`source` enum('declared','extracted') NOT NULL DEFAULT 'extracted',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cv_candidate_certifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cv_candidate_experiences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`application_id` int NOT NULL,
	`role` varchar(180) NOT NULL,
	`organization` varchar(180) NOT NULL,
	`start_date` varchar(10),
	`end_date` varchar(10),
	`employment_type` enum('permanent','temporary','locum','internship','fellowship','rotation','volunteer','unknown') NOT NULL DEFAULT 'unknown',
	`specialty` varchar(160) NOT NULL,
	`country` varchar(100),
	`duration_months` int,
	`evidence` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cv_candidate_experiences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cv_candidate_languages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`application_id` int NOT NULL,
	`language` varchar(80) NOT NULL,
	`proficiency` enum('basic','working','professional','fluent','native','unknown') NOT NULL DEFAULT 'unknown',
	`evidence` text,
	`source` enum('declared','extracted') NOT NULL DEFAULT 'extracted',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cv_candidate_languages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `cv_candidate_certifications_application_idx` ON `cv_candidate_certifications` (`application_id`);--> statement-breakpoint
CREATE INDEX `cv_candidate_certifications_name_idx` ON `cv_candidate_certifications` (`name`);--> statement-breakpoint
CREATE INDEX `cv_candidate_experiences_application_idx` ON `cv_candidate_experiences` (`application_id`);--> statement-breakpoint
CREATE INDEX `cv_candidate_experiences_specialty_idx` ON `cv_candidate_experiences` (`specialty`);--> statement-breakpoint
CREATE INDEX `cv_candidate_languages_application_idx` ON `cv_candidate_languages` (`application_id`);--> statement-breakpoint
CREATE INDEX `cv_candidate_languages_language_idx` ON `cv_candidate_languages` (`language`);
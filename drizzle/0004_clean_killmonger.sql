CREATE TABLE `testimonials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`author_name` varchar(100) NOT NULL,
	`rating` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`specialty` varchar(100),
	`verified` int NOT NULL DEFAULT 0,
	`featured` int NOT NULL DEFAULT 0,
	`language` varchar(10) NOT NULL DEFAULT 'fr',
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `testimonials_id` PRIMARY KEY(`id`)
);

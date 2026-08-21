CREATE TABLE IF NOT EXISTS `medical_questions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tracking_id` VARCHAR(32) NOT NULL,
  `first_name` VARCHAR(120) NOT NULL,
  `last_name` VARCHAR(120) NOT NULL,
  `email` VARCHAR(320) NOT NULL,
  `phone` VARCHAR(50) NOT NULL,
  `question` TEXT NOT NULL,
  `language` VARCHAR(10) NOT NULL DEFAULT 'fr',
  `privacy_consent` INT NOT NULL DEFAULT 0,
  `publication_consent` INT NOT NULL DEFAULT 0,
  `urgency_acknowledged` INT NOT NULL DEFAULT 0,
  `status` ENUM('submitted', 'drafting', 'answered', 'published', 'rejected') NOT NULL DEFAULT 'submitted',
  `admin_response` TEXT NULL,
  `public_question` TEXT NULL,
  `public_response` TEXT NULL,
  `responded_by_open_id` VARCHAR(64) NULL,
  `response_sent_at` TIMESTAMP NULL,
  `published_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `medical_questions_tracking_id_unique` (`tracking_id`),
  KEY `medical_questions_status_created_idx` (`status`, `created_at`),
  KEY `medical_questions_publication_idx` (`status`, `published_at`)
);

CREATE TABLE IF NOT EXISTS `medical_question_audit_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `medical_question_id` INT NOT NULL,
  `actor_open_id` VARCHAR(64) NULL,
  `action` VARCHAR(80) NOT NULL,
  `metadata` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `medical_question_audit_question_created_idx` (`medical_question_id`, `created_at`)
);

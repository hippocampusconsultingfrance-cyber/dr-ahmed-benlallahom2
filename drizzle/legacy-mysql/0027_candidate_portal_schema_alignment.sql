ALTER TABLE `candidate_documents` ADD COLUMN `malware_scan_status` enum('pending','clean','suspicious','unavailable') NOT NULL DEFAULT 'pending';

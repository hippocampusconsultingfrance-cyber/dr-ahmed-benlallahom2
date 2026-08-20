CREATE TABLE IF NOT EXISTS google_drive_connections (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  connection_key VARCHAR(64) NOT NULL,
  authorized_by_open_id VARCHAR(128) NOT NULL,
  folder_id VARCHAR(128) NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  refresh_token_iv VARCHAR(32) NOT NULL,
  refresh_token_auth_tag VARCHAR(32) NOT NULL,
  granted_scopes TEXT NULL,
  connected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL,
  last_error TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY google_drive_connections_connection_key_unique (connection_key)
);

CREATE TABLE IF NOT EXISTS cv_google_drive_export_jobs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id INT NOT NULL,
  status ENUM('queued','running','retry','completed','failed') NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  scheduled_for TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  last_error TEXT NULL,
  drive_file_id VARCHAR(128) NULL,
  drive_file_url VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY cv_google_drive_export_jobs_application_id_unique (application_id),
  KEY cv_drive_export_due_idx (status, scheduled_for)
);

-- Kept as separate statements for TiDB/MySQL compatibility: the target engine
-- resolves an ADD KEY before an ADD COLUMN when both are in one ALTER TABLE.
ALTER TABLE appointments
  MODIFY COLUMN appointment_status ENUM('held', 'confirmed', 'cancelled', 'completed', 'no_show') NOT NULL DEFAULT 'held';

ALTER TABLE appointments
  ADD COLUMN hold_expires_at TIMESTAMP NULL AFTER appointment_status;

CREATE INDEX appointments_hold_expiry_idx
  ON appointments (appointment_status, payment_status, hold_expires_at);

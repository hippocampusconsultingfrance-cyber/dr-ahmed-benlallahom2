import { describe, expect, it } from "vitest";
import { buildRetentionReviewReminder } from "./recruitmentRetention";

describe("preuve de rétention des CV", () => {
  it("conserve le CV tout en enregistrant un rappel de revue horodaté", () => {
    const at = new Date("2026-08-17T12:00:00.000Z");
    const result = buildRetentionReviewReminder({ previousNotes: "signature_verified", at });
    expect(result.retentionReviewNotifiedAt).toEqual(at);
    expect(result.fileValidationNotes).toContain("retention_review_notified_at=2026-08-17T12:00:00.000Z");
    expect(result).not.toHaveProperty("cvFileKey");
    expect(result).not.toHaveProperty("fileValidationStatus");
  });
});

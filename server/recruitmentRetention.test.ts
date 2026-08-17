import { describe, expect, it } from "vitest";
import { buildRetentionRetirement } from "./recruitmentRetention";

describe("preuve de rétention des CV", () => {
  it("retire la référence téléchargeable tout en conservant une preuve horodatée", () => {
    const at = new Date("2026-08-17T12:00:00.000Z");
    const result = buildRetentionRetirement({ trackingId: "CVABC123", previousNotes: "signature_verified", at });
    expect(result.cvFileKey).toBe("retired/CVABC123");
    expect(result.cvOriginalName).toBe("document-retired");
    expect(result.fileValidationStatus).toBe("rejected");
    expect(result.fileValidationNotes).toContain("retention_reference_retired_at=2026-08-17T12:00:00.000Z");
  });
});

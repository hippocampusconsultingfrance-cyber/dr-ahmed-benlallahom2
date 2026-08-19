import { describe, expect, it } from "vitest";
import { securityOperationsCopy } from "./securityOperationsCopy";

describe("observabilité de sécurité multilingue", () => {
  it("fournit les libellés critiques dans les quatre langues actives", () => {
    expect(Object.keys(securityOperationsCopy)).toEqual(["fr", "en", "de", "zh"]);
    for (const copy of Object.values(securityOperationsCopy)) {
      expect(copy.loading.trim()).not.toHaveLength(0);
      expect(copy.loadError.trim()).not.toHaveLength(0);
      expect(copy.title.trim()).not.toHaveLength(0);
      expect(copy.subtitle.trim()).not.toHaveLength(0);
      expect(copy.noEvents.trim()).not.toHaveLength(0);
      expect(copy.highEvents.trim()).not.toHaveLength(0);
      expect(copy.noHighEvents.trim()).not.toHaveLength(0);
      expect(copy.categories.candidate_document_upload_protection.trim()).not.toHaveLength(0);
      expect(copy.outcomes.blocked.trim()).not.toHaveLength(0);
      expect(copy.severities.critical.trim()).not.toHaveLength(0);
    }
  });
});

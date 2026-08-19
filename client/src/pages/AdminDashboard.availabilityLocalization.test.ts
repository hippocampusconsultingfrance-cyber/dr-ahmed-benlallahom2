import { describe, expect, it } from "vitest";
import { adminAvailabilityCopy } from "./AdminDashboard";

describe("disponibilités administratives localisées", () => {
  it("définit créneaux, formulaires et états vides dans les quatre langues actives", () => {
    for (const copy of Object.values(adminAvailabilityCopy)) {
      expect(copy.days).toHaveLength(7);
      expect(copy.slotsEmptyDescription).not.toHaveLength(0);
      expect(copy.blockedEmptyDescription).not.toHaveLength(0);
      expect(copy.deleteSlot).not.toHaveLength(0);
      expect(copy.unblockDate).not.toHaveLength(0);
    }
  });

  it("conserve les actions de disponibilité localisées", () => {
    expect(adminAvailabilityCopy.en.addSlot).toBe("Add a time slot");
    expect(adminAvailabilityCopy.de.blockDate).toBe("Datum sperren");
    expect(adminAvailabilityCopy.zh.days[1]).toBe("星期一");
  });
});

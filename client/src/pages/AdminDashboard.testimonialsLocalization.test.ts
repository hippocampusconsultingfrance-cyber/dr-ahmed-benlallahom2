import { describe, expect, it } from "vitest";
import { adminTestimonialsCopy } from "./AdminDashboard";

describe("témoignages administratifs localisés", () => {
  it("définit statuts, actions et état vide dans les quatre langues actives", () => {
    for (const copy of Object.values(adminTestimonialsCopy)) {
      expect(Object.values(copy.statuses)).toHaveLength(3);
      expect(copy.total(2)).not.toHaveLength(0);
      expect(copy.confirmDelete).not.toHaveLength(0);
    }
  });

  it("conserve les actions de modération localisées", () => {
    expect(adminTestimonialsCopy.en.approve).toBe("Approve");
    expect(adminTestimonialsCopy.de.unfeature).toBe("Hervorhebung entfernen");
    expect(adminTestimonialsCopy.zh.emptyTitle).toBe("暂无评价");
  });
});

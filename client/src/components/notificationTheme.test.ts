import { describe, expect, it } from "vitest";
import { notificationToastClassNames } from "./notificationTheme";

describe("thème des notifications", () => {
  it("distingue les quatre états et conserve une fermeture visible", () => {
    expect(notificationToastClassNames.success).toContain("emerald");
    expect(notificationToastClassNames.error).toContain("destructive");
    expect(notificationToastClassNames.warning).toContain("amber");
    expect(notificationToastClassNames.info).toContain("primary");
    expect(notificationToastClassNames.closeButton).toContain("hover");
  });
});

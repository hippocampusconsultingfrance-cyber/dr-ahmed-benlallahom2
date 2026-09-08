import { describe, expect, it } from "vitest";
import {
  recruitmentDriveExportLabel,
  recruitmentEmailDeliveryLabel,
} from "./recruitmentTraceability";

describe("libellés de traçabilité des candidatures", () => {
  it("distingue l'acceptation Resend de la distribution effective", () => {
    expect(recruitmentEmailDeliveryLabel("email.sent")).toBe("Accepté par Resend");
    expect(recruitmentEmailDeliveryLabel("email.delivered")).toBe("Distribué");
    expect(recruitmentEmailDeliveryLabel("email.bounced")).toBe("Adresse rejetée");
  });

  it("rend explicites les reprises Google Drive", () => {
    expect(recruitmentDriveExportLabel("completed")).toBe("Copié dans Drive");
    expect(recruitmentDriveExportLabel("retry")).toBe("Nouvelle tentative prévue");
    expect(recruitmentDriveExportLabel("failed")).toBe("Échec de la copie");
  });
});

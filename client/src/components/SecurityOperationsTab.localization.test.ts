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
      // RGPD-12: the administrator's actions on a person's data, and their counts.
      // EXPL-02: a patient's email corrected from the appointment card.
      // ABUS-02: a slot held by an online booking, by an anonymous visitor.
      for (const category of ["admin_personal_data_exported", "admin_personal_data_erased", "admin_contact_message_deleted", "admin_medical_question_deleted", "admin_appointment_email_corrected", "public_booking_hold_created"] as const) {
        expect(copy.categories[category].trim()).not.toHaveLength(0);
      }
      expect(copy.actors.anonymous.trim()).not.toHaveLength(0);
      expect(Object.keys(copy.counts)).toEqual(Object.keys(securityOperationsCopy.fr.counts));
      expect(copy.outcomes.blocked.trim()).not.toHaveLength(0);
      expect(copy.severities.critical.trim()).not.toHaveLength(0);
    }
  });
});

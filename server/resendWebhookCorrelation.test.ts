import { describe, expect, it } from "vitest";
import {
  buildResendApplicationTags,
  resendApplicationReferenceFromTags,
  resendRecipientMatchesApplication,
} from "./resendWebhookCorrelation";

describe("Resend recruitment webhook correlation", () => {
  it("builds correlation tags without adding candidate attributes", () => {
    const tags = buildResendApplicationTags("CVABC123XYZ");

    expect(tags).toEqual([
      { name: "email_kind", value: "application_confirmation" },
      { name: "application_ref", value: "CVABC123XYZ" },
    ]);
    expect(JSON.stringify(tags)).not.toContain("@");
  });

  it("reads the signed webhook object shape only for tracked application messages", () => {
    expect(resendApplicationReferenceFromTags({
      email_kind: "application_confirmation",
      application_ref: "CVABC123XYZ",
    })).toBe("CVABC123XYZ");
    expect(resendApplicationReferenceFromTags({
      email_kind: "candidate_portal_activation",
      application_ref: "CVABC123XYZ",
    })).toBe("CVABC123XYZ");
    expect(resendApplicationReferenceFromTags({
      email_kind: "campaign",
      application_ref: "CVABC123XYZ",
    })).toBeNull();
  });

  it("supports the API array shape and rejects unsafe references", () => {
    expect(resendApplicationReferenceFromTags([
      { name: "email_kind", value: "application_confirmation" },
      { name: "application_ref", value: "CV_ARRAY_123" },
    ])).toBe("CV_ARRAY_123");
    expect(resendApplicationReferenceFromTags({
      email_kind: "application_confirmation",
      application_ref: "../../candidate@example.com",
    })).toBeNull();
  });

  it("requires the webhook recipient to match the application email", () => {
    expect(resendRecipientMatchesApplication("Candidate@Example.com", " candidate@example.com ")).toBe(true);
    expect(resendRecipientMatchesApplication("other@example.com", "candidate@example.com")).toBe(false);
    expect(resendRecipientMatchesApplication(null, "candidate@example.com")).toBe(false);
  });

  // The production webhook's use of these helpers is exercised through the
  // signed route in resendWebhookRoute.test.ts (tagged confirmation).
});

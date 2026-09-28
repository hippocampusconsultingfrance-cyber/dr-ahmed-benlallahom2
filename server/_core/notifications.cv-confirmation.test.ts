import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: sendEmail } })),
}));

vi.mock("./notification", () => ({
  notifyOwner: vi.fn(),
}));

import { sendCvApplicationConfirmationEmail } from "./notifications";

describe("sendCvApplicationConfirmationEmail", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_cv_confirmation");
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ data: { id: "email-confirmation" }, error: null });
  });

  it("sends an idempotent confirmation with attribute-free webhook correlation tags", async () => {
    const result = await sendCvApplicationConfirmationEmail(
      "candidate@example.com",
      "Camille Candidate",
      "CVABC123XYZ",
      "Anesthésie-réanimation",
      "France",
      undefined,
      "cv-confirmation-test-key",
    );

    expect(result).toEqual({ status: "sent", providerEmailId: "email-confirmation", failureCode: null });
    expect(sendEmail.mock.calls[0][0].tags).toEqual([
      { name: "email_kind", value: "application_confirmation" },
      { name: "application_ref", value: "CVABC123XYZ" },
    ]);
    expect(sendEmail.mock.calls[0][1]).toEqual({ idempotencyKey: "cv-confirmation-test-key" });
    expect(JSON.stringify(sendEmail.mock.calls[0][0].tags)).not.toContain("candidate@example.com");
    expect(JSON.stringify(sendEmail.mock.calls[0][0].tags)).not.toContain("Camille Candidate");
  });
});

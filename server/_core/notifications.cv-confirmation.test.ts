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
      "Camille",
      "CVABC123XYZ",
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
    expect(JSON.stringify(sendEmail.mock.calls[0][0].tags)).not.toContain("Camille");
  });

  it("retries an ambiguous SDK network response with the exact same request and key", async () => {
    sendEmail
      .mockResolvedValueOnce({ data: null, error: { name: "application_error", statusCode: null, message: "network" } })
      .mockResolvedValueOnce({ data: { id: "email-after-retry" }, error: null });

    await expect(sendCvApplicationConfirmationEmail(
      "candidate@example.com", "Camille", "CVABC123XYZ", undefined, "cv-confirmation-test-key",
    )).resolves.toEqual({ status: "sent", providerEmailId: "email-after-retry", failureCode: null });

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[1][0]).toEqual(sendEmail.mock.calls[0][0]);
    expect(sendEmail.mock.calls[1][1]).toEqual(sendEmail.mock.calls[0][1]);
  });

  it("does not retry an explicit provider rejection", async () => {
    sendEmail.mockResolvedValueOnce({ data: null, error: { name: "validation_error", statusCode: 422, message: "rejected" } });

    await expect(sendCvApplicationConfirmationEmail(
      "candidate@example.com", "Camille", "CVABC123XYZ", undefined, "cv-confirmation-test-key",
    )).resolves.toEqual({ status: "failed", providerEmailId: null, failureCode: "provider_rejected" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("keeps a double ambiguous delivery distinct from a confirmed rejection", async () => {
    sendEmail.mockResolvedValue({ data: null, error: { name: "application_error", statusCode: 503, message: "temporary" } });

    await expect(sendCvApplicationConfirmationEmail(
      "candidate@example.com", "Camille", "CVABC123XYZ", undefined, "cv-confirmation-test-key",
    )).resolves.toEqual({ status: "failed", providerEmailId: null, failureCode: "delivery_exception" });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});

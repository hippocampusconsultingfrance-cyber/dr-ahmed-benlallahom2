import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: sendEmail } })),
}));

vi.mock("./notification", () => ({
  notifyOwner: vi.fn(),
}));

import {
  buildCandidatePortalAccessIdempotencyKey,
  candidatePortalAccessEmailFailureCode,
  sendCandidatePortalAccessEmail,
} from "./notifications";

describe("sendCandidatePortalAccessEmail", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_candidate_access");
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ data: { id: "email-test" }, error: null });
  });

  it("inclut une consigne explicite de vérification des indésirables", async () => {
    await sendCandidatePortalAccessEmail({
      to: "candidate@example.com",
      firstName: "Camille",
      kind: "verify",
      actionUrl: "https://drahmedbenlallahom.com/candidate/verify?token=test",
      applicationReference: "CV-ACTIVATION-123",
      idempotencyKey: "candidate-portal-activation-test",
    });

    const payload = sendEmail.mock.calls[0][0];
    expect(payload.html).toContain("Spam ou Courriers indésirables");
    expect(payload.html).toContain("recrutement@drahmedbenlallahom.com");
    expect(payload.text).toContain("Spam ou Courriers indésirables");
    expect(payload.tags).toEqual([
      { name: "email_kind", value: "candidate_portal_activation" },
      { name: "application_ref", value: "CV-ACTIVATION-123" },
    ]);
  });

  it("transmet la clé d’idempotence des invitations administrateur", async () => {
    await sendCandidatePortalAccessEmail({
      to: "candidate@example.com",
      firstName: "Camille",
      kind: "invite",
      actionUrl: "https://drahmedbenlallahom.com/candidate/access?invite=test",
      idempotencyKey: "candidate-portal-invitation-CV-TEST-attempt-2",
    });

    expect(sendEmail.mock.calls[0][1]).toEqual({ idempotencyKey: "candidate-portal-invitation-CV-TEST-attempt-2" });
    expect(sendEmail.mock.calls[0][0].tags).toEqual([
      { name: "email_kind", value: "candidate_portal_invitation" },
      { name: "application_ref", value: "CV-TEST" },
    ]);
  });

  it("retente une réponse réseau ambiguë avec exactement la même clé d’idempotence", async () => {
    sendEmail
      .mockRejectedValueOnce(new Error("network interrupted"))
      .mockResolvedValueOnce({ data: { id: "email-after-retry" }, error: null });

    await expect(sendCandidatePortalAccessEmail({
      to: "candidate@example.com",
      firstName: "Camille",
      kind: "reset",
      actionUrl: "https://drahmedbenlallahom.com/candidate/reset-password?token=test",
      idempotencyKey: "candidate-portal-password-reset-42-tokenhash",
    })).resolves.toEqual({ id: "email-after-retry" });

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[1][0]).toEqual(sendEmail.mock.calls[0][0]);
    expect(sendEmail.mock.calls[0][1]).toEqual({ idempotencyKey: "candidate-portal-password-reset-42-tokenhash" });
    expect(sendEmail.mock.calls[1][1]).toEqual({ idempotencyKey: "candidate-portal-password-reset-42-tokenhash" });
  });

  it("ne retente pas un refus explicite du fournisseur", async () => {
    sendEmail.mockResolvedValueOnce({ data: null, error: { name: "validation_error", statusCode: 422, message: "rejected" } });

    const delivery = sendCandidatePortalAccessEmail({
      to: "candidate@example.com",
      firstName: "Camille",
      kind: "verify",
      actionUrl: "https://drahmedbenlallahom.com/candidate/verify?token=test",
      idempotencyKey: "candidate-portal-activation-42-tokenhash",
    });

    await expect(delivery).rejects.toThrow("Resend candidate access email failed:");
    await delivery.catch(error => {
      expect(candidatePortalAccessEmailFailureCode(error)).toBe("provider_rejected");
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("classe une acceptation sans identifiant comme ambiguë et la retente sans doublon", async () => {
    sendEmail.mockResolvedValue({ data: null, error: null });

    const delivery = sendCandidatePortalAccessEmail({
      to: "candidate@example.com",
      firstName: "Camille",
      kind: "verify",
      actionUrl: "https://drahmedbenlallahom.com/candidate/verify?token=test",
      idempotencyKey: "candidate-portal-activation-42-tokenhash",
    });

    await expect(delivery).rejects.toSatisfy(error => candidatePortalAccessEmailFailureCode(error) === "delivery_exception");
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("classe une panne réseau retournée par le SDK comme ambiguë", async () => {
    sendEmail
      .mockResolvedValueOnce({ data: null, error: { name: "application_error", statusCode: null, message: "Unable to fetch data" } })
      .mockResolvedValueOnce({ data: { id: "email-network-retry" }, error: null });

    await expect(sendCandidatePortalAccessEmail({
      to: "candidate@example.com",
      firstName: "Camille",
      kind: "verify",
      actionUrl: "https://drahmedbenlallahom.com/candidate/verify?token=test",
      idempotencyKey: "candidate-portal-activation-42-tokenhash",
    })).resolves.toEqual({ id: "email-network-retry" });

    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it.each([
    [500, "application_error"],
    [503, "application_error"],
    [408, "application_error"],
    [409, "concurrent_idempotent_requests"],
  ])("retente le statut ambigu %s", async (statusCode, name) => {
    sendEmail
      .mockResolvedValueOnce({ data: null, error: { name, statusCode, message: "temporary" } })
      .mockResolvedValueOnce({ data: { id: `email-${statusCode}` }, error: null });

    await expect(sendCandidatePortalAccessEmail({
      to: "candidate@example.com",
      firstName: "Camille",
      kind: "reset",
      actionUrl: "https://drahmedbenlallahom.com/candidate/reset-password?token=test",
      idempotencyKey: "candidate-portal-password-reset-42-tokenhash",
    })).resolves.toEqual({ id: `email-${statusCode}` });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("ne retente pas une réutilisation invalide de clé d’idempotence", async () => {
    sendEmail.mockResolvedValueOnce({
      data: null,
      error: { name: "invalid_idempotent_request", statusCode: 409, message: "payload differs" },
    });

    const delivery = sendCandidatePortalAccessEmail({
      to: "candidate@example.com",
      firstName: "Camille",
      kind: "verify",
      actionUrl: "https://drahmedbenlallahom.com/candidate/verify?token=test",
      idempotencyKey: "candidate-portal-activation-42-tokenhash",
    });

    await expect(delivery).rejects.toSatisfy(error => candidatePortalAccessEmailFailureCode(error) === "provider_rejected");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("propage un refus explicite obtenu après une première réponse ambiguë", async () => {
    sendEmail
      .mockResolvedValueOnce({ data: null, error: { name: "application_error", statusCode: null, message: "network" } })
      .mockResolvedValueOnce({ data: null, error: { name: "validation_error", statusCode: 422, message: "rejected" } });

    const delivery = sendCandidatePortalAccessEmail({
      to: "candidate@example.com",
      firstName: "Camille",
      kind: "reset",
      actionUrl: "https://drahmedbenlallahom.com/candidate/reset-password?token=test",
      idempotencyKey: "candidate-portal-password-reset-42-tokenhash",
    });

    await expect(delivery).rejects.toSatisfy(error => candidatePortalAccessEmailFailureCode(error) === "provider_rejected");
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("construit une clé stable sans exposer le jeton brut", () => {
    const tokenHash = "a".repeat(64);
    expect(buildCandidatePortalAccessIdempotencyKey("verify", tokenHash))
      .toBe(`candidate-portal-activation-${"a".repeat(40)}`);
    expect(buildCandidatePortalAccessIdempotencyKey("reset", tokenHash))
      .toBe(`candidate-portal-password-reset-${"a".repeat(40)}`);
    expect(buildCandidatePortalAccessIdempotencyKey("verify", "b".repeat(64)))
      .not.toBe(buildCandidatePortalAccessIdempotencyKey("verify", tokenHash));
    expect(buildCandidatePortalAccessIdempotencyKey("verify", tokenHash).length).toBeLessThan(256);
  });
});

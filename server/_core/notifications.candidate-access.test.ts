import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: sendEmail } })),
}));

vi.mock("./notification", () => ({
  notifyOwner: vi.fn(),
}));

import { sendCandidatePortalAccessEmail } from "./notifications";

describe("sendCandidatePortalAccessEmail", () => {
  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ data: { id: "email-test" }, error: null });
  });

  it("inclut une consigne explicite de vérification des indésirables", async () => {
    await sendCandidatePortalAccessEmail({
      to: "candidate@example.com",
      firstName: "Camille",
      kind: "verify",
      actionUrl: "https://drahmedbenlallahom.com/candidate/verify?token=test",
    });

    const payload = sendEmail.mock.calls[0][0];
    expect(payload.html).toContain("Spam ou Courriers indésirables");
    expect(payload.html).toContain("recrutement@drahmedbenlallahom.com");
    expect(payload.text).toContain("Spam ou Courriers indésirables");
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
  });
});

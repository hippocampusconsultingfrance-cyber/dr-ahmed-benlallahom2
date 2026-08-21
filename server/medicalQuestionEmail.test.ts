import { describe, expect, it, vi } from "vitest";

const resendMocks = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue({ error: null }) }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendMocks.send };
  },
}));

import { sendMedicalQuestionResponseEmail } from "./_core/notifications";

describe("email de réponse aux questions médicales", () => {
  it("prépare un email confidentiel avec une limite médicale claire sans l’envoyer réellement", async () => {
    await sendMedicalQuestionResponseEmail({
      email: "test@example.invalid",
      firstName: "Test",
      trackingId: "MQ-TEST-2026",
      response: "Voici une information générale relue.",
    });

    expect(resendMocks.send).toHaveBeenCalledOnce();
    const payload = resendMocks.send.mock.calls[0][0];
    expect(payload.to).toEqual(["test@example.invalid"]);
    expect(payload.subject).toContain("MQ-TEST-2026");
    expect(payload.html).toContain("ne remplace pas une consultation");
    expect(payload.html).toContain("Voici une information générale relue.");
    expect(payload.replyTo).toBe("hippocampusconsultingfrance@gmail.com");
  });
});

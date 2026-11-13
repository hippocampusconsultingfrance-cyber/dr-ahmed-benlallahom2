import type { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { createTestContext } from "./testSupport/trpcContext";
import { verifyCandidateTurnstile } from "./candidateTurnstile";
import { notifyOwner, type NotificationPayload } from "./_core/notification";
import { getDb } from "./db";
import { countPublicFormDailyVolume } from "./publicFormRateLimit";
import { siteConfig } from "../client/src/data/site-config";

// Emails handed to Resend, which the tests never reach: a stand-in client answers.
const resend = vi.hoisted(() => ({
  configured: true,
  send: vi.fn(
    async (
      _message: Record<string, unknown>,
      _options?: { idempotencyKey?: string }
    ): Promise<{
      data: { id: string } | null;
      error: { name: string; message: string; statusCode: number } | null;
    }> => ({ data: { id: "email_1" }, error: null })
  ),
}));

// Mock the database and notification modules
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
  getResendClient: () =>
    resend.configured ? { emails: { send: resend.send } } : undefined,
}));

// The day's volume is under its cap unless a test says otherwise (ABUS-01).
vi.mock("./publicFormRateLimit", async importOriginal => ({
  ...(await importOriginal<typeof import("./publicFormRateLimit")>()),
  countPublicFormDailyVolume: vi.fn(async () => true),
}));

// Cloudflare is never called from the tests: each one says what the check answers.
vi.mock("./candidateTurnstile", () => ({
  verifyCandidateTurnstile: vi.fn(async () => undefined),
}));

describe("contact.submit", () => {
  it("accepts a valid contact form submission", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.contact.submit({
      name: "Jean Dupont",
      email: "jean@example.com",
      phone: "+33 6 12 34 56 78",
      message: "Bonjour, je souhaite prendre rendez-vous.",
      gdprConsent: 1,
    });

    expect(result.success).toBe(true);
    expect(result.trackingId).toBeDefined();
    expect(result.trackingId.length).toBeLessThanOrEqual(20);
  });

  it("accepts a submission without phone number", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.contact.submit({
      name: "Marie Martin",
      email: "marie@example.com",
      message: "Question about your consulting services.",
      gdprConsent: 1,
    });

    expect(result.success).toBe(true);
    expect(result.trackingId).toBeDefined();
  });

  it("rejects submission with invalid email", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.contact.submit({
        name: "Test",
        email: "not-an-email",
        message: "Hello",
        gdprConsent: 1,
      })
    ).rejects.toThrow();
  });

  it("rejects submission with empty name", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.contact.submit({
        name: "",
        email: "test@example.com",
        message: "Hello",
        gdprConsent: 1,
      })
    ).rejects.toThrow();
  });

  it("rejects submission with empty message", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.contact.submit({
        name: "Test",
        email: "test@example.com",
        message: "",
        gdprConsent: 1,
      })
    ).rejects.toThrow();
  });

  it("accepts submission with GDPR consent", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.contact.submit({
      name: "Pierre Leclerc",
      email: "pierre@example.com",
      message: "I accept the privacy policy.",
      gdprConsent: 1,
    });

    expect(result.success).toBe(true);
    expect(result.trackingId).toBeDefined();
  });

  it("rejects submission with GDPR consent declined", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.contact.submit({
        name: "Sophie Renault",
        email: "sophie@example.com",
        message: "I do not accept the privacy policy.",
        gdprConsent: 0,
      });
      expect.fail("Should have thrown an error");
    } catch (caught) {
      const error = caught as TRPCError;
      expect(error.code).toBe("BAD_REQUEST");
      expect(error.message).toContain("RGPD");
    }
  });
});

describe("gdpr.submit", () => {
  it("accepts a valid GDPR access request", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.gdpr.submit({
      name: "Jane Smith",
      email: "jane@example.com",
      phone: "+33 6 12 34 56 78",
      requestType: "access",
      description: "I want to access my personal data.",
    });

    expect(result.success).toBe(true);
    expect(result.trackingId).toBeDefined();
    expect(result.trackingId.length).toBeLessThanOrEqual(20);
  });

  it("accepts a GDPR deletion request", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.gdpr.submit({
      name: "Jane Smith",
      email: "jane@example.com",
      requestType: "deletion",
      description: "I want to delete my personal data.",
    });

    expect(result.success).toBe(true);
    expect(result.trackingId).toBeDefined();
  });

  it("accepts a GDPR rectification request", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.gdpr.submit({
      name: "Jane Smith",
      email: "jane@example.com",
      requestType: "rectification",
      description: "I want to correct my personal data.",
    });

    expect(result.success).toBe(true);
    expect(result.trackingId).toBeDefined();
  });

  it("accepts a GDPR portability request", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.gdpr.submit({
      name: "Jane Smith",
      email: "jane@example.com",
      requestType: "portability",
      description: "I want to export my personal data.",
    });

    expect(result.success).toBe(true);
    expect(result.trackingId).toBeDefined();
  });

  it("accepts a GDPR objection request", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.gdpr.submit({
      name: "Jane Smith",
      email: "jane@example.com",
      requestType: "objection",
      description: "I object to the processing of my personal data.",
    });

    expect(result.success).toBe(true);
    expect(result.trackingId).toBeDefined();
  });

  it("rejects GDPR request with invalid email", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.gdpr.submit({
        name: "Test",
        email: "not-an-email",
        requestType: "access",
        description: "Test request",
      })
    ).rejects.toThrow();
  });

  it("rejects GDPR request with empty name", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.gdpr.submit({
        name: "",
        email: "test@example.com",
        requestType: "access",
        description: "Test request",
      })
    ).rejects.toThrow();
  });

  it("accepts GDPR request without phone number", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.gdpr.submit({
      name: "John Doe",
      email: "john@example.com",
      requestType: "access",
      description: "I want to access my personal data.",
    });

    expect(result.success).toBe(true);
    expect(result.trackingId).toBeDefined();
  });

  it("accepts GDPR request without description", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.gdpr.submit({
      name: "John Doe",
      email: "john@example.com",
      requestType: "access",
    });

    expect(result.success).toBe(true);
    expect(result.trackingId).toBeDefined();
  });
});

describe("contrôle anti-robot des formulaires contact et RGPD", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuse un message de contact dont le contrôle Turnstile échoue, sans l’enregistrer ni prévenir le cabinet", async () => {
    const caller = appRouter.createCaller(createTestContext());
    vi.mocked(verifyCandidateTurnstile).mockRejectedValueOnce(
      new Error("candidate_turnstile_invalid")
    );

    await expect(
      caller.contact.submit({
        name: "Robot",
        email: "robot@example.com",
        message: "Message envoyé par un script.",
        gdprConsent: 1,
        turnstileToken: "turnstile-token-refused-by-the-mock",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(verifyCandidateTurnstile).toHaveBeenCalledWith(
      expect.objectContaining({ token: "turnstile-token-refused-by-the-mock" })
    );
    expect((await getDb())!.execute).not.toHaveBeenCalled();
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("refuse une demande RGPD dont le contrôle Turnstile échoue, sans l’enregistrer ni prévenir le cabinet", async () => {
    const caller = appRouter.createCaller(createTestContext());
    vi.mocked(verifyCandidateTurnstile).mockRejectedValueOnce(
      new Error("candidate_turnstile_invalid")
    );

    await expect(
      caller.gdpr.submit({
        name: "Robot",
        email: "robot@example.com",
        requestType: "deletion",
        turnstileToken: "turnstile-token-refused-by-the-mock",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(verifyCandidateTurnstile).toHaveBeenCalledWith(
      expect.objectContaining({ token: "turnstile-token-refused-by-the-mock" })
    );
    expect((await getDb())!.execute).not.toHaveBeenCalled();
    expect(notifyOwner).not.toHaveBeenCalled();
  });
});

describe("numéros de suivi des formulaires contact et RGPD", () => {
  it("donne à chaque envoi un numéro imprévisible au format historique, sans Math.random() ni horodatage", async () => {
    const caller = appRouter.createCaller(createTestContext());
    const random = vi.spyOn(Math, "random");
    try {
      const contacts = await Promise.all(
        Array.from({ length: 20 }, () =>
          caller.contact.submit({
            name: "Jean Dupont",
            email: "jean@example.com",
            message: "Bonjour.",
            gdprConsent: 1,
          })
        )
      );
      const requests = await Promise.all(
        Array.from({ length: 20 }, () =>
          caller.gdpr.submit({
            name: "Jane Smith",
            email: "jane@example.com",
            requestType: "access",
          })
        )
      );

      // Twenty submissions in the same millisecond: a timestamp would repeat.
      expect(new Set(contacts.map(result => result.trackingId)).size).toBe(20);
      expect(new Set(requests.map(result => result.trackingId)).size).toBe(20);
      for (const { trackingId } of contacts)
        expect(trackingId).toMatch(/^C[0-9A-Z]{12}$/);
      for (const { trackingId } of requests)
        expect(trackingId).toMatch(/^G[0-9A-Z]{12}$/);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});

describe("message de contact : réponse au visiteur, catégorie et accusé de réception (PUB-09, PUB-22)", () => {
  // Free text an attacker could type to have the site send it from its own domain (MAIL-01).
  const typed = {
    name: "Votre colis est bloqué https://colis-phish.example",
    email: "victime@example.com",
    phone: "+33 1 23 45 67 89 rappel urgent",
    message:
      "Payez sur https://promo-phish.example/fr pour débloquer votre dossier.",
    gdprConsent: 1,
  };
  const sentEmails = () =>
    resend.send.mock.calls.map(([message, options]) => ({
      message: message as {
        from: string;
        to: string[];
        replyTo: string;
        subject: string;
        html: string;
        text: string;
      },
      options,
    }));

  beforeEach(() => {
    vi.clearAllMocks();
    resend.configured = true;
    vi.mocked(countPublicFormDailyVolume).mockResolvedValue(true);
    resend.send.mockResolvedValue({ data: { id: "email_1" }, error: null });
  });

  it("fait répondre le cabinet au visiteur, et dit dans la notification qui écrit", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await caller.contact.submit({
      ...typed,
      category: "institution",
      language: "en",
    });
    await caller.contact.submit({
      ...typed,
      email: "sans-categorie@example.com",
    });

    const [first, second] = vi
      .mocked(notifyOwner)
      .mock.calls.map(([payload]) => payload);
    expect(first).toMatchObject({ replyTo: "victime@example.com" });
    expect(first!.content).toContain("**Vous êtes:** Établissement");
    expect(second!.content).toContain("**Vous êtes:** Non précisé");
    // The language the visitor read, that of the acknowledgement: the owner replies in it.
    expect(first!.content).toContain("**Langue de la page:** en");
    expect(second!.content).toContain("**Langue de la page:** Non précisée");
    // The email the owner gets: « Répondre » writes to the visitor, not to the owner's own mailbox.
    const { buildOwnerNotificationEmail } = await vi.importActual<
      typeof import("./_core/notification")
    >("./_core/notification");
    const ownerEmail = buildOwnerNotificationEmail(
      first as NotificationPayload
    );
    expect(ownerEmail.replyTo).toBe("victime@example.com");
    expect(ownerEmail.to).not.toContain("victime@example.com");
    expect(
      buildOwnerNotificationEmail({
        title: "Alerte",
        content: "Sans visiteur.",
      }).replyTo
    ).toBe(ownerEmail.to[0]);
  });

  it("met la référence en tête du sujet et relie la notification à l’élément dans l’administration (INTL-11, ADM-09)", async () => {
    const caller = appRouter.createCaller(createTestContext());
    const contact = await caller.contact.submit({
      ...typed,
      name: "Jeanne Martin",
    });
    const request = await caller.gdpr.submit({
      name: "Jeanne Martin",
      email: "jeanne@example.com",
      requestType: "access",
    });

    const [contactPayload, requestPayload] = vi
      .mocked(notifyOwner)
      .mock.calls.map(([payload]) => payload);
    const { buildOwnerNotificationEmail } = await vi.importActual<
      typeof import("./_core/notification")
    >("./_core/notification");
    expect(buildOwnerNotificationEmail(contactPayload!).subject).toBe(
      `[${contact.trackingId}] Contact – Jeanne Martin`
    );
    expect(buildOwnerNotificationEmail(requestPayload!).subject).toBe(
      `[${request.trackingId}] Demande RGPD – Jeanne Martin`
    );
    expect(contactPayload!.content).toContain(
      `**Ouvrir le message:** https://drahmedbenlallahom.com/admin?tab=contacts&ref=${contact.trackingId}`
    );
    expect(requestPayload!.content).toContain(
      `**Ouvrir la demande:** https://drahmedbenlallahom.com/admin?tab=gdpr&ref=${request.trackingId}`
    );
  });

  it("refuse une catégorie inconnue sans rien enregistrer", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.contact.submit({ ...typed, category: "spam" as never })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await getDb())!.execute).not.toHaveBeenCalled();
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("envoie un seul accusé, avec la référence, sans recopier le nom, le téléphone ni le message", async () => {
    const caller = appRouter.createCaller(createTestContext());
    const { trackingId } = await caller.contact.submit({
      ...typed,
      category: "patient",
    });

    expect(sentEmails()).toHaveLength(1);
    const [{ message, options }] = sentEmails();
    expect(options).toEqual({ idempotencyKey: `ack-${trackingId}` });
    expect(message.to).toEqual(["victime@example.com"]);
    expect(message.replyTo).toBe(siteConfig.email);
    expect(message.subject).toBe(
      `Votre message a bien été reçu — ${trackingId}`
    );
    expect(message.text).toContain(`Référence : ${trackingId}`);
    expect(message.html).toContain(trackingId);
    for (const part of [message.subject, message.html, message.text]) {
      for (const text of [
        "colis",
        "phish",
        "Payez",
        "23 45 67",
        "rappel urgent",
      ])
        expect(part).not.toContain(text);
    }
  });

  it("envoie l’accusé avec l’expéditeur et la boîte de réponse réglés pour les emails aux patients, comme celui des questions santé", async () => {
    const submitWith = async (from: string, replyTo: string) => {
      vi.stubEnv("CONSULTATION_FROM_EMAIL", from);
      vi.stubEnv("CONSULTATION_REPLY_TO", replyTo);
      try {
        await appRouter.createCaller(createTestContext()).contact.submit(typed);
      } finally {
        vi.unstubAllEnvs();
      }
    };
    await submitWith(
      "Dr Ahmed Ben Lallahom <consultation@drahmedbenlallahom.com>",
      "secretariat@drahmedbenlallahom.com"
    );
    await submitWith("", "");

    expect(
      sentEmails().map(({ message }) => [message.from, message.replyTo])
    ).toEqual([
      [
        "Dr Ahmed Ben Lallahom <consultation@drahmedbenlallahom.com>",
        "secretariat@drahmedbenlallahom.com",
      ],
      // Unset: the transactional sender and the site's contact address.
      [
        "Hippocampus Consulting <recrutement@drahmedbenlallahom.com>",
        siteConfig.email,
      ],
    ]);
  });

  it("écrit l’accusé en anglais pour une page en anglais, allemand ou chinois", async () => {
    const caller = appRouter.createCaller(createTestContext());
    for (const language of ["en", "de", "zh"] as const)
      await caller.contact.submit({ ...typed, language });
    await caller.contact.submit({ ...typed, language: "fr" });

    expect(
      sentEmails().map(({ message }) => message.subject.split(" — ")[0])
    ).toEqual([
      "Your message has been received",
      "Your message has been received",
      "Your message has been received",
      "Votre message a bien été reçu",
    ]);
  });

  it("n’envoie ni accusé ni notification au-delà du volume du jour, et garde le message", async () => {
    vi.mocked(countPublicFormDailyVolume).mockResolvedValue(false);
    const caller = appRouter.createCaller(createTestContext());

    await expect(caller.contact.submit(typed)).resolves.toMatchObject({
      success: true,
    });
    expect((await getDb())!.execute).toHaveBeenCalledTimes(1);
    expect(resend.send).not.toHaveBeenCalled();
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("accepte le message quand Resend refuse l’accusé, échoue ou n’est pas configuré", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const caller = appRouter.createCaller(createTestContext());

    resend.send.mockResolvedValueOnce({
      data: null,
      error: {
        name: "validation_error",
        message: "Invalid `to` field",
        statusCode: 422,
      },
    });
    await expect(caller.contact.submit(typed)).resolves.toMatchObject({
      success: true,
    });
    resend.send.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(caller.contact.submit(typed)).resolves.toMatchObject({
      success: true,
    });
    resend.configured = false;
    await expect(caller.contact.submit(typed)).resolves.toMatchObject({
      success: true,
    });

    expect(resend.send).toHaveBeenCalledTimes(2);
    expect(notifyOwner).toHaveBeenCalledTimes(3);
    // Logged without the visitor's address.
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.flat().join(" ")).not.toContain(
      "victime@example.com"
    );
    warn.mockRestore();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { verifyCandidateTurnstile } from "./candidateTurnstile";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";

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
}));

// Cloudflare is never called from the tests: each one says what the check answers.
vi.mock("./candidateTurnstile", () => ({
  verifyCandidateTurnstile: vi.fn(async () => undefined),
}));

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("contact.submit", () => {
  it("accepts a valid contact form submission", async () => {
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.contact.submit({
        name: "Sophie Renault",
        email: "sophie@example.com",
        message: "I do not accept the privacy policy.",
        gdprConsent: 0,
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error.code).toBe("BAD_REQUEST");
      expect(error.message).toContain("RGPD");
    }
  });
});

describe("gdpr.submit", () => {
  it("accepts a valid GDPR access request", async () => {
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
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
    const ctx = createPublicContext();
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
    const caller = appRouter.createCaller(createPublicContext());
    vi.mocked(verifyCandidateTurnstile).mockRejectedValueOnce(new Error("candidate_turnstile_invalid"));

    await expect(caller.contact.submit({
      name: "Robot",
      email: "robot@example.com",
      message: "Message envoyé par un script.",
      gdprConsent: 1,
      turnstileToken: "turnstile-token-refused-by-the-mock",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(verifyCandidateTurnstile).toHaveBeenCalledWith(expect.objectContaining({ token: "turnstile-token-refused-by-the-mock" }));
    expect((await getDb())!.execute).not.toHaveBeenCalled();
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("refuse une demande RGPD dont le contrôle Turnstile échoue, sans l’enregistrer ni prévenir le cabinet", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    vi.mocked(verifyCandidateTurnstile).mockRejectedValueOnce(new Error("candidate_turnstile_invalid"));

    await expect(caller.gdpr.submit({
      name: "Robot",
      email: "robot@example.com",
      requestType: "deletion",
      turnstileToken: "turnstile-token-refused-by-the-mock",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(verifyCandidateTurnstile).toHaveBeenCalledWith(expect.objectContaining({ token: "turnstile-token-refused-by-the-mock" }));
    expect((await getDb())!.execute).not.toHaveBeenCalled();
    expect(notifyOwner).not.toHaveBeenCalled();
  });
});

describe("numéros de suivi des formulaires contact et RGPD", () => {
  it("donne à chaque envoi un numéro imprévisible au format historique, sans Math.random() ni horodatage", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const random = vi.spyOn(Math, "random");
    try {
      const contacts = await Promise.all(Array.from({ length: 20 }, () => caller.contact.submit({ name: "Jean Dupont", email: "jean@example.com", message: "Bonjour.", gdprConsent: 1 })));
      const requests = await Promise.all(Array.from({ length: 20 }, () => caller.gdpr.submit({ name: "Jane Smith", email: "jane@example.com", requestType: "access" })));

      // Twenty submissions in the same millisecond: a timestamp would repeat.
      expect(new Set(contacts.map(result => result.trackingId)).size).toBe(20);
      expect(new Set(requests.map(result => result.trackingId)).size).toBe(20);
      for (const { trackingId } of contacts) expect(trackingId).toMatch(/^C[0-9A-Z]{12}$/);
      for (const { trackingId } of requests) expect(trackingId).toMatch(/^G[0-9A-Z]{12}$/);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});

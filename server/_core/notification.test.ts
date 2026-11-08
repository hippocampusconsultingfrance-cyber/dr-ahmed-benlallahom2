import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { securityEvents } from "../../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "../testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "../testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const send = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send } })),
}));
vi.mock("../db", () => ({ getDb: async () => state.db }));

describe("notifyOwner", () => {
  beforeEach(() => {
    vi.resetModules();
    state.db = createInMemoryDrizzle();
    vi.stubEnv("RESEND_API_KEY", "re_test_owner_notifications");
    send.mockReset();
    send.mockResolvedValue({ data: { id: "email-owner" }, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("sends the private notification to the active owner mailbox", async () => {
    const { notifyOwner } = await import("./notification");
    await expect(notifyOwner({ title: "Nouveau message", content: "Référence C123" })).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: "Hippocampus Consulting <recrutement@drahmedbenlallahom.com>",
      to: ["hippocampusconsultingfrance@gmail.com"],
      subject: "Nouveau message",
    }));
  });

  it("escapes untrusted form content in the HTML email", async () => {
    const { notifyOwner } = await import("./notification");
    await notifyOwner({ title: "Contact", content: "<script>alert('x')</script>" });
    const message = send.mock.calls[0][0];
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });

  it("passes a caller idempotency key to Resend so retries cannot duplicate the email", async () => {
    const { notifyOwner } = await import("./notification");
    await notifyOwner({ title: "Nouvelle réservation", content: "APT1" }, { idempotencyKey: "appointment-owner-APT1" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: "Nouvelle réservation" }), { idempotencyKey: "appointment-owner-APT1" });
  });

  it("returns false when Resend rejects the delivery", async () => {
    send.mockResolvedValue({ data: null, error: { message: "rejected" } });
    const { notifyOwner } = await import("./notification");
    await expect(notifyOwner({ title: "Alerte", content: "Contenu" })).resolves.toBe(false);
    expect((state.db as InMemoryDrizzle).rows(securityEvents)).toEqual([]);
  });

  it("sends once more after a short retry-after when Resend rate-limits it, with the same idempotency key (ABUS-03)", async () => {
    vi.useFakeTimers();
    send.mockResolvedValueOnce({ data: null, error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" }, headers: { "retry-after": "1" } });
    const { notifyOwner } = await import("./notification");

    const delivery = notifyOwner({ title: "Réservations : au moins 6 créneaux retenus sans paiement", content: "Alerte" }, { idempotencyKey: "owner-alert-1" });
    await vi.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(delivery).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toEqual({ idempotencyKey: "owner-alert-1" });
    expect((state.db as InMemoryDrizzle).rows(securityEvents)).toEqual([]);
  });

  it("does not hold the request for a long retry-after, nor retry a rate limit twice", async () => {
    send.mockResolvedValue({ data: null, error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" }, headers: { "retry-after": "60" } });
    const { notifyOwner } = await import("./notification");
    await expect(notifyOwner({ title: "Alerte", content: "Contenu" })).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(1);

    send.mockReset();
    send.mockResolvedValue({ data: null, error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" }, headers: { "retry-after": "0" } });
    await expect(notifyOwner({ title: "Alerte", content: "Contenu" })).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("asks again at once under the same key after an uncertain answer, so an email Resend took is not sent twice (REC-09)", async () => {
    // Resend took the email but answered 500; under the same key it answers with that email.
    send.mockResolvedValueOnce({ data: null, error: { name: "internal_server_error", statusCode: 500, message: "Internal server error" } });
    const { notifyOwner } = await import("./notification");

    await expect(notifyOwner({ title: "Recrutement : Google Drive à reconnecter", content: "Alerte" }, { idempotencyKey: "google-drive-reconnection-1" })).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([, options]) => options)).toEqual([{ idempotencyKey: "google-drive-reconnection-1" }, { idempotencyKey: "google-drive-reconnection-1" }]);
  });

  it("asks again after a network error too, but only once, and reports the failure to the caller", async () => {
    send.mockRejectedValueOnce(new TypeError("fetch failed"));
    send.mockResolvedValueOnce({ data: null, error: { name: "application_error", statusCode: null, message: "Unable to fetch data. The request could not be resolved." } });
    const { notifyOwner } = await import("./notification");

    await expect(notifyOwner({ title: "Alerte", content: "Contenu" }, { idempotencyKey: "owner-alert-2" })).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("an alert queued as a job (stopAtDeadline) is not asked again once the immediate budget of the processing it runs in is spent: the request has answered (ABUS-03)", async () => {
    const { runWithProcessingDeadline, deadlineCutShort } = await import("../processingDeadline");
    const { notifyOwner } = await import("./notification");
    let now = 2_500;
    // The uncertain answer comes back after the end of the budget.
    send.mockImplementationOnce(async () => {
      now = 3_100;
      return { data: null, error: { name: "internal_server_error", statusCode: 500, message: "Internal server error" } };
    });

    await runWithProcessingDeadline(3_000, async () => {
      await expect(notifyOwner({ title: "Remboursement", content: "APT1" }, { idempotencyKey: "appointment-stripe-refund-APT1", stopAtDeadline: true })).resolves.toBe(false);
      // Its job goes back to the queue without counting the attempt.
      expect(deadlineCutShort()).toBe(true);
    }, () => now);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("an alert queued nowhere is asked again under its key even after the immediate budget, rather than lost", async () => {
    const { runWithProcessingDeadline, deadlineCutShort } = await import("../processingDeadline");
    const { notifyOwner } = await import("./notification");
    let now = 2_500;
    send.mockImplementationOnce(async () => {
      now = 3_100;
      return { data: null, error: { name: "internal_server_error", statusCode: 500, message: "Internal server error" } };
    });

    await runWithProcessingDeadline(3_000, async () => {
      await expect(notifyOwner({ title: "Échec d’envoi après paiement (APT1)", content: "APT1" }, { idempotencyKey: "appointment-confirmation-failure-APT1-refused" })).resolves.toBe(true);
      expect(deadlineCutShort()).toBe(false);
    }, () => now);
    expect(send.mock.calls.map(([, options]) => options)).toEqual([{ idempotencyKey: "appointment-confirmation-failure-APT1-refused" }, { idempotencyKey: "appointment-confirmation-failure-APT1-refused" }]);
  });

  it("does not ask again without a key (a second email could leave), nor after a clear refusal", async () => {
    send.mockResolvedValue({ data: null, error: { name: "internal_server_error", statusCode: 500, message: "Internal server error" } });
    const { notifyOwner } = await import("./notification");
    await expect(notifyOwner({ title: "Nouveau message", content: "Référence C123" })).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(1);

    send.mockReset();
    send.mockResolvedValue({ data: null, error: { name: "validation_error", statusCode: 422, message: "Invalid `to` field" } });
    await expect(notifyOwner({ title: "Alerte", content: "Contenu" }, { idempotencyKey: "owner-alert-3" })).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("logs Resend's refusal on one JSON line, by its error name and without the address it repeats (EXPL-11)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    send.mockResolvedValue({ data: null, error: { name: "validation_error", statusCode: 403, message: "You can only send testing emails to your own email address (owner.synthetic@example.test)." } });
    const { notifyOwner } = await import("./notification");

    await expect(notifyOwner({ title: "Nouveau message", content: "Référence C123" })).resolves.toBe(false);

    expect(warn.mock.calls).toEqual([[expect.any(String)]]);
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toEqual({
      label: "[Notification] Resend rejected the owner notification",
      name: "ResendError",
      code: "validation_error",
      message: "You can only send testing emails to your own email address ([email]).",
    });
    warn.mockRestore();
  });

  it("logs a used-up Resend quota as a high-severity event, without an alert loop (ABUS-03)", async () => {
    send.mockResolvedValue({ data: null, error: { name: "daily_quota_exceeded", statusCode: 429, message: "You have reached your daily quota" } });
    const { notifyOwner } = await import("./notification");

    await expect(notifyOwner({ title: "Nouveau message", content: "Référence C123" })).resolves.toBe(false);

    // The owner alert about the quota is refused too: one more event, then its window stops the chain.
    const events = (state.db as InMemoryDrizzle).rows(securityEvents);
    expect(events.map(event => ({ category: event.category, severity: event.severity, metadata: JSON.parse(String(event.metadata)) }))).toEqual([
      { category: "resend_quota_exceeded", severity: "high", metadata: { quota: "daily", emailKind: "owner_notification" } },
      { category: "resend_quota_exceeded", severity: "high", metadata: { quota: "daily", emailKind: "owner_notification" } },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].subject).toContain("resend_quota_exceeded");
  });
});

// INTL-11 — the subject of an owner notification: the reference first, so a
// search of the mailbox finds it, then the title, then the visitor's name cut
// to about 60 visible characters; never a half of an emoji, never a line break.
describe("sujet des notifications au propriétaire (INTL-11)", () => {
  /** The characters are built from their code points: none of them appears as such in this file. */
  const ZWJ = String.fromCodePoint(0x200d);
  const LINE_SEPARATOR = String.fromCodePoint(0x2028);
  const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  it("met la référence en tête, puis le titre et le nom, et garde le nom entier dans l’email", async () => {
    const { buildOwnerNotificationEmail } = await import("./notification");
    const email = buildOwnerNotificationEmail({ reference: "C7EPGD79OKU03", title: "Contact", name: "Jeanne Martin", content: "Bonjour" });
    expect(email.subject).toBe("[C7EPGD79OKU03] Contact – Jeanne Martin");
    expect(email.text.startsWith("[C7EPGD79OKU03] Contact – Jeanne Martin\n\nBonjour")).toBe(true);
    expect(buildOwnerNotificationEmail({ reference: "APT1A2B3C4D5E6F", title: "Réservation payée 100 €", name: "Ali Hassan", content: "Paiement" }).subject).toBe("[APT1A2B3C4D5E6F] Réservation payée 100 € – Ali Hassan");
    expect(buildOwnerNotificationEmail({ title: "Bilan quotidien de sécurité", content: "Rien" }).subject).toBe("Bilan quotidien de sécurité");
  });

  it("coupe un nom de 255 caractères vers 60 caractères visibles, en gardant la référence et le montant", async () => {
    const { buildOwnerNotificationEmail, OWNER_SUBJECT_NAME_MAX_CHARACTERS } = await import("./notification");
    const longName = "Mohammed Bin Khalid Abdulrahman Al-Saud ".repeat(7).slice(0, 255);
    const email = buildOwnerNotificationEmail({ reference: "APT1A2B3C4D5E6F", title: "Réservation payée 150 €", name: longName, content: "Paiement" });
    expect(email.subject.startsWith("[APT1A2B3C4D5E6F] Réservation payée 150 € – Mohammed Bin Khalid")).toBe(true);
    const shownName = email.subject.split(" – ")[1]!;
    expect(shownName.endsWith("…")).toBe(true);
    expect(Array.from(shownName).length).toBeLessThanOrEqual(OWNER_SUBJECT_NAME_MAX_CHARACTERS);
    // The whole name stays in the heading of the email.
    expect(email.text).toContain(longName.trim());
  });

  it("coupe entre deux caractères visibles : jamais une moitié d’emoji, ni une séquence ZWJ coupée", async () => {
    const { buildOwnerNotificationEmail, cutToVisibleCharacters } = await import("./notification");
    const family = ["👩", "👩", "👧", "👦"].join(ZWJ);
    // The case of the audit: 169 « a » then emojis, which .slice(0, 200) cut in the middle of one.
    const subject = buildOwnerNotificationEmail({ reference: "C7EPGD79OKU03", title: "Contact", name: `${"a".repeat(55)}${"😀".repeat(3)}${family.repeat(3)}`, content: "Bonjour" }).subject;
    expect(subject).not.toMatch(loneSurrogate);
    expect(subject.startsWith("[C7EPGD79OKU03] Contact – ")).toBe(true);
    expect(subject.endsWith(`😀😀${family}…`)).toBe(true);
    expect(cutToVisibleCharacters(`${"a".repeat(169)}${"😀".repeat(40)}`, 200)).toBe(`${"a".repeat(169)}${"😀".repeat(30)}…`);
  });

  it("ferme l’isolat ou l’enchâssement qu’un nom laisse ouvert, et retire une marque fermante qui ne ferme rien (INTL-05)", async () => {
    const { buildOwnerNotificationEmail } = await import("./notification");
    const { cleanTextInput } = await import("../../shared/textInputCleaning");
    const [RLE, PDF, RLO, RLI, FSI, PDI] = [0x202b, 0x202c, 0x202e, 0x2067, 0x2068, 0x2069].map((code) => String.fromCodePoint(code));
    const HEBREW = "דוד";
    /** Whether every isolate and embedding opened is closed, and every closing mark closes one (UAX #9 pairing). */
    const balanced = (text: string) => {
      const open: string[] = [];
      for (const mark of text.match(/[‪-‮⁦-⁩]/g) ?? []) {
        if (mark === PDF) { if (open.at(-1) !== PDF) return false; open.pop(); }
        else if (mark === PDI) { const isolate = open.lastIndexOf(PDI); if (isolate < 0) return false; open.length = isolate; }
        else open.push(mark >= "⁦" ? PDI : PDF);
      }
      return open.length === 0;
    };
    const heading = (name: string) => {
      const email = buildOwnerNotificationEmail({ reference: "APT97BCC60E01E8", title: "Réservation payée 100 €", name, content: "Paiement" });
      expect(balanced(email.subject), JSON.stringify(email.subject)).toBe(true);
      expect(balanced(email.text.split("\n")[0]!), JSON.stringify(email.text)).toBe(true);
      return email.subject.split(" – ")[1];
    };

    // The audit's name: its final PDI goes when it is stored, the subject closes the isolate again.
    const stored = cleanTextInput(`José ${RLI}${HEBREW}${PDI}`);
    expect(stored).toBe(`José ${RLI}${HEBREW}`);
    expect(heading(stored)).toBe(`José ${RLI}${HEBREW}${PDI}`);
    // An isolate opening the name goes when it is stored: its PDI, left closing nothing, goes from the subject.
    expect(heading(cleanTextInput(`${RLI}${HEBREW}${PDI} José`))).toBe(`${HEBREW} José`);
    // A name whose marks are paired is left as it is.
    expect(heading(`Ali ${FSI}${HEBREW}${PDI} ${RLE}${HEBREW}${PDF} Cohen`)).toBe(`Ali ${FSI}${HEBREW}${PDI} ${RLE}${HEBREW}${PDF} Cohen`);
    // A PDI closes the embedding opened inside its isolate; a PDF does not close past an isolate.
    expect(heading(`Ali ${RLI}${RLO}${HEBREW}${PDI} Cohen`)).toBe(`Ali ${RLI}${RLO}${HEBREW}${PDI} Cohen`);
    expect(heading(`Ali ${RLE}x ${RLI}${HEBREW}${PDF} y`)).toBe(`Ali ${RLE}x ${RLI}${HEBREW} y${PDI}${PDF}`);
    // A long name cut inside its isolate keeps it closed in the subject, and whole in the email.
    const long = `Ali ${RLI}${"א".repeat(80)}${PDI}`;
    expect(heading(long)!.endsWith(`…${PDI}`)).toBe(true);
    expect(buildOwnerNotificationEmail({ reference: "C123", title: "Contact", name: long, content: "Bonjour" }).text).toContain(long);
  });

  it("remplace les sauts de ligne d’un nom par une espace dans le sujet", async () => {
    const { buildOwnerNotificationEmail } = await import("./notification");
    for (const name of ["Ali\r\nBcc: x@evil.test", `Ali${LINE_SEPARATOR}Bcc: x@evil.test`]) {
      const email = buildOwnerNotificationEmail({ reference: "C123", title: "Contact", name, content: "Bonjour" });
      expect(email.subject).toBe("[C123] Contact – Ali Bcc: x@evil.test");
    }
  });
});

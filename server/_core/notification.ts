import { TRPCError } from "@trpc/server";
import { Resend } from "resend";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const OWNER_NOTIFICATION_EMAIL = process.env.OWNER_NOTIFICATION_EMAIL?.trim() || "hippocampusconsultingfrance@gmail.com";
const FROM_EMAIL = "Hippocampus Consulting <recrutement@drahmedbenlallahom.com>";
let resendClient: Resend | undefined;

function getResendClient(): Resend | undefined {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return undefined;
  resendClient ??= new Resend(apiKey);
  return resendClient;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/** Dispatches a private project-owner notification through Resend. */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);
  const resend = getResendClient();
  if (!resend) {
    console.warn("[Notification] Resend is not configured; the database record remains available.");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [OWNER_NOTIFICATION_EMAIL],
      replyTo: OWNER_NOTIFICATION_EMAIL,
      subject: title.slice(0, 200),
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a"><div style="padding:18px 22px;background:#071827;color:#fff;border-bottom:3px solid #0891b2"><strong>Hippocampus Consulting</strong></div><div style="padding:24px;border:1px solid #dbe4ee;border-top:0"><h2 style="margin-top:0;color:#0e7490">${escapeHtml(title)}</h2><div style="white-space:pre-wrap;line-height:1.6">${escapeHtml(content)}</div><p style="margin-top:24px;font-size:12px;color:#64748b">Notification privée générée par drahmedbenlallahom.com</p></div></div>`,
      text: `${title}\n\n${content}\n\nNotification privée générée par drahmedbenlallahom.com`,
    });
    if (error) {
      console.warn(`[Notification] Resend rejected the owner notification: ${error.message}`);
      return false;
    }
    return true;
  } catch {
    console.warn("[Notification] Owner email delivery failed.");
    return false;
  }
}

import { randomUUID } from "node:crypto";
import { recruitmentEmailEvents } from "../drizzle/schema";
import { getDb } from "./db";
import {
  sendCvApplicationConfirmationEmail,
  type CvApplicationConfirmationDelivery,
} from "./_core/notifications";

export type TrackedCvConfirmationInput = {
  applicationId: number;
  candidateEmail: string;
  candidateName: string;
  trackingId: string;
  specialty: string;
  targetCountries: string;
  candidatePortalInviteUrl?: string;
};

export function buildCvConfirmationEmailEvent(
  input: Pick<TrackedCvConfirmationInput, "applicationId" | "candidateEmail" | "trackingId">,
  delivery: CvApplicationConfirmationDelivery,
  options: { now?: Date; localEventId?: string } = {},
) {
  return {
    providerEventId: delivery.providerEmailId
      ? `send:${delivery.providerEmailId}`
      : `local:${options.localEventId || randomUUID()}`,
    providerEmailId: delivery.providerEmailId,
    campaignRecipientId: null,
    applicationId: input.applicationId,
    eventType: delivery.status === "sent" ? "email.sent" : "email.failed",
    recipientEmail: input.candidateEmail.trim().toLowerCase(),
    payload: JSON.stringify({
      kind: "application_confirmation",
      outcome: delivery.status,
      failureCode: delivery.failureCode,
      trackingId: input.trackingId,
    }),
    occurredAt: options.now || new Date(),
  };
}

export async function sendTrackedCvApplicationConfirmationEmail(
  input: TrackedCvConfirmationInput,
): Promise<CvApplicationConfirmationDelivery> {
  const delivery = await sendCvApplicationConfirmationEmail(
    input.candidateEmail,
    input.candidateName,
    input.trackingId,
    input.specialty,
    input.targetCountries,
    input.candidatePortalInviteUrl,
  );

  try {
    const db = await getDb();
    if (db) {
      await db.insert(recruitmentEmailEvents).values(buildCvConfirmationEmailEvent(input, delivery));
    }
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error("Recruitment confirmation trace error:", errorName);
  }

  return delivery;
}

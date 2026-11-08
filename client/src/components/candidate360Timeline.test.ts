import { describe, expect, it } from "vitest";
import { buildCandidateTimeline } from "./candidate360Timeline";

describe("chronologie candidat 360°", () => {
  it("conserve la demande libre de pièces dans la chronologie", () => {
    const timeline = buildCandidateTimeline({
      createdAt: new Date("2026-08-01T08:00:00.000Z"),
      audits: [{ id: 1, action: "email", metadata: JSON.stringify({ template: "additional_information", customRequest: "Attestation d’inscription et diplômes" }), createdAt: new Date("2026-08-02T08:00:00.000Z") }],
      campaignRecipients: [],
      followUps: [],
    });

    expect(timeline[0]).toMatchObject({ title: "Demande de complément envoyée", detail: "Pièces ou informations demandées : Attestation d’inscription et diplômes" });
  });

  it("nomme la confirmation d’une certification, celle de son renouvellement et l’accord du candidat pour une mission (IA-02, RGPD-03)", () => {
    const audit = (id: number, metadata: Record<string, unknown>) => ({ id, action: "status_update", metadata: JSON.stringify(metadata), createdAt: new Date(`2026-10-2${id}T08:00:00.000Z`) });
    const timeline = buildCandidateTimeline({
      createdAt: new Date("2026-10-19T08:00:00.000Z"),
      audits: [
        audit(1, { event: "certification_confirmed", certification: "Licence DHA" }),
        audit(2, { event: "certification_unconfirmed", certification: "Licence DHA" }),
        audit(3, { event: "mission_consent", briefId: 7, consentDate: "2026-10-23" }),
        audit(4, { event: "mission_consent", briefId: 7, consentDate: null }),
        audit(5, { event: "certification_renewed", certification: "ACLS", expiresAt: "2028-06-30", previousExpiresAt: ["2023-05"] }),
        audit(6, { event: "certification_renewed", certification: "BLS", expiresAt: null, previousExpiresAt: ["2024"] }),
        audit(7, { event: "certification_unconfirmed", certification: "Licence DHA", notRetainedByAnalysis: true }),
      ],
      campaignRecipients: [],
      followUps: [],
    });

    expect(timeline.map(event => event.title)).toEqual([
      "Confirmation retirée : Licence DHA (non retenue par la dernière analyse du CV)",
      "Renouvellement confirmé : BLS (sans date d’expiration)",
      "Renouvellement confirmé : ACLS (expire le 30/06/2028)",
      "Accord du candidat retiré pour une mission",
      "Accord du candidat noté pour une mission",
      "Confirmation retirée : Licence DHA",
      "Certification confirmée : Licence DHA",
      "Candidature reçue",
    ]);
  });

  it("date l’échéance d’une relance au jour de Paris et dit la délivrabilité d’une campagne en mots (ADM-07)", () => {
    const previous = process.env.TZ;
    // A browser in Dubai: 01:30 on 5 August there is still 4 August in Paris.
    process.env.TZ = "Asia/Dubai";
    try {
      const timeline = buildCandidateTimeline({
        createdAt: new Date("2026-08-01T08:00:00.000Z"),
        audits: [],
        campaignRecipients: [
          { id: 1, campaignTitle: "Urgences Dubaï", deliveryStatus: "delivered", error: null, sentAt: new Date("2026-08-02T08:00:00.000Z"), deliveredAt: new Date("2026-08-02T08:01:00.000Z"), lastEventAt: null },
          { id: 2, campaignTitle: "Pédiatrie Doha", deliveryStatus: "bounced", error: null, sentAt: new Date("2026-08-02T09:00:00.000Z"), deliveredAt: null, lastEventAt: null },
        ],
        followUps: [{ id: 3, kind: "custom", status: "suggested", notes: null, dueAt: new Date("2026-08-04T21:30:00.000Z"), completedAt: null }],
      });

      expect(timeline.find(event => event.kind === "follow_up")?.detail).toBe("Échéance : 04/08/2026");
      expect(timeline.filter(event => event.kind === "campaign").map(event => event.detail)).toEqual(["Statut de délivrabilité : rejeté par la messagerie du destinataire", "Statut de délivrabilité : remis"]);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it("place les événements les plus récents en premier", () => {
    const timeline = buildCandidateTimeline({
      createdAt: new Date("2026-08-01T08:00:00.000Z"),
      audits: [],
      campaignRecipients: [],
      followUps: [{ id: 3, kind: "custom", status: "suggested", notes: null, dueAt: new Date("2026-08-04T08:00:00.000Z"), completedAt: null }],
    });

    expect(timeline[0]?.kind).toBe("follow_up");
  });
});

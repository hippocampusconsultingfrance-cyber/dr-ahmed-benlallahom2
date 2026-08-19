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

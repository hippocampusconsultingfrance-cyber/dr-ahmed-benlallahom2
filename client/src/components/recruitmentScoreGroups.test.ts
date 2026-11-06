import { describe, expect, it } from "vitest";
import { scoredApplicationsFirst } from "./recruitmentScoreGroups";

describe("INTL-02 — dossiers sans score dans une liste lue par score", () => {
  const dossiers = [
    { name: "Arabe (sans score)", score: null },
    { name: "Score 92", score: 92 },
    { name: "Chinois (sans score)", score: null },
    { name: "Score 81", score: 81 },
  ];

  it("place les dossiers notés d’abord, dans leur ordre, puis les dossiers sans score sous leur rubrique", () => {
    const listed = scoredApplicationsFirst(dossiers, dossier => dossier.score);
    expect(listed.items.map(dossier => dossier.name)).toEqual(["Score 92", "Score 81", "Arabe (sans score)", "Chinois (sans score)"]);
    expect(listed.firstUnscored).toBe(2);
  });

  it("n’ouvre pas de rubrique quand tous les dossiers ont un score, ni n’en perd un quand aucun n’en a", () => {
    expect(scoredApplicationsFirst(dossiers.filter(dossier => dossier.score !== null), dossier => dossier.score).firstUnscored).toBe(-1);
    const unscored = scoredApplicationsFirst(dossiers.filter(dossier => dossier.score === null), dossier => dossier.score);
    expect(unscored).toEqual({ items: dossiers.filter(dossier => dossier.score === null), firstUnscored: 0 });
  });
});

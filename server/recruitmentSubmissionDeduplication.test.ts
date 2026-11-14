import { describe, expect, it } from "vitest";
import { isSameRecruitmentSubmission } from "./recruitmentSubmissionDeduplication";

describe("déduplication des candidatures", () => {
  it("réutilise uniquement une candidature identique du même candidat et du même parcours", () => {
    expect(
      isSameRecruitmentSubmission(
        {
          email: "candidate@example.com",
          specialty: "Cardiologie",
          targetCountries: JSON.stringify(["Canada", "Suisse"]),
        },
        {
          email: " Candidate@Example.com ",
          specialty: " cardiologie ",
          targetCountries: ["suisse", "Canada"],
        }
      )
    ).toBe(true);
  });

  it("autorise le même CV pour un nouveau parcours VVIP", () => {
    expect(
      isSameRecruitmentSubmission(
        {
          email: "candidate@example.com",
          specialty: "Cardiologie",
          targetCountries: JSON.stringify(["Canada"]),
        },
        {
          email: "candidate@example.com",
          specialty: "[VVIP / Offshore] Cardiologie",
          targetCountries: ["Canada"],
        }
      )
    ).toBe(false);
  });

  it("enregistre une nouvelle candidature VVIP pour d’autres pays (INTL-03), pas pour d’autres environnements (REC-11)", () => {
    // As the VVIP form sends it: the countries chosen, the environments on their own, outside the identity.
    const existing = {
      email: "candidate@example.com",
      specialty: "[VVIP / Offshore] Médecin urgentiste (ATLS / ACLS)",
      targetCountries: JSON.stringify(["Qatar"]),
    };
    const sent = (targetCountries: string[], environments: string[]) => ({
      ...existing,
      targetCountries,
      environments,
    });
    expect(
      isSameRecruitmentSubmission(
        existing,
        sent(["Qatar", "Oman"], ["Moyen-Orient (Gouvernement / VVIP)"])
      )
    ).toBe(false);
    expect(
      isSameRecruitmentSubmission(
        existing,
        sent(["Oman"], ["Moyen-Orient (Gouvernement / VVIP)"])
      )
    ).toBe(false);
    expect(
      isSameRecruitmentSubmission(
        existing,
        sent(["Qatar"], ["Moyen-Orient (Gouvernement / VVIP)"])
      )
    ).toBe(true);
    expect(
      isSameRecruitmentSubmission(
        existing,
        sent(["Qatar"], ["Sociétés minières & industrielles isolées"])
      )
    ).toBe(true);
  });

  it("n’assimile jamais deux candidats différents", () => {
    expect(
      isSameRecruitmentSubmission(
        {
          email: "first@example.com",
          specialty: "Cardiologie",
          targetCountries: JSON.stringify(["Canada"]),
        },
        {
          email: "second@example.com",
          specialty: "Cardiologie",
          targetCountries: ["Canada"],
        }
      )
    ).toBe(false);
  });
});

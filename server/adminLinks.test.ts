import { afterEach, describe, expect, it, vi } from "vitest";
import { adminLocationOf, ADMIN_TABS } from "../shared/adminTabs";

// ADM-09 — the link of an owner notification opens its section of the
// dashboard on the element of its reference: on the site's public address,
// with the section and the reference only, which the dashboard reads back.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function adminLinkOn(origin?: string) {
  if (origin !== undefined) vi.stubEnv("PUBLIC_APP_ORIGIN", origin);
  return (await import("./adminLinks")).adminLink;
}

describe("adminLink", () => {
  it("relie chaque notification à sa section et à son élément, que le tableau de bord rouvre", async () => {
    const adminLink = await adminLinkOn();
    for (const [tab, reference] of [
      ["contacts", "C7EPGD79OKU03"],
      ["gdpr", "GABCDEFGHJKLM"],
      ["appointments", "APT1A2B3C4D5E6F"],
      ["medicalQuestions", "QMED-ABCDEFGH-12345"],
      ["recruitment", "CVABCDEFGHJKLMNPQ"],
      ["employerBriefs", "BRIEFABCDEFGHJKL"],
    ] as const) {
      const link = new URL(adminLink(tab, reference));
      expect(`${link.origin}${link.pathname}`).toBe(
        "https://drahmedbenlallahom.com/admin"
      );
      expect(adminLocationOf(link.search)).toEqual({ tab, reference });
    }
    expect(adminLink("medicalQuestions", "QMED-ABCDEFGH-12345")).toBe(
      "https://drahmedbenlallahom.com/admin?tab=medicalQuestions&ref=QMED-ABCDEFGH-12345"
    );
  });

  it("reste sur l’adresse publique du site (PUBLIC_APP_ORIGIN)", async () => {
    const adminLink = await adminLinkOn(
      "https://preprod.drahmedbenlallahom.test"
    );
    expect(adminLink("contacts", "C123")).toBe(
      "https://preprod.drahmedbenlallahom.test/admin?tab=contacts&ref=C123"
    );
  });

  it("ne met dans le lien aucune donnée personnelle : ce qui n’a pas la forme d’une référence est laissé de côté", async () => {
    const adminLink = await adminLinkOn();
    for (const notAReference of [
      "jeanne@example.test",
      "Jeanne Martin",
      "+33 6 12 34 56 78",
      "<script>",
      "A".repeat(41),
    ]) {
      expect(adminLink("contacts", notAReference)).toBe(
        "https://drahmedbenlallahom.com/admin?tab=contacts"
      );
    }
    expect(adminLink("overview")).toBe("https://drahmedbenlallahom.com/admin");
  });
});

describe("adminLocationOf", () => {
  it("ouvre la vue d’ensemble pour une adresse sans section ou d’une section inconnue, sans reprendre une référence d’une autre forme", () => {
    expect(adminLocationOf("")).toEqual({ tab: "overview", reference: "" });
    expect(adminLocationOf("?tab=blog&ref=C123")).toEqual({
      tab: "overview",
      reference: "C123",
    });
    expect(adminLocationOf("?tab=contacts&ref=jeanne%40example.test")).toEqual({
      tab: "contacts",
      reference: "",
    });
    for (const tab of ADMIN_TABS)
      expect(adminLocationOf(`tab=${tab}`).tab).toBe(tab);
  });
});

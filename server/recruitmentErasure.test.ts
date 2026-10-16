import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const erasure = readFileSync(new URL("./recruitmentErasure.ts", import.meta.url), "utf8");
const recruitmentTab = readFileSync(new URL("../client/src/components/RecruitmentTab.tsx", import.meta.url), "utf8");

describe("effacement RGPD des candidatures", () => {
  it("passe par la routine d’effacement complète, réservée à l’administrateur vérifié", () => {
    const erase = source.slice(source.indexOf("erase: adminProcedure"), source.indexOf("// Employer mission briefs"));
    expect(erase).toContain("eraseCandidateApplication");
    expect(erase).toContain('reason: "admin_gdpr_request"');
    expect(erase).not.toContain("dereferenced_managed_storage_no_delete_api");
  });

  it("supprime réellement les fichiers et la copie Drive, et ne garde qu’une preuve hachée", () => {
    expect(erasure).toContain("storageDelete");
    expect(erasure).toContain("deleteDriveCopies");
    expect(erasure).toContain("ERASURE_PENDING_DRIVE_PREFIX");
    expect(erasure).toContain("emailHash: hashSecurityValue(application.email)");
    expect(erasure).toContain("trackingIdHash: sha256(application.trackingId)");
  });

  it("explique clairement à l’administrateur la portée de l’effacement et son résultat", () => {
    expect(recruitmentTab).toContain("Effacer RGPD + preuve");
    expect(recruitmentTab).toContain("Seule une preuve d’effacement anonymisée est conservée");
    expect(recruitmentTab).toContain("describeErasureReport");
    expect(recruitmentTab).not.toContain("révocation immédiate de l’accès au document");
  });
});

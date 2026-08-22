import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const recruitmentTab = readFileSync(new URL("../client/src/components/RecruitmentTab.tsx", import.meta.url), "utf8");

describe("effacement manuel RGPD des candidatures", () => {
  it("révoque la référence du stockage avec une preuve non sensible, sans purge automatique", () => {
    expect(source).toContain("storageKeyFingerprint");
    expect(source).toContain("dereferenced_managed_storage_no_delete_api");
    expect(source).toContain('erasureMode: "manual_rgpd"');
    expect(source).toContain("physicalDeletionAvailable: false");
    expect(source).not.toContain("storageDelete(");
  });

  it("explique clairement à l’administrateur la portée de l’effacement", () => {
    expect(recruitmentTab).toContain("Effacer RGPD + preuve");
    expect(recruitmentTab).toContain("révocation immédiate de l’accès au document");
    expect(recruitmentTab).toContain("preuve RGPD ajoutée au journal");
  });
});

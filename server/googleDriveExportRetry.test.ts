import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("reprise traçable des exports Google Drive", () => {
  it("cible uniquement la candidature demandée et actualise chaque transition", async () => {
    const source = await readFile(new URL("./googleDriveExport.ts", import.meta.url), "utf8");
    expect(source).toContain("retryCvGoogleDriveExport");
    expect(source).toContain("inArray(cvGoogleDriveExportJobs.applicationId, applicationIds)");
    expect(source).toContain("updatedAt: requestedAt");
    expect(source).toContain("updatedAt: startedAt");
    expect(source).toContain("updatedAt: now");
  });

  it("expose la reprise à l’administration et conserve une preuve d’audit", async () => {
    const [router, dashboard] = await Promise.all([
      readFile(new URL("./routers.ts", import.meta.url), "utf8"),
      readFile(new URL("../client/src/components/RecruitmentTab.tsx", import.meta.url), "utf8"),
    ]);
    expect(router).toContain("retryCvGoogleDriveExport");
    expect(router).toContain('event: "google_drive_retry"');
    expect(router).toContain("processDueCvGoogleDriveExports(1, [application.id])");
    expect(dashboard).toContain("Relancer la copie");
    expect(dashboard).toContain("recruitmentDriveExportErrorLabel");
  });
});

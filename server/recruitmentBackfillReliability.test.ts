import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { googleDriveFileLookupQuery } from "./googleDriveExport";

const analysisSource = readFileSync(new URL("./recruitmentProcessing.ts", import.meta.url), "utf8");
const driveSource = readFileSync(new URL("./googleDriveExport.ts", import.meta.url), "utf8");

function functionBody(source: string, name: string, nextMarker: string) {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf(nextMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("rattrapage fiable des traitements de candidature", () => {
  it("ne sélectionne que les CV sans tâche IA et conserve le délai des reprises", () => {
    const body = functionBody(
      analysisSource,
      "backfillLegacyCvAnalysisJobs",
      "/** Release jobs left in `running`",
    );

    expect(body).toContain(".leftJoin(cvProcessingJobs");
    expect(body).toContain("isNull(cvProcessingJobs.id)");
    expect(body).not.toContain('inArray(cvProcessingJobs.status, ["queued", "retry"])');
    expect(body).not.toContain("scheduledFor: new Date()");
  });

  it("ne sélectionne que les CV sans tâche Drive et ne court-circuite pas le backoff", () => {
    const body = functionBody(
      driveSource,
      "backfillCvGoogleDriveExportJobs",
      "/** Release export jobs left in `running`",
    );

    expect(body).toContain(".leftJoin(cvGoogleDriveExportJobs");
    expect(body).toContain("isNull(cvGoogleDriveExportJobs.id)");
    expect(body).not.toContain('inArray(cvGoogleDriveExportJobs.status, ["queued", "retry"])');
    expect(body).not.toContain("acceleratedAt");
  });

  it("retrouve une copie Drive existante avant un nouvel upload", () => {
    expect(googleDriveFileLookupQuery("folder'\\id", "CV'\\42")).toBe(
      "'folder\\'\\\\id' in parents and trashed = false and appProperties has { key='recruitmentTrackingId' and value='CV\\'\\\\42' }",
    );
    expect(driveSource).toContain("const existingDriveFile = await findCvInGoogleDrive");
    expect(driveSource).toContain("appProperties: { [DRIVE_TRACKING_PROPERTY]: input.trackingId }");
    expect(driveSource).toContain("reusedExistingFile: Boolean(existingDriveFile)");
  });

  it("ne rouvre pas automatiquement une tâche Drive déjà terminale", () => {
    const body = functionBody(
      driveSource,
      "enqueueCvGoogleDriveExport",
      "/**\n * Retry one Drive export",
    );

    expect(body).toContain(".onConflictDoNothing()");
    expect(body).not.toContain(".onConflictDoUpdate(");
  });
});

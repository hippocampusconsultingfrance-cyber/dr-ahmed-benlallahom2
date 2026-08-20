import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("états asynchrones tRPC critiques", () => {
  it("protège les parcours réservation et candidat avec des états explicites", async () => {
    const root = process.cwd();
    const [booking, portal, verify, audit] = await Promise.all([
      readFile(path.join(root, "client/src/pages/BookingPage.tsx"), "utf8"),
      readFile(path.join(root, "client/src/pages/CandidatePortalPage.tsx"), "utf8"),
      readFile(path.join(root, "client/src/pages/CandidateVerifyPage.tsx"), "utf8"),
      readFile(path.join(root, "TRPC_ASYNC_STATE_AUDIT.md"), "utf8"),
    ]);
    for (const marker of ["availabilityError", "PublicContentSkeleton cards={1}", "disabled={isLoading || availabilityPending || availabilityError"]) expect(booking).toContain(marker);
    for (const marker of ["sessions.isLoading", "documents.isLoading", "documents.isError", "documents.refetch()", "copy.noDocuments", "copy.uploadError"]) expect(portal).toContain(marker);
    for (const marker of ["verification.isPending", "verification.isSuccess", "copy.invalidTitle", "PublicContentSkeleton"]) expect(verify).toContain(marker);
    for (const marker of ["Réservation", "Coffre candidat", "Vérification e-mail candidat", "sans détail technique", "nouvelle tentative"]) expect(audit).toContain(marker);
  });
});

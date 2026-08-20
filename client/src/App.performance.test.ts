import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("découpage des parcours", () => {
  it("conserve le tableau de bord administratif hors du chargement initial public", async () => {
    const app = await readFile(path.resolve(process.cwd(), "client", "src", "App.tsx"), "utf8");

    expect(app).toContain('const AdminDashboard = lazy(() => import("./pages/AdminDashboard"))');
    expect(app).toContain('const CandidatePortalPage = lazy(() => import("./pages/CandidatePortalPage"))');
    expect(app).toContain('const BookingPage = lazy(() => import("./pages/BookingPage"))');
  });
});

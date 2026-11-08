import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { createTestContext } from "./testSupport/trpcContext";

vi.mock("./db", () => ({ getDb: vi.fn() }));

describe("accès administratif aux briefs Employeurs", () => {
  it("refuse la lecture des briefs lorsqu’aucun administrateur n’est authentifié", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(caller.admin.clientBriefs.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuse l’envoi d’une invitation de portail sans administrateur authentifié", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(caller.admin.recruitment.candidate.sendPortalInvitation({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

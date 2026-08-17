import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({ getDb: vi.fn() }));

function publicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("accès administratif aux briefs Employeurs", () => {
  it("refuse la lecture des briefs lorsqu’aucun administrateur n’est authentifié", async () => {
    const caller = appRouter.createCaller(publicContext());
    await expect(caller.admin.clientBriefs.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

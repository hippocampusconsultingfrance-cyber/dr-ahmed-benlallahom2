import { describe, expect, it, vi } from "vitest";

// Démarrage à froid de la fonction Vercel : startServer() n’y tourne jamais. Les
// variables critiques manquantes sont journalisées sans faire planter la
// fonction, pour que /api/health et le reste du site continuent de répondre.

const calls = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock("./_core/env", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/env")>(),
  reportCriticalProductionEnvironment: vi.fn(() => { calls.order.push("report"); return { ok: false, missing: ["CRON_SECRET"], enforced: true }; }),
  assertCriticalProductionEnvironment: vi.fn(() => { calls.order.push("assert"); throw new Error("missing CRON_SECRET"); }),
}));
vi.mock("./_core/index", () => ({
  createApp: vi.fn(async () => {
    calls.order.push("createApp");
    return (_req: unknown, res: { end: (body: string) => void }) => res.end("app");
  }),
}));

describe("point d’entrée de la fonction Vercel", () => {
  it("exécute le contrôle non bloquant au démarrage à froid, puis sert l’application", async () => {
    const { default: handler } = await import("./vercelEntry");
    const end = vi.fn();
    await handler({} as never, { end } as never);

    expect(calls.order).toEqual(["report", "createApp"]);
    expect(end).toHaveBeenCalledWith("app");
  });
});

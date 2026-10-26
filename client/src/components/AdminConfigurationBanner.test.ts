import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Bandeau de l’administration (OPS-01) : noms des variables critiques
// manquantes, jamais leurs valeurs, lus par la procédure réservée à l’admin
// (server/adminProcedureGuard.test.ts la refuse à tout autre compte).

const view = vi.hoisted(() => ({ data: undefined as undefined | { ok: boolean; missing: string[]; enforced: boolean }, procedures: [] as string[] }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    system: {
      configurationStatus: {
        useQuery: () => {
          view.procedures.push("system.configurationStatus");
          return { data: view.data };
        },
      },
    },
  },
}));

const { default: AdminConfigurationBanner, MISSING_VARIABLE_IMPACT } = await import("./AdminConfigurationBanner");

const render = () => renderToStaticMarkup(createElement(AdminConfigurationBanner));

beforeEach(() => {
  view.data = undefined;
  view.procedures = [];
});

describe("bandeau admin de configuration", () => {
  it("annonce les noms manquants et leur effet dans une alerte", () => {
    view.data = { ok: false, missing: ["CRON_SECRET", "RESEND_WEBHOOK_SECRET"], enforced: true };
    const html = render();

    expect(view.procedures).toEqual(["system.configurationStatus"]);
    expect(html).toMatch(/^<div role="alert"/);
    expect(html).toContain("2 variables d’environnement critiques manquent");
    for (const name of ["CRON_SECRET", "RESEND_WEBHOOK_SECRET"]) {
      expect(html).toContain(`>${name}</code>`);
      expect(html).toContain(MISSING_VARIABLE_IMPACT[name]);
    }
  });

  it("ne montre rien tant que la configuration est complète ou inconnue", () => {
    expect(render()).toBe("");
    view.data = { ok: true, missing: [], enforced: true };
    expect(render()).toBe("");
  });
});

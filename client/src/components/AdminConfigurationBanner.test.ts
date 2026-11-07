import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Bandeau de l’administration (OPS-01) : noms des variables critiques
// manquantes, jamais leurs valeurs, lus par la procédure réservée à l’admin
// (server/adminProcedureGuard.test.ts la refuse à tout autre compte), et ce
// qu’il faut changer pour chaque incohérence relevée selon VERCEL_ENV (EXPL-20),
// dont le serveur n’envoie que le code.

const view = vi.hoisted(() => ({ data: undefined as undefined | { ok: boolean; missing: string[]; enforced: boolean; warnings?: string[] }, procedures: [] as string[] }));

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

const { default: AdminConfigurationBanner, CONFIGURATION_WARNING_ADVICE, MISSING_VARIABLE_IMPACT } = await import("./AdminConfigurationBanner");
const { CONFIGURATION_WARNINGS } = await import("../../../server/_core/env");

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
    view.data = { ok: true, missing: [], enforced: true, warnings: [] };
    expect(render()).toBe("");
  });

  it("dit ce qu’il faut changer pour une clé de test en production, sans variable manquante", () => {
    view.data = { ok: true, missing: [], enforced: true, warnings: ["stripe_test_key_in_production", "turnstile_test_key"] };
    const html = render();

    expect(html).toMatch(/^<div role="alert"/);
    expect(html).toContain("Configuration à vérifier");
    expect(html).not.toContain("Configuration de production incomplète");
    expect(html).toContain("aucun paiement réel n’est encaissé");
    expect(html).toContain("la vérification anti-robot des formulaires publics accepte tout");
    expect(html).not.toContain("préproduction (Preview)");
  });

  it("dit de changer avec les clés ce qui en dépend, pour ne pas couper l’accès ni les formulaires", () => {
    const advice = (code: string) => {
      view.data = { ok: true, missing: [], enforced: true, warnings: [code] };
      return render();
    };
    // The owner's account has another id in Clerk's production instance: without it, no one is admin.
    expect(advice("clerk_test_key_in_production")).toContain("l’identifiant de ce compte (user_…) dans CLERK_OWNER_USER_ID");
    // A real secret with Cloudflare's test site key refuses the dummy token of every public form.
    expect(advice("turnstile_test_key")).toContain("la clé de site et la clé secrète d’un même widget du site (Cloudflare → Turnstile) dans VITE_TURNSTILE_SITE_KEY et TURNSTILE_SECRET_KEY");
    // Restricted Stripe keys are flagged too: the advice names their prefix.
    expect(advice("stripe_test_key_in_production")).toContain("sk_test_ ou rk_test_");
    expect(advice("live_key_in_preview")).toContain("Stripe (sk_live_, rk_live_)");
  });

  it("montre ensemble les variables manquantes et les incohérences", () => {
    view.data = { ok: false, missing: ["CRON_SECRET"], enforced: true, warnings: ["live_key_in_preview"] };
    const html = render();

    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html).toContain("Une variable d’environnement critique manque");
    expect(html).toContain(">CRON_SECRET</code>");
    expect(html).toContain("un essai y encaisserait de vrais paiements");
  });

  it("explique chaque code que le serveur peut envoyer", () => {
    for (const code of CONFIGURATION_WARNINGS) {
      view.data = { ok: true, missing: [], enforced: true, warnings: [code] };
      const html = render();
      expect(CONFIGURATION_WARNING_ADVICE[code], code).toBeTruthy();
      expect(html, code).not.toContain(`>${code}<`);
    }
    view.data = { ok: true, missing: [], enforced: true, warnings: ["public_origin_mismatch"] };
    expect(render()).toContain("PUBLIC_APP_ORIGIN n’est pas exactement https://drahmedbenlallahom.com");
  });
});

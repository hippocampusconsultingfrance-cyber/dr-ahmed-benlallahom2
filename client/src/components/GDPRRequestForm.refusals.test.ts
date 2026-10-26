import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { siteConfig } from "@/data/site-config";

// ABUS-01 — une demande RGPD refusée par la limite par connexion dit quand
// réessayer et rappelle l'adresse de contact donnée par la politique de
// confidentialité ; un anti-robot refusé demande de recharger la page.

type Language = "fr" | "en" | "de" | "zh";
const view = vi.hoisted(() => ({
  language: "fr" as "fr" | "en" | "de" | "zh",
  error: null as unknown,
  onError: null as null | ((error: unknown) => void),
}));
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/LanguageContext", async () => {
  const contents = {
    fr: (await import("@/data/content-fr")).contentFr,
    en: (await import("@/data/content-en")).contentEn,
    de: (await import("@/data/content-de")).contentDe,
    zh: (await import("@/data/content-zh")).contentZh,
  };
  return { useLanguage: () => ({ language: view.language, content: contents[view.language] }) };
});
vi.mock("@/lib/trpc", () => ({
  trpc: {
    gdpr: {
      submit: {
        useMutation: (options: { onError: (error: unknown) => void }) => {
          view.onError = options.onError;
          return { isPending: false, error: view.error, mutate: () => undefined };
        },
      },
    },
  },
}));
vi.mock("./TurnstileWidget", () => ({ TurnstileWidget: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));

const { default: GDPRRequestForm, gdprRequestCopy } = await import("./GDPRRequestForm");

const SERVER_MESSAGE = "Texte français écrit par le serveur.";
/** Error of a refused tRPC call as the client receives it: French message, code and stable reason in `data`. */
const refusal = (code: string, reason?: string) => ({ message: SERVER_MESSAGE, data: { code, ...(reason ? { reason } : {}) } });

function renderAlert(language: Language, error: unknown) {
  view.language = language;
  view.error = error;
  const html = renderToStaticMarkup(createElement(GDPRRequestForm));
  expect(html).not.toContain(SERVER_MESSAGE);
  return /<p role="alert"[^>]*>([^<]*)<\/p>/.exec(html)?.[1] ?? null;
}

beforeEach(() => {
  toastError.mockClear();
  view.onError = null;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); });

describe("GDPRRequestForm — refus traduits (ABUS-01)", () => {
  it("dit que la limite est atteinte, quand réessayer, et rappelle l'adresse de contact", () => {
    expect(renderAlert("fr", refusal("TOO_MANY_REQUESTS", "rate_limited")))
      .toBe(`Trop de demandes depuis cette connexion. Réessayez dans 24 heures, ou écrivez directement à ${siteConfig.email}.`);
    expect(renderAlert("en", refusal("TOO_MANY_REQUESTS", "rate_limited")))
      .toBe(`Too many requests from this connection. Please try again in 24 hours, or write directly to ${siteConfig.email}.`);
    for (const language of ["de", "zh"] as const) {
      const alert = renderAlert(language, refusal("TOO_MANY_REQUESTS", "rate_limited"));
      expect(alert, language).toBe(gdprRequestCopy[language].refusals.rate_limited.replace("{email}", siteConfig.email));
      expect(alert, language).toContain(siteConfig.email);
      expect(alert, language).toContain("24");
    }
  });

  it("demande de recharger la page après un anti-robot refusé", () => {
    expect(renderAlert("fr", refusal("BAD_REQUEST", "security_check_failed"))).toBe("La vérification anti-robot a échoué. Rechargez la page, puis renvoyez votre demande.");
    expect(renderAlert("en", refusal("BAD_REQUEST", "security_check_failed"))).toBe("The anti-bot check failed. Reload the page, then submit your request again.");
    for (const language of ["de", "zh"] as const) {
      expect(renderAlert(language, refusal("BAD_REQUEST", "security_check_failed")), language).toBe(gdprRequestCopy[language].refusals.security_check_failed);
    }
  });

  it("dit de réessayer plus tard, ou d'écrire à l'adresse de contact, quand Cloudflare ne peut pas vérifier la demande", () => {
    const unavailable = refusal("SERVICE_UNAVAILABLE", "security_check_unavailable");
    expect(renderAlert("fr", unavailable))
      .toBe(`La vérification anti-robot est momentanément indisponible. Votre demande n’a pas été envoyée : réessayez dans quelques minutes, ou écrivez directement à ${siteConfig.email}.`);
    expect(renderAlert("en", unavailable))
      .toBe(`The anti-bot check is temporarily unavailable. Your request has not been sent: please try again in a few minutes, or write directly to ${siteConfig.email}.`);
    for (const language of ["de", "zh"] as const) {
      const alert = renderAlert(language, unavailable);
      expect(alert, language).toBe(gdprRequestCopy[language].refusals.security_check_unavailable.replace("{email}", siteConfig.email));
      expect(alert, language).toContain(siteConfig.email);
    }
  });

  it("garde l'échec générique sans motif connu, et n'affiche rien avant un envoi", () => {
    expect(renderAlert("fr", refusal("INTERNAL_SERVER_ERROR"))).toBe(gdprRequestCopy.fr.error);
    expect(renderAlert("zh", new Error("Failed to fetch"))).toBe(gdprRequestCopy.zh.error);
    expect(renderAlert("en", null)).toBeNull();
  });

  it("annonce le même message dans la notification d'échec", () => {
    renderAlert("en", null);
    view.onError?.(refusal("TOO_MANY_REQUESTS", "rate_limited"));
    view.onError?.(refusal("BAD_REQUEST", "security_check_failed"));
    view.onError?.(refusal("SERVICE_UNAVAILABLE", "security_check_unavailable"));
    view.onError?.(refusal("INTERNAL_SERVER_ERROR"));

    expect(toastError.mock.calls.map(([message]) => message)).toEqual([
      `Too many requests from this connection. Please try again in 24 hours, or write directly to ${siteConfig.email}.`,
      gdprRequestCopy.en.refusals.security_check_failed,
      `The anti-bot check is temporarily unavailable. Your request has not been sent: please try again in a few minutes, or write directly to ${siteConfig.email}.`,
      gdprRequestCopy.en.error,
    ]);
  });
});

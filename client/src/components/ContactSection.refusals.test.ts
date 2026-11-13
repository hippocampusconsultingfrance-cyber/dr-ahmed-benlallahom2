import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ABUS-01 — un message refusé par la limite par connexion ou par l'anti-robot
// affiche la traduction de son motif stable, et non l'échec générique qui
// invite à réessayer tout de suite.

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
  return {
    useLanguage: () => ({
      language: view.language,
      content: contents[view.language],
    }),
  };
});
vi.mock("@/lib/trpc", () => ({
  trpc: {
    contact: {
      submit: {
        useMutation: (options: { onError: (error: unknown) => void }) => {
          view.onError = options.onError;
          return {
            isPending: false,
            error: view.error,
            mutate: () => undefined,
          };
        },
      },
    },
  },
}));
vi.mock("./TurnstileWidget", () => ({ TurnstileWidget: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));

const { default: ContactSection, contactCopy } = await import(
  "./ContactSection"
);

const SERVER_MESSAGE = "Texte français écrit par le serveur.";
/** Alert of a field refused for its characters, as the pages show it in each language. */
const INVALID_CHARACTERS = {
  fr: "Un champ contient un saut de ligne ou un caractère invisible qui n’y est pas accepté, souvent laissé par un copier-coller : retapez ce texte au clavier, puis renvoyez le formulaire.",
  en: "A field contains a line break or an invisible character that is not accepted there, often left by copying and pasting: type that text again on the keyboard, then send the form again.",
  de: "Ein Feld enthält einen Zeilenumbruch oder ein unsichtbares Zeichen, das dort nicht zulässig ist, oft ein Rest vom Kopieren und Einfügen: Geben Sie diesen Text erneut über die Tastatur ein und senden Sie das Formular dann erneut.",
  zh: "某个字段包含此处不允许的换行符或不可见字符，通常由复制粘贴带入：请用键盘重新输入该内容，然后重新提交表单。",
} as const;
/** Error of a refused tRPC call as the client receives it: French message, code and stable reason in `data`. */
const refusal = (code: string, reason?: string) => ({
  message: SERVER_MESSAGE,
  data: { code, ...(reason ? { reason } : {}) },
});

function renderAlert(language: Language, error: unknown) {
  view.language = language;
  view.error = error;
  const html = renderToStaticMarkup(createElement(ContactSection));
  expect(html).not.toContain(SERVER_MESSAGE);
  return /<p role="alert"[^>]*>([^<]*)<\/p>/.exec(html)?.[1] ?? null;
}

beforeEach(() => {
  toastError.mockClear();
  view.onError = null;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContactSection — refus traduits (ABUS-01)", () => {
  it("dit que la limite par connexion est atteinte et quand réessayer, dans la langue de la page", () => {
    expect(
      renderAlert("fr", refusal("TOO_MANY_REQUESTS", "rate_limited"))
    ).toBe("Trop d’envois depuis cette connexion. Réessayez dans une heure.");
    expect(
      renderAlert("en", refusal("TOO_MANY_REQUESTS", "rate_limited"))
    ).toBe(
      "Too many submissions from this connection. Please try again in an hour."
    );
    expect(
      renderAlert("de", refusal("TOO_MANY_REQUESTS", "rate_limited"))
    ).toBe(
      "Zu viele Anfragen über diese Verbindung. Bitte versuchen Sie es in einer Stunde erneut."
    );
    expect(
      renderAlert("zh", refusal("TOO_MANY_REQUESTS", "rate_limited"))
    ).toBe("此网络连接的提交次数过多。请一小时后再试。");
  });

  it("demande de valider la nouvelle vérification, sans recharger la page, après un anti-robot refusé (PUB-09)", () => {
    expect(
      renderAlert("fr", refusal("BAD_REQUEST", "security_check_failed"))
    ).toBe(
      "La vérification anti-robot a échoué. Validez la nouvelle vérification ci-dessous, puis renvoyez votre message."
    );
    expect(
      renderAlert("en", refusal("BAD_REQUEST", "security_check_failed"))
    ).toBe(
      "The anti-bot check failed. Complete the new check below, then send your message again."
    );
    for (const language of ["de", "zh"] as const) {
      expect(
        renderAlert(language, refusal("BAD_REQUEST", "security_check_failed")),
        language
      ).toBe(contactCopy[language].refusals.security_check_failed);
    }
  });

  it("dit de réessayer plus tard, sans recharger la page, quand Cloudflare ne peut pas vérifier l'envoi", () => {
    const unavailable = refusal(
      "SERVICE_UNAVAILABLE",
      "security_check_unavailable"
    );
    expect(renderAlert("fr", unavailable)).toBe(
      "La vérification anti-robot est momentanément indisponible. Votre message n’a pas été envoyé : réessayez dans quelques minutes."
    );
    expect(renderAlert("en", unavailable)).toBe(
      "The anti-bot check is temporarily unavailable. Your message has not been sent: please try again in a few minutes."
    );
    for (const language of ["de", "zh"] as const) {
      const alert = renderAlert(language, unavailable);
      expect(alert, language).toBe(
        contactCopy[language].refusals.security_check_unavailable
      );
      expect(alert, language).not.toBe(
        contactCopy[language].refusals.security_check_failed
      );
    }
  });

  it("dit de retaper le texte d'un champ refusé pour ses caractères (INTL-05), dans la langue de la page", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const alert = renderAlert(
        language,
        refusal("BAD_REQUEST", "invalid_characters")
      );
      expect(alert, language).toBe(INVALID_CHARACTERS[language]);
      expect(alert, language).not.toBe(contactCopy[language].sendError);
    }
    view.onError?.(refusal("BAD_REQUEST", "invalid_characters"));
    expect(toastError).toHaveBeenLastCalledWith(INVALID_CHARACTERS.zh);
  });

  it("garde l'échec générique sans motif connu, et n'affiche jamais le texte français du serveur", () => {
    expect(renderAlert("en", refusal("INTERNAL_SERVER_ERROR"))).toBe(
      contactCopy.en.sendError
    );
    expect(
      renderAlert("en", refusal("TOO_MANY_REQUESTS", "something_else"))
    ).toBe(contactCopy.en.sendError);
    expect(renderAlert("fr", new Error("Failed to fetch"))).toBe(
      contactCopy.fr.sendError
    );
    expect(renderAlert("fr", null)).toBeNull();
  });

  it("annonce le même message dans la notification d'échec", () => {
    renderAlert("de", null);
    view.onError?.(refusal("TOO_MANY_REQUESTS", "rate_limited"));
    view.onError?.(refusal("BAD_REQUEST", "security_check_failed"));
    view.onError?.(
      refusal("SERVICE_UNAVAILABLE", "security_check_unavailable")
    );
    view.onError?.(refusal("INTERNAL_SERVER_ERROR"));

    expect(toastError.mock.calls.map(([message]) => message)).toEqual([
      contactCopy.de.refusals.rate_limited,
      contactCopy.de.refusals.security_check_failed,
      "Die Bot-Prüfung ist vorübergehend nicht verfügbar. Ihre Nachricht wurde nicht gesendet: Bitte versuchen Sie es in einigen Minuten erneut.",
      contactCopy.de.sendError,
    ]);
  });
});

// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RGPD-13 — le lien de l’accusé de réception ouvre /gdpr?confirm=… : la page
// confirme l’adresse sur un clic (jamais à l’ouverture), dit quand le lien a
// déjà servi ou n’est plus valable ; le formulaire propose la limitation et le
// retrait du consentement et envoie la langue de la page.

type Confirmation = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  isSuccess: boolean;
  data?: { reference: string };
  error: unknown;
};
const view = vi.hoisted(() => ({
  language: "fr" as "fr" | "en" | "de" | "zh",
  confirm: null as null | Confirmation,
  submit: null as null | ReturnType<typeof vi.fn>,
}));

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
    gdpr: {
      submit: {
        useMutation: () => ({
          isPending: false,
          error: null,
          mutate: view.submit,
        }),
      },
      confirmEmail: { useMutation: () => view.confirm },
    },
  },
}));
// The anti-bot check answers at once.
vi.mock("./TurnstileWidget", async () => {
  const { useEffect } = await import("react");
  return {
    TurnstileWidget: ({ onToken }: { onToken: (token: string) => void }) => {
      useEffect(
        () => onToken("turnstile-token-accepted-by-the-mock"),
        [onToken]
      );
      return null;
    },
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: GDPRRequestForm } = await import("./GDPRRequestForm");
const contents = {
  fr: (await import("@/data/content-fr")).contentFr,
  en: (await import("@/data/content-en")).contentEn,
};

const TOKEN = "eyJyZWZlcmVuY2UiOiJHMTIzIn0.c2lnbmF0dXJl";
const idle = (): Confirmation => ({
  mutate: vi.fn(),
  isPending: false,
  isSuccess: false,
  error: null,
});
const refused = (reason: string): Confirmation => ({
  ...idle(),
  error: { message: "Texte français du serveur.", data: { reason } },
});

beforeEach(() => {
  view.language = "fr";
  view.confirm = idle();
  view.submit = vi.fn();
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("confirmation de l’adresse depuis le lien de l’email (RGPD-13)", () => {
  it("ne confirme rien à l’ouverture, puis envoie le jeton du lien au clic", () => {
    window.history.replaceState(null, "", `/gdpr?confirm=${TOKEN}&lang=fr`);
    render(createElement(GDPRRequestForm));

    expect(
      screen.getByRole("heading", { name: "Confirmer votre adresse email" })
    ).toBeTruthy();
    expect(screen.queryByLabelText("Adresse email")).toBeNull();
    expect(view.confirm!.mutate).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Confirmer mon adresse" })
    );
    expect(view.confirm!.mutate).toHaveBeenCalledWith({ token: TOKEN });
  });

  it("annonce l’adresse confirmée avec la référence de la demande", () => {
    window.history.replaceState(null, "", `/gdpr?confirm=${TOKEN}`);
    view.language = "en";
    view.confirm = {
      ...idle(),
      isSuccess: true,
      data: { reference: "G7K2M9Q4R8T1V" },
    };
    render(createElement(GDPRRequestForm));

    expect(screen.getByRole("status").textContent).toContain(
      "Thank you: the address of your request G7K2M9Q4R8T1V is confirmed."
    );
    expect(
      screen.queryByRole("button", { name: "Confirm my address" })
    ).toBeNull();
  });

  it("dit qu’un lien a déjà servi, ou n’est plus valable, dans la langue de la page et sans le texte du serveur", () => {
    window.history.replaceState(null, "", `/gdpr?confirm=${TOKEN}`);
    view.confirm = refused("gdpr_confirmation_used");
    render(createElement(GDPRRequestForm));
    expect(screen.getByRole("alert").textContent).toBe(
      contents.fr.gdpr.confirmation.used
    );
    expect(
      screen.queryByRole("button", { name: "Confirmer mon adresse" })
    ).toBeNull();
    cleanup();

    // The link opened again: the page took the token out of the address the first time.
    window.history.replaceState(null, "", `/gdpr?confirm=${TOKEN}`);
    view.language = "en";
    view.confirm = refused("gdpr_confirmation_invalid");
    render(createElement(GDPRRequestForm));
    expect(screen.getByRole("alert").textContent).toBe(
      contents.en.gdpr.confirmation.invalid
    );
    expect(document.body.textContent).not.toContain(
      "Texte français du serveur."
    );
  });

  it("retire le jeton de l’adresse dès l’ouverture, le garde pour le clic, puis ramène au formulaire", () => {
    window.history.replaceState(
      null,
      "",
      `/gdpr?confirm=${TOKEN}&lang=en#form`
    );
    render(createElement(GDPRRequestForm));

    // Neither the history nor the audience measurement keep the single-use link; ?lang= stays for the language.
    expect(window.location.pathname).toBe("/gdpr");
    expect(window.location.search).toBe("?lang=en");
    expect(window.location.hash).toBe("#form");
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmer mon adresse" })
    );
    expect(view.confirm!.mutate).toHaveBeenCalledWith({ token: TOKEN });

    fireEvent.click(
      screen.getByRole("button", { name: "Faire une autre demande" })
    );
    expect(screen.getByLabelText("Adresse email")).toBeTruthy();
  });
});

describe("formulaire de demande RGPD (RGPD-13)", () => {
  it("propose la limitation et le retrait du consentement, et envoie la langue de la page", () => {
    view.language = "en";
    render(createElement(GDPRRequestForm));

    const select = screen.getByLabelText("Request Type") as HTMLSelectElement;
    expect(Array.from(select.options).map(option => option.value)).toEqual([
      "access",
      "rectification",
      "deletion",
      "restriction",
      "portability",
      "objection",
      "consent_withdrawal",
    ]);
    expect(
      Array.from(select.options).map(option => option.textContent)
    ).toContain("Withdrawal of my consent");

    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "Jane Smith" },
    });
    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "jane@example.com" },
    });
    fireEvent.change(select, { target: { value: "restriction" } });
    fireEvent.submit(select.closest("form")!);

    expect(view.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        requestType: "restriction",
        language: "en",
        email: "jane@example.com",
      })
    );
  });
});

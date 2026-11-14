// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Page de désinscription du recrutement montée par React dans un DOM, avec le vrai contexte de langue.
vi.mock("@/lib/trpc", () => ({
  trpc: {
    recruitmentPreferences: {
      unsubscribe: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          isSuccess: false,
          error: null,
        }),
      },
    },
  },
}));

const { default: RecruitmentUnsubscribePage, getRecruitmentUnsubscribeCopy } =
  await import("./RecruitmentUnsubscribePage");
const { LanguageProvider } = await import("@/contexts/LanguageContext");

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("retour à l’accueil de la désinscription (A11Y-17)", () => {
  it.each(["fr", "en"] as const)(
    "%s : un vrai lien vers l’accueil, la confirmation restant une action",
    language => {
      localStorage.setItem("language", language);
      window.history.replaceState(
        null,
        "",
        `/recruitment/unsubscribe?token=${"t".repeat(32)}`
      );
      render(
        createElement(
          LanguageProvider,
          null,
          createElement(RecruitmentUnsubscribePage)
        )
      );
      const copy = getRecruitmentUnsubscribeCopy(language);

      expect(
        screen.getByRole("link", { name: copy.home }).getAttribute("href")
      ).toBe("/");
      expect(screen.queryByRole("button", { name: copy.home })).toBeNull();
      expect(screen.getByRole("button", { name: copy.confirm })).toBeTruthy();
    }
  );
});

// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import MedicalCitation, { medicalCitationCopy } from "./MedicalCitation";

const languageState = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: languageState.language }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  languageState.language = "fr";
});

describe("MedicalCitation", () => {
  it.each(["fr", "en", "de", "zh"] as const)("présente une source et une mise à jour localisées en %s", (language) => {
    languageState.language = language;
    render(
      <MedicalCitation sourceName="Organisation de référence" sourceUrl="https://example.org/reference" updatedAt="2026-08-20">
        Citation médicale contextualisée.
      </MedicalCitation>
    );

    expect(screen.getByRole("note", { name: medicalCitationCopy[language].source })).toBeTruthy();
    expect(screen.getByRole("link", { name: new RegExp(medicalCitationCopy[language].source) }).getAttribute("href")).toBe("https://example.org/reference");
    expect(screen.getByText(medicalCitationCopy[language].notice)).toBeTruthy();
    expect(document.querySelector("time")?.getAttribute("dateTime")).toBe("2026-08-20");
  });
});

// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// Page Employeurs montée par React dans un DOM, dans chacune des quatre langues.
const { default: EmployersPage, employerCopy } = await import("./EmployersPage");
const { ThemeProvider } = await import("@/contexts/ThemeContext");
const { LanguageProvider } = await import("@/contexts/LanguageContext");

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("pages orphelines reliées (PUB-NAV-01)", () => {
  it.each(["fr", "en", "de", "zh"] as const)("%s : la page Employeurs mène à /why-hippocampus", language => {
    localStorage.setItem("language", language);
    render(createElement(ThemeProvider, null, createElement(LanguageProvider, null, createElement(EmployersPage))));

    const link = screen.getByRole("link", { name: employerCopy[language].whyLink });
    expect(link.getAttribute("href")).toBe("/why-hippocampus");
  });
});

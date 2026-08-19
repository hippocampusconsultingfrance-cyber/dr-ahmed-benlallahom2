// @vitest-environment jsdom
import React from "react";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "./ThemeContext";
import { HIGH_READABILITY_STORAGE_KEY } from "./readabilityPreference";

function ReadabilityFixture() {
  const { highReadability, toggleHighReadability } = useTheme();
  return <button onClick={toggleHighReadability} aria-pressed={highReadability}>Lisibilité renforcée</button>;
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("high-readability", "dark", "oled-dark");
});

describe("mode lisibilité renforcée", () => {
  it("applique la classe racine, expose l’état et persiste la préférence", async () => {
    const user = userEvent.setup();
    render(<ThemeProvider defaultTheme="dark" switchable><ReadabilityFixture /></ThemeProvider>);
    const button = screen.getByRole("button", { name: "Lisibilité renforcée" });

    expect(button.getAttribute("aria-pressed")).toBe("false");
    await user.click(button);

    await waitFor(() => expect(document.documentElement.classList.contains("high-readability")).toBe(true));
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem(HIGH_READABILITY_STORAGE_KEY)).toBe("true");

    await user.click(button);
    await waitFor(() => expect(document.documentElement.classList.contains("high-readability")).toBe(false));
    expect(localStorage.getItem(HIGH_READABILITY_STORAGE_KEY)).toBe("false");
  });

  it("conserve les règles CSS qui augmentent la lisibilité sans comprimer les composants", async () => {
    const css = await import("node:fs/promises").then(fs =>
      fs.readFile(path.resolve(process.cwd(), "client", "src", "index.css"), "utf8")
    );

    expect(css).toContain("html.high-readability {");
    expect(css).toContain("font-size: 106.25%;");
    expect(css).toContain("line-height: 1.62;");
    expect(css).toContain("min-width: 0;");
  });
});

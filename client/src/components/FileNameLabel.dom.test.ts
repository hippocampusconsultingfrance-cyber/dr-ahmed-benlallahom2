// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import FileNameLabel from "./FileNameLabel";

// Nom d’un fichier choisi par un visiteur, monté par React dans un DOM : le
// nom entier reste lisible (texte et info-bulle), son extension est rendue à
// part pour rester visible quand la mise en page coupe le début du nom (la
// coupe elle-même est vérifiée dans un navigateur, RecruitmentPage.browser.test.ts),
// et les lecteurs d’écran lisent le nom d’un seul tenant.

afterEach(cleanup);

/**
 * The parts the label shows, in order: the base name, then the extension and
 * suffix; and the text left to screen readers, without the parts hidden from them.
 */
function shownParts(name: string, suffix?: string) {
  render(createElement(FileNameLabel, { name, suffix }));
  const label = screen.getByTitle(name);
  const parts = Array.from(label.children).filter(part => part.getAttribute("aria-hidden") === "true").map(part => part.textContent);
  const read = Array.from(label.children).filter(part => part.getAttribute("aria-hidden") !== "true").map(part => part.textContent).join("");
  return { text: parts.join(""), parts, read };
}

describe("nom de fichier choisi par un visiteur", () => {
  it("montre le nom entier, l’extension à part après le début du nom, et le nom entier en info-bulle", () => {
    const name = "CV_Jean_Dupont_Anesthesiste_Reanimateur_2026_version_finale.pdf";
    expect(shownParts(name)).toEqual({ text: name, parts: ["CV_Jean_Dupont_Anesthesiste_Reanimateur_2026_version_finale", ".pdf"], read: name });
  });

  it("garde après l’extension la taille donnée par l’appelant", () => {
    expect(shownParts("diplome-vera.pdf", " · 2 KB")).toEqual({ text: "diplome-vera.pdf · 2 KB", parts: ["diplome-vera", ".pdf · 2 KB"], read: "diplome-vera.pdf · 2 KB" });
  });

  it("ne sépare rien d’un nom sans extension, d’un fichier caché ou d’une « extension » trop longue", () => {
    expect(shownParts("CV_sans_extension").parts).toEqual(["CV_sans_extension"]);
    cleanup();
    expect(shownParts(".profile").parts).toEqual([".profile"]);
    cleanup();
    expect(shownParts("CV.version_finale_signee").parts).toEqual(["CV.version_finale_signee"]);
    cleanup();
    expect(shownParts("Lettre.de.motivation.docx").parts).toEqual(["Lettre.de.motivation", ".docx"]);
  });
});

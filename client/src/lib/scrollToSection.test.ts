import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollToSectionTop } from "./scrollToSection";

afterEach(() => vi.unstubAllGlobals());

/** A section and its offset parents, as the browser lays them out (offsetTop ignores transforms). */
function sectionAt(offsetTop: number, parentOffsetTop: number, measuredTop: number) {
  const main = { offsetTop: parentOffsetTop, offsetParent: null };
  return { offsetTop, offsetParent: main, getBoundingClientRect: () => ({ top: measuredTop }) } as unknown as HTMLElement;
}

describe("défilement vers une section de l'accueil (PUB-01)", () => {
  it("place le haut de la section en haut de l'écran, sans marge pour l'en-tête fixe", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("window", { scrollY: 1200, scrollTo });
    const section = sectionAt(40, 3500, 2340);

    scrollToSectionTop(section);
    expect(scrollTo).toHaveBeenCalledWith({ top: 3540, behavior: "smooth" });

    // Ouverture de /#section : saut direct à la même position.
    scrollToSectionTop(section, "auto");
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 3540, behavior: "auto" });
  });

  it("vise la place où la section s'arrête, pas sa mesure décalée par l'animation d'apparition (.fade-in-up)", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("window", { scrollY: 0, scrollTo });
    // Not yet revealed: translateY(24px) makes it measure 24 px lower than its place in the page.
    const contact = sectionAt(0, 6000, 6024);

    scrollToSectionTop(contact, "auto");
    expect(scrollTo).toHaveBeenCalledWith({ top: 6000, behavior: "auto" });
  });

  it("ne bouge pas quand la section n'existe pas", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("window", { scrollY: 0, scrollTo });

    scrollToSectionTop(null);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

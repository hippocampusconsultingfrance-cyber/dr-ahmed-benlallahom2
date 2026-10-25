import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollToSectionTop } from "./scrollToSection";

afterEach(() => vi.unstubAllGlobals());

describe("défilement vers une section de l'accueil (PUB-01)", () => {
  it("place le haut de la section en haut de l'écran, sans marge pour l'en-tête fixe", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("window", { scrollY: 1200, scrollTo });
    const section = { getBoundingClientRect: () => ({ top: 2340 }) } as Element;

    scrollToSectionTop(section);
    expect(scrollTo).toHaveBeenCalledWith({ top: 3540, behavior: "smooth" });

    // Ouverture de /#section : saut direct à la même position.
    scrollToSectionTop(section, "auto");
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 3540, behavior: "auto" });
  });

  it("ne bouge pas quand la section n'existe pas", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("window", { scrollY: 0, scrollTo });

    scrollToSectionTop(null);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

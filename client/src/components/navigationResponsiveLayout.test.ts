import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("géométrie responsive de l’en-tête", () => {
  it("bascule vers le menu compact avant que les liens n’atteignent les actions", async () => {
    const root = process.cwd();
    const navigation = await readFile(path.join(root, "client/src/components/Navigation.tsx"), "utf8");
    const styles = await readFile(path.join(root, "client/src/index.css"), "utf8");

    expect(navigation).toContain("min-[1536px]:grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(navigation).toContain("hidden min-[1536px]:flex min-w-0 items-center justify-self-center gap-5");
    expect(navigation).toContain("nav-control min-[1536px]:hidden");
    expect(navigation).not.toContain("min-[1350px]");
    expect(styles).toContain(".site-nav-container");
    expect(styles).toContain("max-width: 1600px;");
  });

  it("garde le logo visible sur les téléphones de 360 à 430 px (M19 / PUB-UI-01)", async () => {
    const navigation = await readFile(path.join(process.cwd(), "client/src/components/Navigation.tsx"), "utf8");

    // La colonne du logo est dimensionnée par son contenu ; c'est la zone d'actions qui se contracte.
    expect(navigation).toContain("grid-cols-[auto_minmax(0,1fr)]");
    expect(navigation).not.toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(navigation).toMatch(/brand-lockup flex min-w-10 shrink-0/);
    expect(navigation).toMatch(/h-10 w-10 min-w-10 shrink-0/);

    // Thème, lisibilité et OLED quittent l'en-tête sous 640 px et restent accessibles dans le menu burger.
    const secondaryControls = navigation.match(/nav-control nav-control-secondary hidden sm:inline-flex/g) ?? [];
    expect(secondaryControls).toHaveLength(3);
    const mobileMenu = navigation.slice(navigation.indexOf('id="mobile-navigation"'));
    expect(mobileMenu).toContain("onClick={toggleTheme}");
    expect(mobileMenu).toContain("onClick={toggleHighReadability}");
    expect(mobileMenu).toContain("onClick={toggleOledDark}");
  });
});

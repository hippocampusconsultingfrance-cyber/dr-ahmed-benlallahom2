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
});

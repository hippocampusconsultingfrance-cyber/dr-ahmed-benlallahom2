import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const sitemap = readFileSync(resolve(process.cwd(), "client/public/sitemap.xml"), "utf8");

describe("routes publiques Employeurs et recrutement", () => {
  it("expose la page de méthode Hippocampus", () => {
    expect(appSource).toContain('lazy(() => import("./pages/WhyHippocampusPage"))');
    expect(appSource).toContain('path="/why-hippocampus"');
  });

  it("référence les parcours indexables de recrutement dans le sitemap", () => {
    [
      "/recruitment/standard",
      "/recruitment/vvip-offshore",
      "/employers",
      "/why-hippocampus",
    ].forEach(path => expect(sitemap).toContain(`https://drahmedbenlallahom.com${path}`));
  });

});

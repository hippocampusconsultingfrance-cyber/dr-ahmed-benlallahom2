import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("styles d’impression", () => {
  it("masque la navigation et conserve les liens de référence", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toContain("@media print");
    expect(css).toContain("[data-sonner-toaster]");
    expect(css).toContain("a[href^=\"http\"]::after");
    expect(css).toContain("print-color-adjust: exact");
  });

  it("rend les réponses FAQ visibles et conserve les pages d’information ciblées", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    const faq = readFileSync(resolve(process.cwd(), "client/src/pages/FAQPage.tsx"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
    expect(css).toContain('[data-slot="accordion-content"][data-state="closed"]');
    expect(css).toContain("height: auto !important");
    expect(faq).toContain("AccordionContent");
    expect(app).toContain("FAQPage");
    expect(app).toContain("LegalPage");
    expect(app).toContain("GDPRPage");
  });
});

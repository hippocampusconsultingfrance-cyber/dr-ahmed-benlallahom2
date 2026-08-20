import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("authenticité des témoignages", () => {
  it("interdit les semences et fixtures d’avis fictifs dans les sources applicatives", async () => {
    const sources = await Promise.all([
      readFile(path.resolve(process.cwd(), "server/routers.ts"), "utf8"),
      readFile(path.resolve(process.cwd(), "client/src/components/TestimonialsSection.tsx"), "utf8"),
      readFile(path.resolve(process.cwd(), "client/src/pages/TestimonialsPage.tsx"), "utf8"),
    ]);
    const source = sources.join("\n");
    const forbiddenAuthor = ["Test", "User"].join(" ");
    const forbiddenTitle = ["Excellent", "Service"].join(" ");

    expect(source).not.toMatch(/mock.{0,20}testimonial/i);
    expect(source).not.toMatch(/demo.{0,20}testimonial/i);
    expect(source).not.toContain(forbiddenAuthor);
    expect(source).not.toContain(forbiddenTitle);
  });
});

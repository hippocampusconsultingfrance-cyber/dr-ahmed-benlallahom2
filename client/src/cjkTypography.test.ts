import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

describe("CJK typography", () => {
  it("uses a dedicated Chinese fallback stack without changing the Latin defaults", () => {
    expect(css).toContain('html[lang="zh"]');
    expect(css).toContain('"Noto Sans SC"');
    expect(css).toContain('"Noto Serif SC"');
    expect(css).toContain('--font-sans: "DM Sans", system-ui, sans-serif');
  });
});

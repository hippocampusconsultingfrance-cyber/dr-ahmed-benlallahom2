import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/components/RecruitmentTab.tsx"), "utf8");

describe("actions mobiles du tableau Candidatures", () => {
  it("garde des cibles tactiles et métadonnées adaptatives sur petits écrans", () => {
    expect(source).toContain("flex w-full flex-wrap items-center gap-2 lg:w-auto");
    expect(source).toContain("min-h-10 flex-1 sm:flex-none");
    expect(source).toContain("break-words");
  });
});

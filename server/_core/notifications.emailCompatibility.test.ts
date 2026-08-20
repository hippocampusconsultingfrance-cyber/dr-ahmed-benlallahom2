import { describe, expect, it } from "vitest";
import { buildHippocampusEmailShell } from "./notifications";

describe("gabarit d’e-mail transactionnel", () => {
  it("utilise une structure de présentation tabulaire et des styles inline compatibles", () => {
    const html = buildHippocampusEmailShell("<p>Contenu sûr</p>");

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('meta name="viewport"');
    expect(html).toContain('table role="presentation" width="100%"');
    expect(html).toContain('table role="presentation" width="600"');
    expect(html).toContain("font-family:Arial,Helvetica,sans-serif");
    expect(html).toContain("<p>Contenu sûr</p>");
  });
});

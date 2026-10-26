import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("guide d’utilisation des composants", () => {
  it("couvre les composants publics et les garde-fous de consentement et de sécurité", async () => {
    const root = process.cwd();
    const guide = await readFile(path.join(root, "COMPONENT_USAGE_GUIDE.md"), "utf8");
    for (const component of ["Navigation", "Footer", "SEOHead", "Breadcrumb", "PageTransition", "CookieConsent", "AnalyticsConsent", "TurnstileWidget", "ErrorBoundary", "PublicContentSkeleton", "ContactSection", "GDPRRequestForm"]) {
      expect(guide).toContain(`\`${component}\``);
      await access(path.join(root, "client/src/components", `${component}.tsx`), constants.R_OK);
    }
    for (const guardrail of ["FR/EN/DE/ZH", "pnpm validate:precheckpoint", "promesse thérapeutique", "décision automatisée de recrutement"]) expect(guide).toContain(guardrail);
  });
});

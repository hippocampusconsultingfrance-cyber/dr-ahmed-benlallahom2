import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("administration authentication", () => {
  it("uses Clerk instead of the retired Manus OAuth portal", async () => {
    const [dashboard, main, authHook] = await Promise.all([
      readFile(new URL("./AdminDashboard.tsx", import.meta.url), "utf8"),
      readFile(new URL("../main.tsx", import.meta.url), "utf8"),
      readFile(new URL("../_core/hooks/useAuth.ts", import.meta.url), "utf8"),
    ]);

    expect(main).toContain("<ClerkProvider");
    expect(dashboard).toContain("<SignInButton");
    expect(authHook).toContain("useClerkAuth");

    expect(main).not.toContain("startLogin");
    expect(dashboard).not.toContain("startLogin");
    expect(authHook).not.toContain("manus-cookie");
  });
});

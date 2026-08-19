import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { shouldPreventDialogEscape } from "./ui/dialog";

describe("dialogues et confirmations accessibles au clavier", () => {
  it("laisse Échap fermer un dialogue hors composition et protège une saisie IME", () => {
    expect(shouldPreventDialogEscape(false, false)).toBe(false);
    expect(shouldPreventDialogEscape(undefined, false)).toBe(false);
    expect(shouldPreventDialogEscape(true, false)).toBe(true);
    expect(shouldPreventDialogEscape(false, true)).toBe(true);
  });

  it("conserve les primitives, fermeture et annulation des dialogues actifs", async () => {
    const [dialog, alertDialog, candidateDialog, mailing] = await Promise.all([
      readFile(new URL("./ui/dialog.tsx", import.meta.url), "utf8"),
      readFile(new URL("./ui/alert-dialog.tsx", import.meta.url), "utf8"),
      readFile(new URL("./Candidate360Dialog.tsx", import.meta.url), "utf8"),
      readFile(new URL("./MailingTab.tsx", import.meta.url), "utf8"),
    ]);

    expect(dialog).toContain("DialogPrimitive.Content");
    expect(dialog).toContain("onEscapeKeyDown={handleEscapeKeyDown}");
    expect(dialog).toContain("DialogPrimitive.Close");
    expect(alertDialog).toContain("AlertDialogPrimitive.Content");
    expect(alertDialog).toContain("AlertDialogPrimitive.Cancel");
    expect(candidateDialog).toContain("<Dialog open={applicationId !== null}");
    expect(mailing).toContain("<AlertDialogCancel");
  });
});

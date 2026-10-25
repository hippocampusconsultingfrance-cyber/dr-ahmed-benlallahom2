import { afterEach, describe, expect, it, vi } from "vitest";
import { reportFieldsToCorrect } from "./formFieldsToCorrect";

/** Records the frames asked for and the fields focused, without a DOM. */
function stubFocus() {
  const frames: Array<() => void> = [];
  const focused: string[] = [];
  vi.stubGlobal("window", { requestAnimationFrame: (callback: () => void) => frames.push(callback) });
  vi.stubGlobal("document", { getElementById: (id: string) => ({ focus: () => focused.push(id) }) });
  return { frames, focused };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("A11Y-03 — champs à corriger après un envoi refusé", () => {
  it("nomme les champs dans l’ordre du formulaire, dans chaque langue", () => {
    stubFocus();
    const fields = [{ label: "Prénom", focusId: "first" }, { label: "Email", focusId: "email" }, { label: "CV", focusId: "cv" }];

    expect(reportFieldsToCorrect(fields, "fr")).toBe("À compléter ou corriger : Prénom, Email, CV.");
    expect(reportFieldsToCorrect(fields, "en")).toBe("Please complete or correct: Prénom, Email, CV.");
    expect(reportFieldsToCorrect(fields, "de")).toBe("Bitte ergänzen oder korrigieren: Prénom, Email, CV.");
    expect(reportFieldsToCorrect(fields, "zh")).toBe("请填写或更正：Prénom、Email、CV。");
    // Unknown language: French, as the rest of the public forms.
    expect(reportFieldsToCorrect(fields, "it")).toBe("À compléter ou corriger : Prénom, Email, CV.");
  });

  it("ajoute après la liste la phrase d’un champ qui s’explique autrement, ou la montre seule", () => {
    stubFocus();
    const refusedCv = { detail: "Le CV doit être un PDF ou un DOCX de 4 Mo maximum.", focusId: "cv" };

    expect(reportFieldsToCorrect([{ label: "Prénom", focusId: "first" }, refusedCv], "fr")).toBe("À compléter ou corriger : Prénom. Le CV doit être un PDF ou un DOCX de 4 Mo maximum.");
    expect(reportFieldsToCorrect([refusedCv], "fr")).toBe("Le CV doit être un PDF ou un DOCX de 4 Mo maximum.");
    expect(reportFieldsToCorrect([{ label: "名", focusId: "first" }, { detail: "请附加简历。", focusId: "cv" }], "zh")).toBe("请填写或更正：名。请附加简历。");
  });

  it("place le focus sur le premier champ qui peut le recevoir, une fois l’alerte affichée", () => {
    const { frames, focused } = stubFocus();

    reportFieldsToCorrect([{ label: "Vérification anti-bot" }, { label: "Email", focusId: "recruitment-email" }, { label: "CV", focusId: "recruitment-cv" }], "fr");
    expect(focused).toEqual([]);
    frames.splice(0).forEach(frame => frame());
    expect(focused).toEqual(["recruitment-email"]);

    // Only the anti-bot check is missing: focus stays where it is.
    reportFieldsToCorrect([{ label: "Vérification anti-bot" }], "fr");
    expect(frames).toHaveLength(0);
  });
});

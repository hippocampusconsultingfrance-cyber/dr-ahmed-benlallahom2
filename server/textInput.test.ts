import { describe, expect, it } from "vitest";
import { z } from "zod";
import { multiLineText, refusesTextInputCharacters, singleLineText, TEXT_INPUT_INVALID_CHARACTERS } from "../shared/textInput";

// INTL-05 — the text the public forms take (shared/textInput.ts): cleaned of
// what a paste leaves at either end, refused with a stable reason for a
// control character or a reversal of the text's direction inside it, and never
// refused for a legitimate name or text in Arabic, Hebrew, Chinese, Persian or
// Hindi, with ZWJ or ZWNJ, or for a composed emoji.

/** The characters are built from their code points: none of them appears as such in this file. */
const character = (codePoint: number) => String.fromCodePoint(codePoint);
const NUL = character(0x0);
const COMBINING_ACUTE = character(0x301);
const DEL = character(0x7f);
const NEL = character(0x85);
const ZWSP = character(0x200b);
const ZWNJ = character(0x200c);
const ZWJ = character(0x200d);
const LRM = character(0x200e);
const RLM = character(0x200f);
const LRE = character(0x202a);
const PDF = character(0x202c);
const LRO = character(0x202d);
const RLO = character(0x202e);
const LINE_SEPARATOR = character(0x2028);
const FSI = character(0x2068);
const PDI = character(0x2069);
const BOM = character(0xfeff);

const name = singleLineText(z.string().min(1).max(120));
const message = multiLineText(z.string().min(1).max(500));

function refusal(schema: z.ZodType, value: string) {
  const result = schema.safeParse(value);
  return result.success ? null : result.error;
}

describe("singleLineText — noms, téléphones, pays, organisations", () => {
  it("garde tels quels les noms légitimes de toutes les écritures, avec ZWJ, ZWNJ et emojis composés", () => {
    const family = ["👩", "👩", "👧", "👦"].join(ZWJ);
    for (const legitimate of [
      "محمد بن عبد الله",
      "אברהם כהן",
      "王小明",
      `می${ZWNJ}خواهم`,
      `क्ष${ZWJ}ि`,
      `Lina ${family}`,
      `Dr ${"👍🏽"} Amani`,
      `Sara ${FSI}محمد${PDI} Martin`,
      `Ahmed ${RLM}بن${LRM} Lallahom`,
      "Zoé Müller-Ødegård",
    ]) {
      expect(name.parse(legitimate), legitimate).toBe(legitimate);
    }
  });

  it("normalise en NFC et retire sans refuser les espaces et marques invisibles laissés en tête et en fin", () => {
    expect(name.parse(`Zoe${COMBINING_ACUTE}`)).toBe("Zo\u00e9");
    expect(name.parse(`${RLM}${BOM} محمد ${LRM}${ZWSP}`)).toBe("محمد");
    expect(name.parse(`${RLO}Ali Hassan${PDF}`)).toBe("Ali Hassan");
    expect(name.parse(`${LRE} Camille \n`)).toBe("Camille");
    // Nothing left: refused as empty, not for its characters.
    const empty = refusal(name, `${ZWSP}${RLM} `);
    expect(empty).not.toBeNull();
    expect(refusesTextInputCharacters(empty)).toBe(false);
  });

  it("refuse avec le motif invalid_characters C0, DEL, C1, un saut de ligne et une inversion LRO ou RLO dans le texte", () => {
    for (const forged of [
      `Leak${NUL}Test`,
      "Ali\r\nBcc: x@evil.test",
      "Ali\tHassan",
      `Ali${DEL}`,
      `Ali${NEL}Hassan`,
      `Ali${LINE_SEPARATOR}Hassan`,
      `Ali ${RLO}gnp.exe${PDF} Hassan`,
      `Ali ${LRO}Hassan`,
    ]) {
      const error = refusal(name, forged);
      expect(error, JSON.stringify(forged)).not.toBeNull();
      expect(refusesTextInputCharacters(error)).toBe(true);
      expect(error!.issues[0]!.message).toBe(TEXT_INPUT_INVALID_CHARACTERS);
    }
  });

  it("garde les longueurs et messages du champ, mesurés après le nettoyage", () => {
    const required = singleLineText(z.string().min(1, "Le nom est requis").max(5));
    expect(required.safeParse("").error?.issues[0]?.message).toBe("Le nom est requis");
    expect(required.parse(`${RLM}Inès${RLM}`)).toBe("Inès");
    expect(required.safeParse("Amélie").success).toBe(false);
    expect(singleLineText(z.string().max(50)).optional().default("").parse(undefined)).toBe("");
  });
});

describe("multiLineText — messages et notes", () => {
  it("garde les sauts de ligne, les tabulations et le texte de droite à gauche", () => {
    const text = `Bonjour,\r\n\tJe souhaite un rendez-vous.\nשלום ${RLM}— مرحبا${LINE_SEPARATOR}再见`;
    expect(message.parse(text)).toBe(text);
  });

  it("refuse NUL, les autres caractères de contrôle et une inversion du sens du texte", () => {
    for (const forged of [`Bonjour${NUL}`, `Montant : ${RLO}001${PDF} €`, `Bonjour${character(0x1b)}[31m`, `a${character(0x9b)}b`]) {
      expect(refusesTextInputCharacters(refusal(message, forged)), JSON.stringify(forged)).toBe(true);
    }
  });
});

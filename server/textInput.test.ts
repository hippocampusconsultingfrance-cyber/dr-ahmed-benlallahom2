import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emailText, multiLineText, refusesTextInputCharacters, singleLineText, TEXT_INPUT_INVALID_CHARACTERS, TEXT_INPUT_INVALID_CHARACTERS_MESSAGE } from "../shared/textInput";
import { bookingCustomerEmail } from "./routers/appointments";
import { PUBLIC_FORM_REFUSAL_REASONS } from "../shared/publicFormRefusalReasons";
import { BOOKING_REFUSAL_REASONS } from "../shared/bookingPolicy";
import { publicFormCopy } from "../client/src/lib/publicFormCopy";

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

describe("emailText — adresses email collées", () => {
  const email = emailText(z.string().email().max(320));
  const NBSP = character(0xa0);

  it("retire ce qu'un copier-coller laisse aux extrémités, comme pour les noms, avant de vérifier le format", () => {
    for (const pasted of [`${LRM}exemple@example.test`, `exemple@example.test${RLM}`, "exemple@example.test ", ` exemple@example.test${NBSP}`, `${BOM}${ZWSP}exemple@example.test${PDI}`]) {
      expect(email.parse(pasted), JSON.stringify(pasted)).toBe("exemple@example.test");
    }
    // The booking's own rule (RES-10), on the address as the server reads it.
    expect(bookingCustomerEmail.parse(`${RLM}jeanne@example.test `)).toBe("jeanne@example.test");
  });

  it("refuse avec le motif invalid_characters un caractère invisible laissé à l'intérieur de l'adresse", () => {
    for (const forged of [`exem${ZWSP}ple@example.test`, `exemple${LRM}@example.test`, `exemple@exa${ZWJ}mple.test`, `exemple@example.test${NUL}x`, `a${character(0x2060)}b@example.test`]) {
      expect(refusesTextInputCharacters(refusal(email, forged)), JSON.stringify(forged)).toBe(true);
      expect(refusesTextInputCharacters(refusal(bookingCustomerEmail, forged)), JSON.stringify(forged)).toBe(true);
    }
  });

  it("garde son format et sa longueur, avec leurs messages", () => {
    expect(refusesTextInputCharacters(refusal(email, "exemple@example"))).toBe(false);
    expect(email.safeParse("exemple@example").success).toBe(false);
    expect(email.safeParse(`${"a".repeat(320)}@example.test`).success).toBe(false);
    expect(bookingCustomerEmail.safeParse("patient@gmail").success).toBe(false);
  });
});

describe("motif invalid_characters — traduit par les pages", () => {
  it("est un motif connu des formulaires publics et de la réservation, et son message français est celui des pages", () => {
    expect(PUBLIC_FORM_REFUSAL_REASONS).toContain(TEXT_INPUT_INVALID_CHARACTERS);
    expect(BOOKING_REFUSAL_REASONS).toContain(TEXT_INPUT_INVALID_CHARACTERS);
    // The recruitment and candidate pages show the server's French message as is.
    expect(TEXT_INPUT_INVALID_CHARACTERS_MESSAGE).toBe(publicFormCopy.invalidCharacters.fr);
  });
});

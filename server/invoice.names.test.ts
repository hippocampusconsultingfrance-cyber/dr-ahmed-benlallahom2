import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { storagePut } = vi.hoisted(() => ({ storagePut: vi.fn() }));

vi.mock("./storage.js", () => ({ storagePut }));

import {
  buildInvoiceContent,
  generateInvoicePDF,
  invoiceNameLines,
  invoiceNameRuns,
  printableInvoiceName,
  type InvoiceData,
  type InvoiceNameRun,
} from "./invoice";
import { resolveInvoiceSeller } from "./invoiceSeller";

// Deux lignes chacun ; aucun n’a la ligature lam-alef, qui se copie inversée.
const LONG_ARABIC_NAME = "محمد بن سعود بن فيصل بن تركي بن سلمان بن خالد بن فهد بن ناصر بن سعد بن ماجد بن بندر بن نايف بن مشعل بن منصور بن عادل بن حمد بن راشد بن زايد بن سلطان بن حمدان بن مكتوم بن عمر بن علي بن حسن بن حسين بن يوسف";
const LONG_LATIN_NAME = "Maria del Carmen Fernández de la Concepción Rodríguez-Montenegro y Álvarez de Toledo Sánchez de Villalobos Santisteban";

async function pdfLines(buffer: Buffer): Promise<string[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.split("\n").map(line => line.trim()).filter(Boolean);
  } finally {
    await parser.destroy();
  }
}

function invoiceFor(customerName: string): InvoiceData {
  return {
    invoiceNumber: "FAC-2026-000007",
    issueDate: new Date("2026-10-11T22:46:00.000Z"),
    paymentDate: new Date("2026-10-11T22:45:00.000Z"),
    trackingId: "APTTEST000007",
    customerName,
    customerEmail: "patient@example.test",
    customerPhone: "+33102030405",
    appointmentDate: new Date("2026-10-15T08:30:00.000Z"),
    consultationType: "Conseil en santé",
    duration: 30,
    basePrice: 100,
    finalPrice: 100,
    isNightRate: false,
  };
}

async function invoicePdf(customerName: string): Promise<Buffer> {
  return (await generateInvoicePDF(invoiceFor(customerName), resolveInvoiceSeller({}))).buffer;
}

/** Ligne imprimée sous « Facturé à : », telle que pdf.js la restitue. */
async function printedName(customerName: string): Promise<string> {
  const lines = await pdfLines(await invoicePdf(customerName));
  return lines[lines.indexOf("Facturé à :") + 1];
}

/** Lignes du nom, entre « Facturé à : » et l’email. */
async function printedNameLines(customerName: string): Promise<string[]> {
  const lines = await pdfLines(await invoicePdf(customerName));
  return lines.slice(lines.indexOf("Facturé à :") + 1, lines.indexOf("patient@example.test"));
}

/** Hauteur de chaque texte imprimé (y depuis le bas de la page), lue par le pdf.js de pdf-parse. */
async function textHeights(buffer: Buffer): Promise<Map<string, number>> {
  const require = createRequire(import.meta.url);
  const pdfjsPath = createRequire(require.resolve("pdf-parse")).resolve("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjs = await import(pathToFileURL(pdfjsPath).href);
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
  try {
    const { items } = await (await document.getPage(1)).getTextContent();
    const heights = new Map<string, number>();
    for (const item of items as Array<{ str?: string; transform?: number[] }>) {
      const text = item.str?.trim();
      if (text && item.transform && !heights.has(text)) heights.set(text, item.transform[5]);
    }
    return heights;
  } finally {
    await document.destroy();
  }
}

const BLOCK_BELOW_NAME = ["patient@example.test", "+33102030405", "Détails de la prestation :", "Total :"];

/** Segments ligne par ligne, chaque ligne limitée à un nombre de caractères. */
function linesOf(name: string, characters: number): string[][] {
  const fits = (runs: InvoiceNameRun[]) => runs.reduce((count, run) => count + Array.from(run.text).length, 0) <= characters;
  return invoiceNameLines(name, fits).map(line => line.map(run => run.text));
}

/** Polices du PDF (nom PostScript sans le préfixe de sous-ensemble), triées. */
function embeddedFonts(pdf: Buffer): string[] {
  const names = Array.from(pdf.toString("latin1").matchAll(/\/BaseFont \/(?:[A-Z]{6}\+)?([\w-]+)/g), match => match[1]);
  return Array.from(new Set(names)).sort();
}

describe("noms internationaux sur la facture PDF", () => {
  beforeEach(() => {
    storagePut.mockResolvedValue({ key: "invoices/FAC-2026-000007-APTTEST000007_abcd.pdf", url: "https://storage.test/invoice.pdf" });
  });

  it.each([
    "Łukasz Kowalski",
    "Şahin Yılmaz",
    "Antonín Dvořák",
    "Nguyễn Văn An",
    "Zoë Ørsted-Łukasz N'Diaye",
    "Ioana Știrbu",
    "Иван Петров",
    "Marcel·la Col·lell",
  ])("imprime « %s » lisiblement", async name => {
    expect(await printedName(name)).toBe(name);
  });

  // Noto Sans dessine ces lettres en lettre de base plus point souscrit : le
  // texte copié ou extrait perdait le point (« Nguyễn Thi Ngoc Trinh »).
  it.each([
    "Nguyễn Thị Ngọc Trinh",
    "Vũ Thị Hụê",
    "Adéṣọlá Ọ̀ṣun",
    "ǹḿṃṅ ṣẹịọụ",
  ])("garde le point souscrit de « %s » dans le texte copié ou extrait", async name => {
    expect(await printedName(name)).toBe(name);
  });

  it("garde dans le texte extrait chaque lettre latine précomposée (Latin-1 à Latin étendu additionnel)", async () => {
    const letters: string[] = [];
    for (const [first, last] of [[0xc0, 0x24f], [0x1e00, 0x1eff]]) {
      for (let codePoint = first; codePoint <= last; codePoint += 1) {
        const letter = String.fromCodePoint(codePoint);
        if (/\p{L}/u.test(letter) && letter.normalize("NFC") === letter) letters.push(letter);
      }
    }
    const words = Array.from({ length: Math.ceil(letters.length / 8) }, (_, index) => letters.slice(index * 8, index * 8 + 8).join(""));
    for (let index = 0; index < words.length; index += 20) {
      const name = words.slice(index, index + 20).join(" ");
      expect((await printedNameLines(name)).join(" ")).toBe(name);
    }
  });

  it.each([
    ["Zoë 😀 Martin 👩‍⚕️", "Zoë Martin"],
    ["דוד כהן", "??? ???"],
    ["김민준", "???"],
    ["สมชาย ใจดี", "????? ???"],
    ["𝓙𝓮𝓪𝓷 Dupont", "Jean Dupont"],
    ["Jean © Dupont", "Jean © Dupont"],
  ])("n’imprime aucun carré vide pour « %s »", async (name, printed) => {
    expect(await printedName(name)).toBe(printed);
  });

  it("n’imprime pas de ligne de nom pour un nom fait d’emoji", async () => {
    expect(await printedNameLines("😀😀")).toEqual([]);
  });

  it.each(["محمد العتيبي", "王小明", "王小明（Wang Xiaoming）", "Dr Ahmed بن علي (أبو فهد) Martin"])(
    "laisse l’email, le téléphone et le tableau à la même hauteur qu’après un nom latin (« %s »)",
    async name => {
      const latin = await textHeights(await invoicePdf("Jean Dupont"));
      const printed = await textHeights(await invoicePdf(name));
      for (const text of BLOCK_BELOW_NAME) expect([text, printed.get(text)]).toEqual([text, latin.get(text)]);
    },
  );

  it("coupe un long nom arabe dans l’ordre de lecture, une hauteur de ligne latine plus bas", async () => {
    const lines = await printedNameLines(LONG_ARABIC_NAME);
    expect(lines).toHaveLength(2);
    // pdf.js lit chaque ligne de gauche à droite : retournée, elle se lit dans
    // l’ordre du nom, la première ligne en premier.
    expect(lines.map(line => line.split(" ").reverse().join(" ")).join(" ")).toBe(LONG_ARABIC_NAME);

    expect(await printedNameLines(LONG_LATIN_NAME)).toHaveLength(2);
    const latin = await textHeights(await invoicePdf(LONG_LATIN_NAME));
    const arabic = await textHeights(await invoicePdf(LONG_ARABIC_NAME));
    for (const text of BLOCK_BELOW_NAME) expect([text, arabic.get(text)]).toEqual([text, latin.get(text)]);
  });

  it("imprime en NFC un nom saisi en lettres décomposées", async () => {
    const decomposed = "Zoë Hélène Garçon";
    expect(buildInvoiceContent(invoiceFor(decomposed), resolveInvoiceSeller({})).buyerLines[0]).toBe("Zoë Hélène Garçon");
    expect(await printedName(decomposed)).toBe("Zoë Hélène Garçon");
  });

  it.each([
    "王小明",
    "田中 ひろし",
    // Ponctuation pleine chasse des claviers chinois, que Noto Sans n’a pas.
    "王小明（Wang Xiaoming）",
    "迈克尔·乔丹",
    "マイケル・ジョーダン",
  ])("imprime le nom chinois ou japonais « %s » avec Noto Sans SC", async name => {
    const pdf = await invoicePdf(name);
    expect(embeddedFonts(pdf)).toContain("NotoSansSC-Regular");
    expect(await printedName(name)).toBe(name);
  });

  // pdf.js liste les mots de gauche à droite : un nom arabe s’affiche de droite
  // à gauche, son premier mot (محمد) se retrouve donc à droite, en dernier.
  // Limite connue (server/fonts/README.md) : un nom avec la ligature lam-alef
  // (سلامة, علاء, الأمين) s’imprime correctement mais se copie avec les deux
  // lettres de la ligature inversées ; ces exemples n’en ont pas.
  it.each([
    ["محمد العتيبي", "العتيبي محمد"],
    ["Mohammed محمد العتيبي", "Mohammed العتيبي محمد"],
    ["محمد العتيبي (Mohammed)", "(Mohammed) العتيبي محمد"],
  ])("imprime le nom arabe « %s » façonné, de droite à gauche", async (name, leftToRight) => {
    const pdf = await invoicePdf(name);
    expect(embeddedFonts(pdf)).toContain("NotoSansArabic-Regular");
    expect(await printedName(name)).toBe(leftToRight);
  });

  it.each(["محمد العتيبي", "王小明", "Nguyễn Thị Ngọc Trinh", LONG_ARABIC_NAME])("régénère octet pour octet la facture de « %s » (polices arabe et chinoise, lettres précomposées, nom sur deux lignes)", async name => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-12T06:20:00.000Z"));
      const first = await invoicePdf(name);
      vi.setSystemTime(new Date("2026-10-13T06:20:07.000Z"));
      expect((await invoicePdf(name)).equals(first)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("imprime la ligature lam-alef d’un nom arabe avec Noto Sans Arabic", async () => {
    const pdf = await invoicePdf("سلامة عبد الله");
    expect(embeddedFonts(pdf)).toContain("NotoSansArabic-Regular");
    expect(invoiceNameRuns("سلامة عبد الله")).toEqual([
      { text: "الله", font: "arabic" },
      { text: " ", font: "regular" },
      { text: "عبد", font: "arabic" },
      { text: " ", font: "regular" },
      { text: "سلامة", font: "arabic" },
    ]);
  });

  it.each(["Łukasz Kowalski", "Marcel·la Col·lell"])("garde Noto Sans pour tout le document et ne charge les polices arabe et chinoise qu’au besoin (« %s »)", async name => {
    expect(embeddedFonts(await invoicePdf(name))).toEqual(["NotoSans-Bold", "NotoSans-Regular"]);
  });
});

describe("ordre d’affichage de la ligne du nom", () => {
  it("laisse un nom latin en un seul segment", () => {
    expect(invoiceNameRuns("Łukasz Kowalski")).toEqual([{ text: "Łukasz Kowalski", font: "regular" }]);
  });

  it("écrit les mots arabes de droite à gauche, les espaces dans la police principale", () => {
    expect(invoiceNameRuns("محمد العتيبي")).toEqual([
      { text: "العتيبي", font: "arabic" },
      { text: " ", font: "regular" },
      { text: "محمد", font: "arabic" },
    ]);
  });

  it("garde un prénom latin à gauche d’un nom arabe saisi après lui", () => {
    expect(invoiceNameRuns("Mohammed محمد")).toEqual([
      { text: "Mohammed ", font: "regular" },
      { text: "محمد", font: "arabic" },
    ]);
  });

  it("place et retourne les parenthèses d’un nom arabe suivi d’un nom latin", () => {
    expect(invoiceNameRuns("محمد (Mohammed)")).toEqual([
      { text: "(", font: "regular" },
      { text: "Mohammed", font: "regular" },
      { text: ") ", font: "regular" },
      { text: "محمد", font: "arabic" },
    ]);
  });

  it("écrit un nom japonais en un seul segment, espace idéographique comprise", () => {
    expect(invoiceNameRuns("田中　太郎")).toEqual([{ text: "田中　太郎", font: "han" }]);
    expect(invoiceNameRuns("マイケル・ジョーダン")).toEqual([{ text: "マイケル・ジョーダン", font: "han" }]);
  });

  it("laisse le point médian catalan dans la police principale", () => {
    expect(invoiceNameRuns("Marcel·la Col·lell")).toEqual([{ text: "Marcel·la Col·lell", font: "regular" }]);
    expect(invoiceNameRuns("Wang·王")).toEqual([
      { text: "Wang·", font: "regular" },
      { text: "王", font: "han" },
    ]);
  });

  it("coupe un nom arabe dans l’ordre logique : la première ligne en a le début, à droite", () => {
    expect(linesOf("محمد بن سعود العتيبي", 12)).toEqual([
      ["سعود", " ", "بن", " ", "محمد"],
      ["العتيبي"],
    ]);
  });

  it("coupe un nom mixte avant de remettre chaque ligne dans l’ordre d’affichage", () => {
    // Sur une seule ligne, العتيبي s’afficherait juste après Mohammed.
    expect(invoiceNameRuns("Mohammed محمد العتيبي Martin").map(run => run.text)).toEqual(["Mohammed ", "العتيبي", " ", "محمد", " Martin"]);
    expect(linesOf("Mohammed محمد العتيبي Martin", 16)).toEqual([
      ["Mohammed ", "محمد"],
      ["العتيبي", " Martin"],
    ]);
  });

  it("coupe dans un mot plus long que la ligne, sans détacher une lettre de ses harakat", () => {
    expect(linesOf("王小明李华张伟", 4)).toEqual([["王小明李"], ["华张伟"]]);
    const lines = linesOf("مُحَمَّد", 3);
    expect(lines.map(line => line.join(""))).toEqual(["مُ", "حَ", "مَّ", "د"]);
  });

  it("retire les emoji et remplace un caractère sans dessin par sa forme simple, ou « ? »", () => {
    const latinOnly = (_font: InvoiceNameRun["font"], char: string) => /[\x20-\x7e]/.test(char);
    expect(printableInvoiceName("Zoë ★ Martin 1️⃣", latinOnly)).toBe("Zoe Martin 1");
    expect(printableInvoiceName("Łukasz 김", latinOnly)).toBe("?ukasz ?");
    expect(printableInvoiceName("  Jean  Dupont ", latinOnly)).toBe("  Jean  Dupont ");
  });

  it("met le point médian entre deux idéogrammes et la ponctuation pleine chasse dans la police chinoise", () => {
    expect(invoiceNameRuns("迈克尔·乔丹")).toEqual([{ text: "迈克尔·乔丹", font: "han" }]);
    expect(invoiceNameRuns("王小明（Wang Xiaoming）")).toEqual([
      { text: "王小明（", font: "han" },
      { text: "Wang Xiaoming", font: "regular" },
      { text: "）", font: "han" },
    ]);
  });
});

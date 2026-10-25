import { beforeEach, describe, expect, it, vi } from "vitest";

const { storagePut } = vi.hoisted(() => ({ storagePut: vi.fn() }));

vi.mock("./storage.js", () => ({ storagePut }));

import { buildInvoiceContent, generateInvoicePDF, invoiceNameRuns, type InvoiceData } from "./invoice";
import { resolveInvoiceSeller } from "./invoiceSeller";

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
  ])("imprime « %s » lisiblement", async name => {
    expect(await printedName(name)).toBe(name);
  });

  it("imprime en NFC un nom saisi en lettres décomposées", async () => {
    const decomposed = "Zoë Hélène Garçon";
    expect(buildInvoiceContent(invoiceFor(decomposed), resolveInvoiceSeller({})).buyerLines[0]).toBe("Zoë Hélène Garçon");
    expect(await printedName(decomposed)).toBe("Zoë Hélène Garçon");
  });

  it.each(["王小明", "田中 ひろし"])("imprime le nom chinois ou japonais « %s » avec Noto Sans SC", async name => {
    const pdf = await invoicePdf(name);
    expect(embeddedFonts(pdf)).toContain("NotoSansSC-Regular");
    expect(await printedName(name)).toBe(name);
  });

  // pdf.js liste les mots de gauche à droite : un nom arabe s’affiche de droite
  // à gauche, son premier mot (محمد) se retrouve donc à droite, en dernier.
  it.each([
    ["محمد العتيبي", "العتيبي محمد"],
    ["Mohammed محمد العتيبي", "Mohammed العتيبي محمد"],
    ["محمد العتيبي (Mohammed)", "(Mohammed) العتيبي محمد"],
  ])("imprime le nom arabe « %s » façonné, de droite à gauche", async (name, leftToRight) => {
    const pdf = await invoicePdf(name);
    expect(embeddedFonts(pdf)).toContain("NotoSansArabic-Regular");
    expect(await printedName(name)).toBe(leftToRight);
  });

  it.each(["محمد العتيبي", "王小明"])("régénère octet pour octet la facture de « %s » (polices arabe et chinoise comprises)", async name => {
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

  it("garde Noto Sans pour tout le document et ne charge les polices arabe et chinoise qu’au besoin", async () => {
    expect(embeddedFonts(await invoicePdf("Łukasz Kowalski"))).toEqual(["NotoSans-Bold", "NotoSans-Regular"]);
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
  });
});

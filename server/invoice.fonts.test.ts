import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readFileSync, storagePutOnce } = vi.hoisted(() => ({ readFileSync: vi.fn(), storagePutOnce: vi.fn() }));

vi.mock("./storage.js", () => ({ storagePutOnce }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  readFileSync.mockImplementation(actual.readFileSync);
  return { ...actual, default: { ...actual, readFileSync }, readFileSync };
});

import { copyFileSync, globSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolveInvoiceSeller } from "./invoiceSeller";
import type { InvoiceData } from "./invoice";

const root = process.cwd();
const originalReadFileSync = readFileSync.getMockImplementation()!;

function invoiceFor(customerName: string): InvoiceData {
  return {
    invoiceNumber: "FAC-2026-000009",
    issueDate: new Date("2026-10-11T22:46:00.000Z"),
    paymentDate: new Date("2026-10-11T22:45:00.000Z"),
    trackingId: "APTTEST000009",
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

// Module neuf à chaque test : les polices lues restent en mémoire du processus.
async function generate(customerName: string): Promise<Buffer> {
  const { generateInvoicePDF } = await import("./invoice");
  return (await generateInvoicePDF(invoiceFor(customerName), resolveInvoiceSeller({}))).buffer;
}

async function pdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text.replace(/\s+/g, " ");
  } finally {
    await parser.destroy();
  }
}

function fontFilesRead(): string[] {
  return readFileSync.mock.calls.map(([file]) => path.basename(String(file))).filter(file => /\.(ttf|otf)$/.test(file));
}

function failReading(fails: (file: string) => boolean, failure: () => unknown) {
  readFileSync.mockImplementation((file: unknown, ...rest: unknown[]) => {
    if (fails(String(file))) return failure();
    return (originalReadFileSync as (...args: unknown[]) => unknown)(file, ...rest);
  });
}

const named = (fileNames: string[]) => (file: string) => fileNames.includes(path.basename(file));

function missingFile(): never {
  throw Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
}

describe("polices de la facture PDF", () => {
  beforeEach(() => {
    vi.resetModules();
    readFileSync.mockClear();
    readFileSync.mockImplementation(originalReadFileSync);
    storagePutOnce.mockResolvedValue({ key: "invoices/FAC-2026-000009-APTTEST000009.pdf", url: "https://storage.test/invoice.pdf", uploaded: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ne lit la police chinoise (plusieurs Mo) que pour un nom en idéogrammes, et l’arabe que pour un nom arabe", async () => {
    await generate("Łukasz Kowalski");
    expect(fontFilesRead().sort()).toEqual(["NotoSans-Bold.ttf", "NotoSans-Regular.ttf"]);

    // Le point médian catalan est aussi un signe chinois (Script_Extensions=Han).
    await generate("Marcel·la Col·lell");
    expect(fontFilesRead().sort()).toEqual(["NotoSans-Bold.ttf", "NotoSans-Regular.ttf"]);

    await generate("王小明");
    expect(fontFilesRead()).toContain("NotoSansSC-Regular.otf");
    expect(fontFilesRead()).not.toContain("NotoSansArabic-Regular.ttf");

    await generate("محمد العتيبي");
    expect(fontFilesRead()).toContain("NotoSansArabic-Regular.ttf");
  });

  it("revient à Helvetica sans faire échouer la facture si Noto Sans manque", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    failReading(named(["NotoSans-Regular.ttf", "NotoSans-Bold.ttf"]), missingFile);

    const pdf = await generate("Zoë Ørsted");
    const text = await pdfText(pdf);

    expect(pdf.toString("latin1")).toContain("/BaseFont /Helvetica");
    expect(pdf.toString("latin1")).not.toContain("NotoSans");
    expect(text).toContain("FAC-2026-000009");
    expect(text).toContain("Zoë Ørsted");
    expect(error).toHaveBeenCalledWith("Invoice font missing:", "NotoSans-Regular.ttf");
  });

  it("garde la facture si la police chinoise est illisible", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    failReading(named(["NotoSansSC-Regular.otf"]), () => Buffer.from("not a font"));

    const pdf = await generate("王小明");
    const text = await pdfText(pdf);

    expect(pdf.toString("latin1")).not.toContain("NotoSansSC");
    expect(text).toContain("FAC-2026-000009");
    expect(text).toContain("patient@example.test");
    expect(error).toHaveBeenCalledWith("Invoice font unreadable:", "NotoSansSC-Regular.otf", expect.any(String));
  });

  it("trouve les polices sous le répertoire courant, comme api/index.js sur Vercel", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // La fonction Vercel : le bundle n’a pas server/fonts à côté de lui, seul le
    // répertoire courant (racine de la fonction, includeFiles) l’a.
    const functionRoot = mkdtempSync(path.join(tmpdir(), "invoice-function-"));
    try {
      mkdirSync(path.join(functionRoot, "server", "fonts"), { recursive: true });
      for (const file of ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf"]) {
        copyFileSync(path.join(root, "server", "fonts", file), path.join(functionRoot, "server", "fonts", file));
      }
      const sourceFonts = path.join(root, "server", "fonts") + path.sep;
      failReading(file => file.startsWith(sourceFonts), missingFile);
      const { generateInvoicePDF } = await import("./invoice");
      vi.spyOn(process, "cwd").mockReturnValue(functionRoot);

      const pdf = (await generateInvoicePDF(invoiceFor("Zoë Ørsted"), resolveInvoiceSeller({}))).buffer;

      expect(readFileSync.mock.calls.map(([file]) => String(file))).toContain(path.join(functionRoot, "server", "fonts", "NotoSans-Regular.ttf"));
      expect(pdf.toString("latin1")).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-Regular/);
      expect(pdf.toString("latin1")).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-Bold/);
      expect(pdf.toString("latin1")).not.toContain("Helvetica");
      expect(error).not.toHaveBeenCalled();
    } finally {
      rmSync(functionRoot, { recursive: true, force: true });
    }
  });

  it("embarque toutes les polices dans la fonction Vercel, pour un poids raisonnable", async () => {
    const { INVOICE_FONT_FILES } = await import("./invoice");
    const vercel = JSON.parse(String(originalReadFileSync(path.join(root, "vercel.json"), "utf8")));
    const included = globSync(vercel.functions["api/index.js"].includeFiles, { cwd: root }).filter(file => statSync(path.join(root, file)).isFile());
    const fonts = included.filter(file => file.startsWith("server/fonts/"));
    const size = (files: string[]) => files.reduce((total, file) => total + statSync(path.join(root, file)).size, 0);

    for (const file of Object.values(INVOICE_FONT_FILES)) expect(fonts).toContain(`server/fonts/${file}`);
    for (const license of ["NotoSans-OFL.txt", "NotoSansArabic-OFL.txt", "NotoSansSC-OFL.txt"]) expect(fonts).toContain(`server/fonts/${license}`);
    expect(included.some(file => file.startsWith("drizzle/"))).toBe(true);
    // Noto Sans SC (~8 Mo) domine ; une police CJK complète ou variable (16 à 17 Mo) dépasserait.
    expect(size(fonts)).toBeLessThan(10 * 1024 * 1024);
    expect(size(included)).toBeLessThan(15 * 1024 * 1024);
  });
});

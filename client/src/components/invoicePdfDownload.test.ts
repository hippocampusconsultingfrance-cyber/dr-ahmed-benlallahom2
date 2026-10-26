import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadInvoicePdf } from "./invoicePdfDownload";

describe("téléchargement de la facture régénérée (EXPL-02)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("enregistre le PDF sous son nom et laisse 40 s au navigateur pour le lire avant de libérer son adresse", async () => {
    vi.useFakeTimers();
    const anchor = { href: "", download: "", style: { display: "" }, click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("document", { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:facture");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    downloadInvoicePdf({ filename: "Facture-FAC-2026-000009.pdf", contentBase64: Buffer.from("%PDF-1.4").toString("base64") });

    expect(anchor).toMatchObject({ href: "blob:facture", download: "Facture-FAC-2026-000009.pdf" });
    expect(anchor.click).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe("application/pdf");
    expect(await blob.text()).toBe("%PDF-1.4");
    // Safari et iOS peuvent démarrer le téléchargement bien après le clic.
    vi.advanceTimersByTime(39_000);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:facture");
  });
});

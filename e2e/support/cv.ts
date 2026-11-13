import PDFDocument from "pdfkit";

/** A one-page PDF CV with real text, as a candidate would send it. */
export function cvPdf(lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 56, info: { Title: "CV" } });
    const chunks: Buffer[] = [];
    document.on("data", chunk => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.fontSize(12);
    for (const line of lines) document.text(line).moveDown(0.5);
    document.end();
  });
}

export const CV_LINES = [
  "Dr Inès Moreau",
  "Médecin anesthésiste-réanimateur",
  "Expérience",
  "2016 - 2024 : Praticienne hospitalière, service d'anesthésie-réanimation, Centre hospitalier de Lyon, France.",
  "2012 - 2016 : Interne en anesthésie-réanimation, Hospices civils de Lyon.",
  "Diplômes",
  "Diplôme d'études spécialisées en anesthésie-réanimation, Université Claude Bernard Lyon 1, 2016.",
  "Langues : français (langue maternelle), anglais (courant).",
];

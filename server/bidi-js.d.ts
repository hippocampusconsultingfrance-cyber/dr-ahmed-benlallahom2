declare module "bidi-js" {
  type EmbeddingLevels = {
    levels: Uint8Array;
    paragraphs: Array<{ start: number; end: number; level: number }>;
  };

  type Bidi = {
    getEmbeddingLevels(text: string, explicitDirection?: "ltr" | "rtl"): EmbeddingLevels;
    getMirroredCharacter(char: string): string | null;
  };

  export default function bidiFactory(): Bidi;
}

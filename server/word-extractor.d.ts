declare module "word-extractor" {
  type ExtractedWordDocument = {
    getBody(): string;
  };

  class WordExtractor {
    extract(input: Buffer): Promise<ExtractedWordDocument>;
  }

  export = WordExtractor;
}

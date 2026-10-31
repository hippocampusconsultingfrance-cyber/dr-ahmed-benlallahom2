import { shortenFileName } from "../candidateDocumentValidation";

/** Shared by createApp (server/_core/index.ts) and the Express routes of server/routes. */
export const PUBLIC_APP_ORIGIN = process.env.PUBLIC_APP_ORIGIN || "https://drahmedbenlallahom.com";

export function safeErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

/**
 * Read in compatibility form (NFKC) first, as the vault does (safeCandidateDocumentName): a
 * name typed on macOS comes decomposed (NFD), and « Diplôme » then gave « Diplo_me ».
 */
export function safeFileName(value: string): string {
  return shortenFileName(value.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "_")) || "cv";
}

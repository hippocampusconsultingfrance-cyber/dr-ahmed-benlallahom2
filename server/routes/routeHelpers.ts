import { shortenFileName } from "../candidateDocumentValidation";

/** Shared by createApp (server/_core/index.ts) and the Express routes of server/routes. */
export const PUBLIC_APP_ORIGIN = process.env.PUBLIC_APP_ORIGIN || "https://drahmedbenlallahom.com";

export function safeErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

export function safeFileName(value: string): string {
  return shortenFileName(value.replace(/[^a-zA-Z0-9._-]/g, "_")) || "cv";
}

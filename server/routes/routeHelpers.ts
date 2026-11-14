import { asciiFileName, displayFileName } from "../candidateDocumentValidation";

/** Shared by createApp (server/_core/index.ts) and the Express routes of server/routes. */
export const PUBLIC_APP_ORIGIN =
  process.env.PUBLIC_APP_ORIGIN || "https://drahmedbenlallahom.com";

export function safeErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

/**
 * Content-Disposition of a downloaded file (INTL-07): `filename` in ASCII
 * (asciiFileName) for the clients that read only it, and `filename*` with the
 * name in UTF-8 (RFC 6266, RFC 8187), which browsers prefer: « 执业证书.pdf »
 * is saved under its own name, and the header holds no character Node refuses.
 */
export function attachmentContentDisposition(
  name: string,
  fallback: string
): string {
  const encoded = encodeURIComponent(displayFileName(name, fallback)).replace(
    /['()*]/g,
    character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${asciiFileName(name, fallback)}"; filename*=UTF-8''${encoded}`;
}

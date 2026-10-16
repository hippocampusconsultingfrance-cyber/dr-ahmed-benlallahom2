/**
 * Upload size limit of the candidate document vault, shared by the browser
 * check, the multer limit and the validation (OPS-09 / CAND-06). A Vercel
 * Function rejects request bodies above 4.5 MB before the application sees
 * them, so the limit stays below it with room for the multipart envelope.
 * Owner decision: 4 MB.
 */
export const CANDIDATE_DOCUMENT_MAX_MEGABYTES = 4;
export const CANDIDATE_DOCUMENT_MAX_BYTES = CANDIDATE_DOCUMENT_MAX_MEGABYTES * 1024 * 1024;

/** French error shown when a candidate document is too large (server and browser). */
export const CANDIDATE_DOCUMENT_TOO_LARGE_MESSAGE = `Le document dépasse la taille maximale de ${CANDIDATE_DOCUMENT_MAX_MEGABYTES} Mo. Réduisez sa taille (scan en 150 à 200 dpi, PDF compressé ou photo moins lourde) puis réessayez.`;

/**
 * Model recorded for the manual-review result saved when the AI provider
 * refuses a CV analysis for billing (REC-08). The server sets it; the admin
 * reads it to label the dossiers saved that way before the « degraded » status.
 */
export const MANUAL_REVIEW_FALLBACK_MODEL = "local/manual-review-fallback";

/**
 * Model recorded for the manual-review result saved when the AI provider
 * refuses a CV analysis for billing (REC-08). The server sets it; the admin
 * reads it to label the dossiers saved that way before the « degraded » status.
 */
export const MANUAL_REVIEW_FALLBACK_MODEL = "local/manual-review-fallback";

/**
 * Version of the CV analysis prompt, stored with each analysis
 * (analysis_prompt_version): the score and facts of an analysis of another
 * version are not used until the dossier is analysed again, and the admin
 * shows « Score à recalculer » for it. v8: the candidate's data between tags
 * of the server (IA-05), one quote counted once (IA-04).
 */
export const RECRUITMENT_ANALYSIS_PROMPT_VERSION = "recruitment-v8";

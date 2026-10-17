/**
 * Single source of truth for candidate-vault document categories, shared by
 * the upload route, the analysis worker, the admin re-analysis action and the
 * candidate portal UI (LEGAL-12).
 */

/** Every value that may exist in candidate_documents.category; retired values stay readable for older rows. */
export const CANDIDATE_DOCUMENT_CATEGORIES = [
  "identity_document",
  "medical_license",
  "diploma",
  "certificate",
  "professional_insurance",
  "vaccination_record",
  "criminal_record",
  "employment_evidence",
  "proof_of_address",
  "other",
] as const;

export type CandidateDocumentCategory = (typeof CANDIDATE_DOCUMENT_CATEGORIES)[number];

/**
 * Categories a candidate may upload. Criminal-record extracts (GDPR art. 10)
 * and vaccination records (health data, GDPR art. 9) are no longer collected
 * through the vault.
 */
export const CANDIDATE_UPLOADABLE_DOCUMENT_CATEGORIES = [
  "identity_document",
  "medical_license",
  "diploma",
  "certificate",
  "professional_insurance",
  "employment_evidence",
  "proof_of_address",
  "other",
] as const satisfies readonly CandidateDocumentCategory[];

export type CandidateUploadableDocumentCategory = (typeof CANDIDATE_UPLOADABLE_DOCUMENT_CATEGORIES)[number];

/**
 * Professional credentials are the only documents ever sent to the AI review
 * assistant. Identity documents, proofs of address, free-form "other" files
 * and any retired sensitive category get a human review only.
 */
export const CANDIDATE_AI_ANALYSIS_CATEGORIES = [
  "medical_license",
  "diploma",
  "certificate",
  "professional_insurance",
  "employment_evidence",
] as const satisfies readonly CandidateUploadableDocumentCategory[];

const aiAnalysisCategories: ReadonlySet<string> = new Set(CANDIDATE_AI_ANALYSIS_CATEGORIES);
const uploadableCategories: ReadonlySet<string> = new Set(CANDIDATE_UPLOADABLE_DOCUMENT_CATEGORIES);

export function candidateDocumentAllowsAiAnalysis(category: string | null | undefined): boolean {
  return typeof category === "string" && aiAnalysisCategories.has(category);
}

export function isCandidateUploadableDocumentCategory(category: string): category is CandidateUploadableDocumentCategory {
  return uploadableCategories.has(category);
}

/** Stored instead of an AI summary for documents that are never sent to an AI service. */
export const CANDIDATE_HUMAN_REVIEW_ONLY_SUMMARY = "Revue humaine uniquement : ce type de document (pièce d’identité, justificatif de domicile, document libre ou catégorie retirée) n’est jamais transmis à un service d’IA. Vérifiez directement le fichier original.";
export const CANDIDATE_HUMAN_REVIEW_ONLY_FLAG = "human_review_only";

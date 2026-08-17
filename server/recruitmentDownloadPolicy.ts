export type CvDownloadRecord = {
  cvFileKey: string;
  fileValidationStatus: "quarantined" | "accepted" | "rejected" | "validation_failed";
};

/**
 * Administrators may retrieve CVs that are still being processed. Only files
 * explicitly retired or rejected by the document-security controls are blocked.
 */
export function canAdminDownloadCv(application: CvDownloadRecord): boolean {
  const fileWasExplicitlyRetired = application.cvFileKey.startsWith("retired/");
  const fileWasRejected = application.fileValidationStatus === "rejected" || application.fileValidationStatus === "validation_failed";
  return !fileWasExplicitlyRetired && !fileWasRejected;
}

export const CV_DOWNLOAD_UNAVAILABLE_MESSAGE = "Le document n’est pas disponible car son contrôle de sécurité a échoué ou il a été supprimé à la demande de son titulaire.";

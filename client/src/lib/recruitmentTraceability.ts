export function recruitmentEmailDeliveryLabel(eventType: string | null | undefined) {
  const labels: Record<string, string> = {
    "email.sent": "Accepté par Resend",
    "email.delivered": "Distribué",
    "email.delivery_unknown": "Livraison à confirmer",
    "email.delivery_delayed": "Distribution retardée",
    "email.bounced": "Adresse rejetée",
    "email.complained": "Signalé comme indésirable",
    "email.failed": "Échec d’envoi",
    "email.suppressed": "Envoi bloqué",
  };
  return labels[eventType || ""] || "Suivi indisponible";
}

export function recruitmentEmailDeliveryTone(eventType: string | null | undefined) {
  if (eventType === "email.delivered") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (eventType === "email.sent") return "border-primary/25 bg-primary/10 text-primary";
  if (eventType === "email.delivery_delayed" || eventType === "email.delivery_unknown") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (["email.bounced", "email.complained", "email.failed", "email.suppressed"].includes(eventType || "")) return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted/30 text-muted-foreground";
}

export function recruitmentEmailDeliveryErrorLabel(failureCode: string | null | undefined) {
  if (!failureCode) return null;
  if (failureCode === "provider_rejected") return "Resend a refusé temporairement l’envoi";
  if (failureCode === "delivery_exception") return "Réponse de Resend indéterminée — aucune relance automatique pour éviter un doublon";
  return "Échec technique à examiner";
}

export function recruitmentCandidatePortalLabel(active: boolean, invitationEventType: string | null | undefined, activationEventType?: string | null) {
  if (active) return "Espace actif";
  if (activationEventType === "email.delivered") return "Activation distribuée";
  if (activationEventType === "email.sent") return "Activation acceptée par Resend";
  if (activationEventType === "email.delivery_delayed") return "Activation retardée";
  if (activationEventType === "email.delivery_unknown") return "Activation à confirmer";
  if (["email.bounced", "email.complained", "email.failed", "email.suppressed"].includes(activationEventType || "")) return "Échec de l’activation";
  if (invitationEventType === "email.delivered") return "Invitation distribuée";
  if (invitationEventType === "email.sent") return "Invitation acceptée par Resend";
  if (invitationEventType === "email.delivery_delayed") return "Invitation retardée";
  if (invitationEventType === "email.delivery_unknown") return "Invitation à confirmer";
  if (["email.bounced", "email.complained", "email.failed", "email.suppressed"].includes(invitationEventType || "")) return "Échec de l’invitation";
  return "Invitation non suivie";
}

export function recruitmentDriveExportLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    queued: "En attente de copie",
    running: "Copie en cours",
    retry: "Nouvelle tentative prévue",
    completed: "Copié dans Drive",
    failed: "Échec de la copie",
  };
  return labels[status || ""] || "Copie non planifiée";
}

export function recruitmentDriveExportTone(status: string | null | undefined) {
  if (status === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "failed") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (status === "retry") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "queued" || status === "running") return "border-primary/25 bg-primary/10 text-primary";
  return "border-border bg-muted/30 text-muted-foreground";
}

export function recruitmentDriveExportErrorLabel(error: string | null | undefined) {
  if (!error) return null;
  if (/token|unauthorized|401|403|invalid_grant/i.test(error)) return "Connexion Google Drive à renouveler";
  if (/configuration|connection_missing/i.test(error)) return "Connexion Google Drive indisponible";
  if (/download|storage|404/i.test(error)) return "CV privé temporairement indisponible";
  if (/upload|quota|rate|429/i.test(error)) return "Google Drive a refusé temporairement la copie";
  return "Échec technique à examiner";
}

/** Readable French explanation of a technical CV-analysis error (never the raw provider text). */
export function recruitmentAnalysisErrorLabel(error: string | null | undefined) {
  if (!error) return null;
  // ABUS-01: application received beyond the day's volume, kept without AI analysis.
  if (error === "analysis_deferred_daily_volume") return "Analyse IA non lancée : volume de candidatures inhabituel ce jour-là. Relancez l’analyse si le dossier est légitime.";
  if (/billing|credit card|402|payment required/i.test(error)) return "Analyse IA indisponible (compte du fournisseur à vérifier) : examinez le CV manuellement.";
  if (/^cv_validation_/i.test(error)) return "Le fichier CV a été refusé par le contrôle de sécurité : examinez-le manuellement ou demandez un PDF au candidat.";
  if (/attempts_exhausted/i.test(error)) return "Analyse abandonnée après plusieurs échecs : relancez-la plus tard ou examinez le CV manuellement.";
  if (/worker_interrupted/i.test(error)) return "Traitement interrompu ; il sera repris automatiquement au prochain passage.";
  if (/cv_download|storage/i.test(error)) return "Le CV n’a pas pu être lu dans le stockage privé ; une nouvelle tentative est prévue.";
  if (/gateway|timeout|timed out|failed after|5\d\d|econn|fetch failed|overloaded|rate/i.test(error)) return "Le service d’analyse IA n’a pas répondu ; une nouvelle tentative est programmée.";
  return "Échec technique de l’analyse : examinez le CV manuellement.";
}

export type AdminToast = { tone: "success" | "warning" | "info" | "error"; message: string };

/** Toast after « Relancer l’analyse »: success only when an analysis really completed (ADM-REC-02). */
export function reanalysisToast(result: { outcome?: string; error?: string | null; processed?: number }): AdminToast {
  switch (result.outcome) {
    case "completed": return { tone: "success", message: "Analyse relancée et résultat actualisé." };
    case "needs_review": return { tone: "success", message: "Analyse actualisée : des points demandent une revue humaine." };
    case "already_running": return { tone: "info", message: "Une analyse de ce CV est déjà en cours." };
    case "queued": return { tone: "info", message: "Analyse remise en file : elle sera traitée au prochain passage." };
    case "retry_scheduled": return { tone: "warning", message: `L’analyse a échoué ; une nouvelle tentative est programmée. ${recruitmentAnalysisErrorLabel(result.error) ?? ""}`.trim() };
    case "failed": return { tone: "error", message: `L’analyse a échoué. ${recruitmentAnalysisErrorLabel(result.error) ?? ""}`.trim() };
    default: return (result.processed ?? 0) > 0 ? { tone: "success", message: "Analyse relancée." } : { tone: "info", message: "Analyse déjà en cours de traitement." };
  }
}

/** Toast after « Relancer la copie » Google Drive (ADM-DRIVE-01). */
export function driveRetryToast(result: { outcome?: string; error?: string | null }): AdminToast {
  switch (result.outcome) {
    case "completed": return { tone: "success", message: "CV copié dans Google Drive." };
    case "already_completed": return { tone: "success", message: "Le CV est déjà présent dans Google Drive." };
    case "already_running": return { tone: "info", message: "La copie Google Drive est déjà en cours." };
    case "queued": return { tone: "info", message: "Copie Google Drive remise en file." };
    case "waiting_validation": return { tone: "info", message: "Le CV doit d’abord être validé par le contrôle de sécurité ; la copie suivra automatiquement." };
    case "not_connected": return { tone: "warning", message: "Google Drive n’est pas connecté : connectez-le depuis l’en-tête de l’onglet." };
    case "retry_scheduled":
    case "failed": {
      const reason = recruitmentDriveExportErrorLabel(result.error);
      return { tone: result.outcome === "failed" ? "error" : "warning", message: `La copie Google Drive a échoué${reason ? ` : ${reason}` : ""}.${/renouveler/.test(reason ?? "") ? " Cliquez sur « Reconnexion Google Drive requise »." : " Une nouvelle tentative est prévue."}` };
    }
    default: return { tone: "info", message: "Copie Google Drive relancée." };
  }
}

/** Header button of the Candidatures tab: never « connecté » when the token was revoked. */
export function googleDriveConnectionState(status: { connected?: boolean; lastError?: string | null } | null | undefined) {
  if (!status?.connected) return { label: "Connecter Google Drive", needsAttention: false };
  if (status.lastError && /token|unauthorized|401|403|invalid_grant/i.test(status.lastError)) return { label: "Reconnexion Google Drive requise", needsAttention: true };
  if (status.lastError) return { label: "Google Drive connecté · dernière copie en échec", needsAttention: true };
  return { label: "Google Drive connecté", needsAttention: false };
}

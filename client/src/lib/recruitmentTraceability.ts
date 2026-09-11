export function recruitmentEmailDeliveryLabel(eventType: string | null | undefined) {
  const labels: Record<string, string> = {
    "email.sent": "Accepté par Resend",
    "email.delivered": "Distribué",
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
  if (eventType === "email.delivery_delayed") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (["email.bounced", "email.complained", "email.failed", "email.suppressed"].includes(eventType || "")) return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted/30 text-muted-foreground";
}

export function recruitmentEmailDeliveryErrorLabel(failureCode: string | null | undefined) {
  if (!failureCode) return null;
  if (failureCode === "provider_rejected") return "Resend a refusé temporairement l’envoi";
  if (failureCode === "delivery_exception") return "Le service d’e-mail était temporairement indisponible";
  return "Échec technique à examiner";
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

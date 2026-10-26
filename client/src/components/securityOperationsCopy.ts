// `counts`: row counts of the traces of the administrator's actions on a person's data (RGPD-12), by metadata key.
export const securityOperationsCopy = {
  fr: {
    loading: "Chargement du journal de sécurité", loadError: "Impossible de charger le journal de sécurité", title: "Observabilité de sécurité", subtitle: "Journal pseudonymisé des accès, blocages et actions sensibles. Actualisation toutes les 30 secondes.", noEvents: "Aucun événement de sécurité n’est encore enregistré.", highEvents: "événement(s) à examiner", noHighEvents: "Aucun événement élevé récent",
    categories: { candidate_document_upload_protection: "Protection du dépôt de document candidat", admin_personal_data_exported: "Export des données d’une personne (RGPD)", admin_personal_data_erased: "Effacement des données d’une personne (RGPD)", admin_contact_message_deleted: "Suppression d’un message de contact", admin_medical_question_deleted: "Suppression d’une question santé" },
    counts: { deleted: "Lignes supprimées", contactMessages: "Messages", medicalQuestions: "Questions santé", gdprRequests: "Demandes RGPD", appointments: "Rendez-vous", recruitmentApplications: "Candidatures", contactMessagesDeleted: "Messages supprimés", medicalQuestionsDeleted: "Questions santé supprimées", appointmentsAnonymised: "Rendez-vous anonymisés", upcomingAppointmentsKept: "Rendez-vous à venir conservés", recruitmentApplicationsLeft: "Dossiers candidat à effacer séparément" }, countSeparator: " : ",
    outcomes: { blocked: "Bloqué", allowed: "Autorisé", succeeded: "Réussi", failed: "Échoué" }, severities: { info: "Information", warning: "Avertissement", high: "Élevé", critical: "Critique" }, actors: { candidate: "Candidat", admin: "Administrateur", system: "Système" },
  },
  en: {
    loading: "Loading security log", loadError: "Unable to load security log", title: "Security observability", subtitle: "Pseudonymised log of access, blocks and sensitive actions. Refreshed every 30 seconds.", noEvents: "No security event has been recorded yet.", highEvents: "event(s) to review", noHighEvents: "No recent high-severity event",
    categories: { candidate_document_upload_protection: "Candidate document upload protection", admin_personal_data_exported: "Export of a person’s data (GDPR)", admin_personal_data_erased: "Erasure of a person’s data (GDPR)", admin_contact_message_deleted: "Contact message deleted", admin_medical_question_deleted: "Health question deleted" },
    counts: { deleted: "Rows deleted", contactMessages: "Messages", medicalQuestions: "Health questions", gdprRequests: "GDPR requests", appointments: "Appointments", recruitmentApplications: "Applications", contactMessagesDeleted: "Messages deleted", medicalQuestionsDeleted: "Health questions deleted", appointmentsAnonymised: "Appointments anonymised", upcomingAppointmentsKept: "Upcoming appointments kept", recruitmentApplicationsLeft: "Candidate files to erase separately" }, countSeparator: ": ",
    outcomes: { blocked: "Blocked", allowed: "Allowed", succeeded: "Succeeded", failed: "Failed" }, severities: { info: "Information", warning: "Warning", high: "High", critical: "Critical" }, actors: { candidate: "Candidate", admin: "Administrator", system: "System" },
  },
  de: {
    loading: "Sicherheitsprotokoll wird geladen", loadError: "Sicherheitsprotokoll kann nicht geladen werden", title: "Sicherheitsbeobachtung", subtitle: "Pseudonymisiertes Protokoll von Zugriffen, Blockierungen und sensiblen Aktionen. Aktualisierung alle 30 Sekunden.", noEvents: "Es wurde noch kein Sicherheitsereignis erfasst.", highEvents: "Ereignis(se) zur Prüfung", noHighEvents: "Keine aktuellen Ereignisse hoher Schwere",
    categories: { candidate_document_upload_protection: "Schutz beim Hochladen von Kandidatendokumenten", admin_personal_data_exported: "Export der Daten einer Person (DSGVO)", admin_personal_data_erased: "Löschung der Daten einer Person (DSGVO)", admin_contact_message_deleted: "Kontaktnachricht gelöscht", admin_medical_question_deleted: "Gesundheitsfrage gelöscht" },
    counts: { deleted: "Gelöschte Zeilen", contactMessages: "Nachrichten", medicalQuestions: "Gesundheitsfragen", gdprRequests: "DSGVO-Anfragen", appointments: "Termine", recruitmentApplications: "Bewerbungen", contactMessagesDeleted: "Gelöschte Nachrichten", medicalQuestionsDeleted: "Gelöschte Gesundheitsfragen", appointmentsAnonymised: "Anonymisierte Termine", upcomingAppointmentsKept: "Beibehaltene künftige Termine", recruitmentApplicationsLeft: "Separat zu löschende Bewerberakten" }, countSeparator: ": ",
    outcomes: { blocked: "Blockiert", allowed: "Zugelassen", succeeded: "Erfolgreich", failed: "Fehlgeschlagen" }, severities: { info: "Information", warning: "Warnung", high: "Hoch", critical: "Kritisch" }, actors: { candidate: "Kandidat", admin: "Administrator", system: "System" },
  },
  zh: {
    loading: "正在加载安全日志", loadError: "无法加载安全日志", title: "安全可观测性", subtitle: "访问、拦截和敏感操作的去标识化日志。每 30 秒更新一次。", noEvents: "尚未记录任何安全事件。", highEvents: "个待审查事件", noHighEvents: "近期没有高严重性事件",
    categories: { candidate_document_upload_protection: "候选人文件上传保护", admin_personal_data_exported: "导出个人数据（GDPR）", admin_personal_data_erased: "删除个人数据（GDPR）", admin_contact_message_deleted: "删除联系消息", admin_medical_question_deleted: "删除健康问题" },
    counts: { deleted: "已删除行数", contactMessages: "消息", medicalQuestions: "健康问题", gdprRequests: "GDPR 请求", appointments: "预约", recruitmentApplications: "求职申请", contactMessagesDeleted: "已删除消息", medicalQuestionsDeleted: "已删除健康问题", appointmentsAnonymised: "已匿名化预约", upcomingAppointmentsKept: "保留的未来预约", recruitmentApplicationsLeft: "需单独删除的候选人档案" }, countSeparator: "：",
    outcomes: { blocked: "已拦截", allowed: "已允许", succeeded: "成功", failed: "失败" }, severities: { info: "信息", warning: "警告", high: "高", critical: "严重" }, actors: { candidate: "候选人", admin: "管理员", system: "系统" },
  },
} as const;

type SecurityOperationsCopy = (typeof securityOperationsCopy)[keyof typeof securityOperationsCopy];

/** "Messages supprimés : 2 · Rendez-vous anonymisés : 1": the counts a trace holds, in the copy's language; keys without a label are left out. */
export function describeSecurityEventCounts(copy: SecurityOperationsCopy, counts: Record<string, number> | null | undefined) {
  if (!counts) return "";
  return Object.entries(counts)
    .filter(([key]) => key in copy.counts)
    .map(([key, value]) => `${copy.counts[key as keyof SecurityOperationsCopy["counts"]]}${copy.countSeparator}${value}`)
    .join(" · ");
}

/**
 * ADM-15: each category of the security journal (security_events.category)
 * as a plain sentence, in the four languages of the admin's Sécurité tab,
 * shared with the owner's security alert, written in French (MAIL-04). A
 * category whose meaning depends on the event's outcome (a sign-in accepted
 * or refused) has one sentence per outcome, read before the category's own.
 */
export type SecurityEventLabelLanguage = "fr" | "en" | "de" | "zh";

type Labels = Record<SecurityEventLabelLanguage, string>;

const labels = (fr: string, en: string, de: string, zh: string): Labels => ({ fr, en, de, zh });

export const SECURITY_EVENT_LABELS: Record<string, Labels> = {
  // The administrator: second factor, sessions, Google Drive and actions on data.
  admin_mfa_verify: labels("Vérification du code de sécurité admin", "Admin security code check", "Prüfung des Admin-Sicherheitscodes", "管理员安全码验证"),
  admin_mfa_challenge_issued: labels("Code de sécurité admin envoyé par email", "Admin security code sent by email", "Admin-Sicherheitscode per E-Mail gesendet", "管理员安全码已通过电子邮件发送"),
  admin_mfa_challenge_email_failed: labels("Code de sécurité admin non envoyé : l’email n’est pas parti", "Admin security code not sent: the email did not leave", "Admin-Sicherheitscode nicht gesendet: Die E-Mail wurde nicht verschickt", "管理员安全码未发送：邮件未能发出"),
  admin_mfa_begin_rate_limited: labels("Trop de demandes de code de sécurité admin — bloqué", "Too many admin security code requests — blocked", "Zu viele Anfragen nach einem Admin-Sicherheitscode — blockiert", "管理员安全码请求过多——已拦截"),
  admin_mfa_verify_rate_limited: labels("Trop d’essais de code de sécurité admin — bloqué", "Too many admin security code attempts — blocked", "Zu viele Versuche mit dem Admin-Sicherheitscode — blockiert", "管理员安全码尝试次数过多——已拦截"),
  admin_mfa_session_revoked: labels("Déconnexion admin : session de sécurité fermée", "Admin sign-out: security session closed", "Admin-Abmeldung: Sicherheitssitzung beendet", "管理员退出登录：安全会话已关闭"),
  admin_sessions_revoked_others: labels("Autres sessions admin révoquées", "Other admin sessions revoked", "Andere Admin-Sitzungen widerrufen", "已撤销管理员的其他会话"),
  google_drive_connected: labels("Google Drive connecté à l’administration", "Google Drive connected to the admin", "Google Drive mit der Verwaltung verbunden", "Google Drive 已连接到管理后台"),
  google_drive_reconnected: labels("Google Drive reconnecté : compte remplacé", "Google Drive reconnected: account replaced", "Google Drive neu verbunden: Konto ersetzt", "Google Drive 已重新连接：账户已更换"),
  google_drive_oauth_mfa_required: labels("Connexion Google Drive refusée : code de sécurité admin non validé", "Google Drive connection refused: admin security code not confirmed", "Google-Drive-Verbindung abgelehnt: Admin-Sicherheitscode nicht bestätigt", "Google Drive 连接被拒绝：管理员安全码未验证"),
  admin_personal_data_exported: labels("Export des données d’une personne (RGPD)", "Export of a person’s data (GDPR)", "Export der Daten einer Person (DSGVO)", "导出个人数据（GDPR）"),
  admin_personal_data_erased: labels("Effacement des données d’une personne (RGPD)", "Erasure of a person’s data (GDPR)", "Löschung der Daten einer Person (DSGVO)", "删除个人数据（GDPR）"),
  admin_contact_message_deleted: labels("Suppression d’un message de contact", "Contact message deleted", "Kontaktnachricht gelöscht", "删除联系消息"),
  admin_medical_question_deleted: labels("Suppression d’une question santé", "Health question deleted", "Gesundheitsfrage gelöscht", "删除健康问题"),
  admin_appointment_email_corrected: labels("Correction de l’email d’un patient (rendez-vous)", "Patient email corrected (appointment)", "E-Mail-Adresse eines Patienten korrigiert (Termin)", "更正患者电子邮箱（预约）"),
  admin_blocked_period_added: labels("Période bloquée dans les disponibilités", "Period blocked in the availability", "Zeitraum in den Verfügbarkeiten gesperrt", "已在可预约时间中屏蔽一段时期"),
  admin_bookings_suspended: labels("Réservations en ligne suspendues", "Online bookings suspended", "Online-Buchungen ausgesetzt", "已暂停在线预约"),
  admin_bookings_resumed: labels("Réservations en ligne reprises", "Online bookings resumed", "Online-Buchungen wieder aufgenommen", "已恢复在线预约"),
  // The site itself.
  resend_quota_exceeded: labels("Quota d’envoi d’emails (Resend) épuisé : emails refusés", "Email sending quota (Resend) used up: emails refused", "E-Mail-Versandkontingent (Resend) aufgebraucht: E-Mails abgelehnt", "邮件发送配额（Resend）已用完：邮件被拒绝"),
  // The candidate portal.
  candidate_login: labels("Connexion candidat", "Candidate sign-in", "Kandidatenanmeldung", "候选人登录"),
  candidate_login_rate_limited: labels("Trop d’essais de connexion candidat — bloqué", "Too many candidate sign-in attempts — blocked", "Zu viele Anmeldeversuche von Kandidaten — blockiert", "候选人登录尝试次数过多——已拦截"),
  candidate_login_challenge_enabled: labels("Nombreux essais sur un compte candidat : vérification anti-robot désormais demandée", "Many attempts on a candidate account: anti-bot check now required", "Viele Versuche bei einem Kandidatenkonto: Bot-Prüfung jetzt erforderlich", "某候选人账户尝试次数过多：现需通过反机器人验证"),
  candidate_login_turnstile: labels("Vérification anti-robot refusée (connexion candidat)", "Anti-bot check refused (candidate sign-in)", "Bot-Prüfung abgelehnt (Kandidatenanmeldung)", "反机器人验证未通过（候选人登录）"),
  candidate_register_rate_limited: labels("Trop de créations de compte candidat — bloqué", "Too many candidate account creations — blocked", "Zu viele Registrierungen von Kandidatenkonten — blockiert", "候选人账户注册过多——已拦截"),
  candidate_register_turnstile: labels("Vérification anti-robot refusée (création de compte candidat)", "Anti-bot check refused (candidate account creation)", "Bot-Prüfung abgelehnt (Registrierung eines Kandidatenkontos)", "反机器人验证未通过（候选人账户注册）"),
  candidate_account_created: labels("Compte candidat créé", "Candidate account created", "Kandidatenkonto erstellt", "候选人账户已创建"),
  candidate_email_verified: labels("Email du candidat vérifié", "Candidate email verified", "E-Mail-Adresse des Kandidaten bestätigt", "候选人邮箱已验证"),
  candidate_verification_delivery: labels("Email de vérification envoyé au candidat", "Verification email sent to the candidate", "Bestätigungs-E-Mail an den Kandidaten gesendet", "验证邮件已发送给候选人"),
  candidate_verification_resent: labels("Email de vérification renvoyé au candidat", "Verification email sent again to the candidate", "Bestätigungs-E-Mail erneut an den Kandidaten gesendet", "验证邮件已重新发送给候选人"),
  candidate_verification_resend_rate_limited: labels("Trop de demandes de renvoi de l’email de vérification — bloqué", "Too many requests to resend the verification email — blocked", "Zu viele Anfragen zum erneuten Senden der Bestätigungs-E-Mail — blockiert", "重新发送验证邮件的请求过多——已拦截"),
  candidate_verification_resend_turnstile: labels("Vérification anti-robot refusée (renvoi de l’email de vérification)", "Anti-bot check refused (verification email resend)", "Bot-Prüfung abgelehnt (erneutes Senden der Bestätigungs-E-Mail)", "反机器人验证未通过（重新发送验证邮件）"),
  candidate_password_reset_requested: labels("Réinitialisation du mot de passe candidat demandée", "Candidate password reset requested", "Zurücksetzen eines Kandidatenpassworts angefordert", "已请求重置候选人密码"),
  candidate_password_reset_delivery: labels("Email de réinitialisation du mot de passe envoyé au candidat", "Password reset email sent to the candidate", "E-Mail zum Zurücksetzen des Passworts an den Kandidaten gesendet", "密码重置邮件已发送给候选人"),
  candidate_password_reset_rate_limited: labels("Trop de demandes de réinitialisation du mot de passe candidat — bloqué", "Too many candidate password reset requests — blocked", "Zu viele Anfragen zum Zurücksetzen von Kandidatenpasswörtern — blockiert", "候选人密码重置请求过多——已拦截"),
  candidate_password_reset_turnstile: labels("Vérification anti-robot refusée (réinitialisation du mot de passe candidat)", "Anti-bot check refused (candidate password reset)", "Bot-Prüfung abgelehnt (Zurücksetzen eines Kandidatenpassworts)", "反机器人验证未通过（候选人密码重置）"),
  candidate_session_revoked: labels("Le candidat a fermé une de ses sessions", "The candidate closed one of their sessions", "Der Kandidat hat eine seiner Sitzungen beendet", "候选人已关闭其一个会话"),
  candidate_sessions_revoked_all: labels("Le candidat a révoqué toutes ses sessions", "The candidate revoked all their sessions", "Der Kandidat hat alle seine Sitzungen widerrufen", "候选人已撤销其全部会话"),
  candidate_document_upload_protection: labels("Dépôt de document candidat refusé : trop d’envois ou vérification anti-robot échouée", "Candidate document upload refused: too many uploads or anti-bot check failed", "Hochladen eines Kandidatendokuments abgelehnt: zu viele Uploads oder Bot-Prüfung fehlgeschlagen", "候选人文件上传被拒绝：上传过多或反机器人验证未通过"),
  // The public forms and the online booking.
  public_contact_submit_rate_limit: labels("Trop de messages de contact avec un même email et un même réseau — bloqué", "Too many contact messages from one email and network — blocked", "Zu viele Kontaktnachrichten mit derselben E-Mail aus demselben Netzwerk — blockiert", "同一邮箱和网络发送的联系消息过多——已拦截"),
  public_contact_submit_ip_rate_limit: labels("Trop de messages de contact depuis un même réseau — bloqué", "Too many contact messages from one network — blocked", "Zu viele Kontaktnachrichten aus demselben Netzwerk — blockiert", "同一网络发送的联系消息过多——已拦截"),
  public_contact_submit_turnstile: labels("Vérification anti-robot refusée (formulaire de contact)", "Anti-bot check refused (contact form)", "Bot-Prüfung abgelehnt (Kontaktformular)", "反机器人验证未通过（联系表单）"),
  public_contact_submit_turnstile_unavailable: labels("Vérification anti-robot indisponible (formulaire de contact)", "Anti-bot check unavailable (contact form)", "Bot-Prüfung nicht verfügbar (Kontaktformular)", "反机器人验证暂不可用（联系表单）"),
  public_gdpr_submit_rate_limit: labels("Trop de demandes RGPD avec un même email et un même réseau — bloqué", "Too many GDPR requests from one email and network — blocked", "Zu viele DSGVO-Anfragen mit derselben E-Mail aus demselben Netzwerk — blockiert", "同一邮箱和网络提交的 GDPR 请求过多——已拦截"),
  public_gdpr_submit_ip_rate_limit: labels("Trop de demandes RGPD depuis un même réseau — bloqué", "Too many GDPR requests from one network — blocked", "Zu viele DSGVO-Anfragen aus demselben Netzwerk — blockiert", "同一网络提交的 GDPR 请求过多——已拦截"),
  public_gdpr_submit_turnstile: labels("Vérification anti-robot refusée (demande RGPD)", "Anti-bot check refused (GDPR request)", "Bot-Prüfung abgelehnt (DSGVO-Anfrage)", "反机器人验证未通过（GDPR 请求）"),
  public_gdpr_submit_turnstile_unavailable: labels("Vérification anti-robot indisponible (demande RGPD)", "Anti-bot check unavailable (GDPR request)", "Bot-Prüfung nicht verfügbar (DSGVO-Anfrage)", "反机器人验证暂不可用（GDPR 请求）"),
  gdpr_request_email_confirmed: labels("Adresse d’une demande RGPD confirmée par le lien de l’accusé de réception", "GDPR request address confirmed through the acknowledgement link", "Adresse einer DSGVO-Anfrage über den Link der Eingangsbestätigung bestätigt", "已通过确认函中的链接确认 GDPR 请求的邮箱地址"),
  public_booking_hold_created: labels("Créneau retenu par une réservation en ligne, en attente de paiement", "Slot held by an online booking, awaiting payment", "Termin durch Online-Buchung reserviert, Zahlung ausstehend", "在线预约暂留时段，待付款"),
  public_booking_challenge: labels("Vérification anti-robot refusée (réservation en ligne)", "Anti-bot check refused (online booking)", "Bot-Prüfung abgelehnt (Online-Buchung)", "反机器人验证未通过（在线预约）"),
  public_booking_challenge_unavailable: labels("Vérification anti-robot indisponible (réservation en ligne)", "Anti-bot check unavailable (online booking)", "Bot-Prüfung nicht verfügbar (Online-Buchung)", "反机器人验证暂不可用（在线预约）"),
  public_booking_create_ip_rate_limit: labels("Trop de réservations en ligne depuis un même réseau — bloqué", "Too many online bookings from one network — blocked", "Zu viele Online-Buchungen aus demselben Netzwerk — blockiert", "同一网络的在线预约过多——已拦截"),
  public_booking_create_email_rate_limit: labels("Trop de réservations en ligne avec un même email — bloqué", "Too many online bookings with one email — blocked", "Zu viele Online-Buchungen mit derselben E-Mail — blockiert", "同一邮箱的在线预约过多——已拦截"),
  public_booking_challenge_ip_rate_limit: labels("Trop de vérifications anti-robot refusées depuis un même réseau (réservation en ligne) — bloqué", "Too many anti-bot checks refused from one network (online booking) — blocked", "Zu viele abgelehnte Bot-Prüfungen aus demselben Netzwerk (Online-Buchung) — blockiert", "同一网络反机器人验证失败过多（在线预约）——已拦截"),
  public_booking_give_back_ip_rate_limit: labels("Trop de réservations non abouties depuis un même réseau : elles comptent de nouveau dans la limite", "Too many unfinished bookings from one network: they count against the limit again", "Zu viele nicht abgeschlossene Buchungen aus demselben Netzwerk: Sie zählen wieder zum Limit", "同一网络未完成的预约过多：将重新计入限额"),
  public_medical_question_submitted: labels("Question santé envoyée depuis le site", "Health question sent from the site", "Gesundheitsfrage über die Website gesendet", "已通过网站提交健康问题"),
  public_medical_question_protection: labels("Question santé refusée : trop d’envois ou vérification anti-robot échouée", "Health question refused: too many submissions or anti-bot check failed", "Gesundheitsfrage abgelehnt: zu viele Einsendungen oder Bot-Prüfung fehlgeschlagen", "健康问题被拒绝：提交过多或反机器人验证未通过"),
  public_client_brief_rate_limited: labels("Trop de demandes de mission (employeurs) — bloqué", "Too many mission requests (employers) — blocked", "Zu viele Auftragsanfragen (Arbeitgeber) — blockiert", "雇主职位需求提交过多——已拦截"),
  public_recruitment_apply_protection: labels("Candidature refusée : trop d’envois ou vérification anti-robot échouée", "Application refused: too many submissions or anti-bot check failed", "Bewerbung abgelehnt: zu viele Einsendungen oder Bot-Prüfung fehlgeschlagen", "求职申请被拒绝：提交过多或反机器人验证未通过"),
  public_recruitment_apply_duplicate_file: labels("Même candidature envoyée une seconde fois (déjà reçue)", "Same application sent again (already received)", "Dieselbe Bewerbung erneut gesendet (bereits erhalten)", "重复提交了同一份求职申请（已收到）"),
};

/** The sentences that depend on the outcome, keyed "category:outcome". */
export const SECURITY_EVENT_OUTCOME_LABELS: Record<string, Labels> = {
  "admin_mfa_verify:allowed": labels("Connexion admin validée par le code de sécurité", "Admin sign-in confirmed with the security code", "Admin-Anmeldung mit dem Sicherheitscode bestätigt", "管理员已通过安全码完成登录"),
  "admin_mfa_verify:failed": labels("Code de sécurité admin erroné ou expiré", "Wrong or expired admin security code", "Falscher oder abgelaufener Admin-Sicherheitscode", "管理员安全码错误或已过期"),
  "candidate_login:allowed": labels("Connexion candidat réussie", "Candidate signed in", "Kandidat angemeldet", "候选人登录成功"),
  "candidate_login:failed": labels("Connexion candidat refusée : email ou mot de passe erroné", "Candidate sign-in refused: wrong email or password", "Kandidatenanmeldung abgelehnt: falsche E-Mail-Adresse oder falsches Passwort", "候选人登录被拒绝：邮箱或密码错误"),
  "candidate_verification_delivery:failed": labels("Email de vérification au candidat non envoyé", "Verification email to the candidate not sent", "Bestätigungs-E-Mail an den Kandidaten nicht gesendet", "发给候选人的验证邮件未发送"),
  "candidate_verification_resent:failed": labels("Email de vérification au candidat non renvoyé", "Verification email to the candidate not sent again", "Bestätigungs-E-Mail an den Kandidaten nicht erneut gesendet", "未能重新发送给候选人验证邮件"),
  "candidate_password_reset_delivery:failed": labels("Email de réinitialisation du mot de passe au candidat non envoyé", "Password reset email to the candidate not sent", "E-Mail zum Zurücksetzen des Passworts an den Kandidaten nicht gesendet", "发给候选人的密码重置邮件未发送"),
};

/**
 * « Code de sécurité admin erroné ou expiré » for admin_mfa_verify refused;
 * a category no list names keeps its code, its underscores as spaces.
 */
export function securityEventLabel(category: string, outcome: string, language: SecurityEventLabelLanguage = "fr"): string {
  const sentence = SECURITY_EVENT_OUTCOME_LABELS[`${category}:${outcome}`] ?? SECURITY_EVENT_LABELS[category];
  return sentence?.[language] ?? category.replaceAll("_", " ");
}

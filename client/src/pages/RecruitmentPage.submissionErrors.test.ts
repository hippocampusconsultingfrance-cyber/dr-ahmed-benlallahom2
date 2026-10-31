import { describe, expect, it, vi } from "vitest";
import { sendStandardApplication, standardSubmissionErrorMessage } from "./RecruitmentPage";
import { vvipSubmissionErrorMessage } from "./VvipOffshorePage";

const languages = ["fr", "en", "de", "zh"] as const;
// Refusals of /api/recruitment/apply with their code (server/recruitmentApplyProtection.test.ts gets them from the real route),
// and the message each language shows for them.
const refusals = [
  {
    refusal: { error: "La vérification de sécurité doit être renouvelée avant l’envoi.", code: "recruitment_security_check_required" },
    en: "The security check must be renewed before sending.",
    de: "Die Sicherheitsprüfung muss vor dem Absenden erneuert werden.",
    zh: "发送前必须重新完成安全验证。",
  },
  {
    refusal: { error: "Trop de tentatives ont été effectuées. Patientez une heure avant de réessayer.", code: "recruitment_rate_limited" },
    en: "Too many attempts have been made. Wait one hour before trying again.",
    de: "Es wurden zu viele Versuche unternommen. Warten Sie eine Stunde, bevor Sie es erneut versuchen.",
    zh: "尝试次数过多。请等待一小时后再试。",
  },
  {
    refusal: { error: "Les informations de candidature sont invalides.", code: "recruitment_application_invalid" },
    en: "The application details are invalid.",
    de: "Die Bewerbungsangaben sind ungültig.",
    zh: "申请信息无效。",
  },
  {
    refusal: { error: "Vous pouvez sélectionner jusqu’à 18 pays ciblés.", code: "recruitment_target_countries_too_many" },
    en: "Too many target countries are selected. Remove some and try again.",
    de: "Es sind zu viele Zielländer ausgewählt. Entfernen Sie einige und versuchen Sie es erneut.",
    zh: "所选目标国家过多。请删除部分后重试。",
  },
  // Refused on reception (server/recruitmentApplyUpload.test.ts), before the content checks.
  {
    refusal: { error: "Le CV ne doit pas dépasser 4 Mo. Compressez-le ou enregistrez-le en PDF, puis réessayez.", code: "recruitment_cv_too_large" },
    en: "The CV must not exceed 4 MB. Compress it or save it as a PDF, then try again.",
    de: "Der Lebenslauf darf höchstens 4 MB groß sein. Komprimieren Sie ihn oder speichern Sie ihn als PDF und versuchen Sie es erneut.",
    zh: "简历不得超过 4 MB。请压缩或另存为 PDF 后重试。",
  },
  {
    refusal: { error: "Format de CV non accepté. Utilisez un PDF ou un DOCX (le format Word ancien .doc n’est plus accepté).", code: "recruitment_cv_format_refused" },
    en: "CV format not accepted. Use a PDF or a DOCX (the legacy Word .doc format is no longer accepted).",
    de: "CV-Format nicht akzeptiert. Verwenden Sie ein PDF oder DOCX (das alte Word-Format .doc wird nicht mehr akzeptiert).",
    zh: "不接受该简历格式。请使用 PDF 或 DOCX（不再接受旧版 Word .doc 格式）。",
  },
  {
    refusal: { error: "Le CV est requis.", code: "recruitment_cv_required" },
    en: "The CV is required.",
    de: "Der Lebenslauf ist erforderlich.",
    zh: "必须提供简历。",
  },
  {
    refusal: { error: "Le service de candidature est temporairement indisponible.", code: "recruitment_service_unavailable" },
    en: "The application service is temporarily unavailable.",
    de: "Der Bewerbungsdienst ist vorübergehend nicht verfügbar.",
    zh: "申请服务暂时不可用。",
  },
  {
    refusal: { error: "Le CV ne doit pas dépasser 25 pages.", code: "cv_validation_pdf_page_limit_exceeded" },
    en: "The CV must not exceed 25 pages.",
    de: "Der Lebenslauf darf höchstens 25 Seiten umfassen.",
    zh: "简历不得超过 25 页。",
  },
  {
    refusal: { error: "Le CV contient des macros, du JavaScript, une commande de lancement ou des fichiers intégrés. Réenregistrez votre CV en DOCX ou imprimez-le en PDF depuis votre navigateur, puis réessayez.", code: "cv_validation_pdf_active_content" },
    en: "The CV contains macros, JavaScript, a launch command or embedded files. Save your CV again as a DOCX or print it to PDF from your browser, then try again.",
    de: "Der Lebenslauf enthält Makros, JavaScript, einen Startbefehl oder eingebettete Dateien. Speichern Sie Ihren Lebenslauf erneut als DOCX oder drucken Sie ihn in Ihrem Browser als PDF und versuchen Sie es dann erneut.",
    zh: "简历包含宏、JavaScript、启动命令或嵌入文件。请将简历重新另存为 DOCX，或在浏览器中打印为 PDF，然后重试。",
  },
];
const serviceFailure = {
  fr: "Le service de candidature est momentanément indisponible. Réessayez dans quelques instants.",
  en: "The application service is momentarily unavailable. Please try again in a few moments.",
  de: "Der Bewerbungsdienst ist momentan nicht verfügbar. Bitte versuchen Sie es in wenigen Augenblicken erneut.",
  zh: "申请服务暂时无法使用。请稍后再试。",
};

describe("formulaire de candidature standard — refus du serveur traduits (REC-03)", () => {
  it.each(languages)("affiche pour chaque code le motif du serveur en français, sa traduction sinon, comme la page VVIP (%s)", language => {
    for (const { refusal, ...translations } of refusals) {
      const expected = language === "fr" ? refusal.error : translations[language];
      expect(standardSubmissionErrorMessage(refusal, language, 400), refusal.code).toBe(expected);
      expect(vvipSubmissionErrorMessage(refusal, language, 400), refusal.code).toBe(expected);
    }
  });

  it("ne montre plus le texte français du serveur sur la page anglaise", () => {
    // CV refused before the content checks (no code): the page's own CV hint in English.
    expect(standardSubmissionErrorMessage({ error: "Le CV ne doit pas dépasser 4 Mo. Compressez-le ou enregistrez-le en PDF, puis réessayez." }, "en", 400))
      .toBe("Please attach a PDF or DOCX CV up to 4 MB (the legacy Word .doc format is not accepted).");
    expect(standardSubmissionErrorMessage({ error: "Unexpected end of form" }, "en", 400)).toBe("Your application could not be sent. Check the information and try again.");
  });
});

describe("formulaire de candidature standard — envoi (REC-03)", () => {
  const body = new FormData();
  const answer = (status: number, payload?: unknown) => vi.fn(async () => new Response(payload === undefined ? "<html>Bad Gateway</html>" : JSON.stringify(payload), { status }));

  it("rend le numéro de suivi du serveur", async () => {
    const send = answer(201, { success: true, trackingId: "CV0123456789ABCDEF" });
    await expect(sendStandardApplication(body, "en", send)).resolves.toEqual({ trackingId: "CV0123456789ABCDEF" });
    expect(send).toHaveBeenCalledWith("/api/recruitment/apply", { method: "POST", body });
  });

  it("traduit un refus du serveur et ne confirme jamais sans numéro de suivi", async () => {
    await expect(sendStandardApplication(body, "en", answer(400, refusals[1].refusal))).resolves.toEqual({ error: refusals[1].en });
    await expect(sendStandardApplication(body, "en", answer(201, { success: true }))).resolves.toEqual({ error: "Your application could not be sent. Check the information and try again." });
  });

  it.each(languages)("demande de réessayer, sans le texte du navigateur, quand la requête n’aboutit pas ou que la passerelle échoue (%s)", async language => {
    const offline = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await expect(sendStandardApplication(body, language, offline)).resolves.toEqual({ error: serviceFailure[language] });
    await expect(sendStandardApplication(body, language, answer(502))).resolves.toEqual({ error: serviceFailure[language] });
  });
});

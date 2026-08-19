import { useState } from "react";
import { BrainCircuit, ClipboardList, Download, FileSearch, Loader2, Mail, RefreshCw, Sparkles, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Candidate360Dialog from "./Candidate360Dialog";

const statusOptions = ["new", "reviewing", "shortlisted", "placed", "rejected", "archived"] as const;

type Status = (typeof statusOptions)[number];
type RecruitmentEmailTemplate = "profile_interest" | "additional_information";

export const recruitmentTableCopy = {
  fr: { loadError: "Impossible de charger les candidatures.", updated: "Candidature mise à jour", reanalyzeQueued: "Analyse IA mise en file : le profil sera actualisé automatiquement", reanalyzeFailed: (count: number) => `${count} analyse${count > 1 ? "s" : ""} IA mise${count > 1 ? "s" : ""} en reprise contrôlée`, header: "Candidatures internationales", intro: "Les CV sont conservés dans un stockage privé. L’analyse IA fournit une aide à la revue humaine et ne prend aucune décision automatique.", retryFailures: "Reprendre les échecs IA", refresh: "Actualiser", filters: { status: "Statut", allStatuses: "Tous les statuts", specialty: "Spécialité", specialtyPlaceholder: "Ex. anesthésie", country: "Pays ciblé", countryPlaceholder: "Ex. Allemagne", language: "Langue", languagePlaceholder: "Ex. anglais", certification: "Certification", certificationPlaceholder: "Ex. ACLS, ATLS", score: "Score IA minimum", scorePlaceholder: "Ex. 80", profile: "Profil de matching", allProfiles: "Tous les profils" }, statuses: { new: "Nouvelle", reviewing: "En revue", shortlisted: "Présélectionnée", placed: "Positionnée", rejected: "Refusée", archived: "Archivée" }, analysisStatuses: { queued: "Analyse en attente", extracting: "Extraction en cours", analyzing: "Analyse IA en cours", completed: "Analyse terminée", needs_review: "Revue humaine requise", failed: "Analyse à relancer" }, countriesUnspecified: "Pays non précisés", aiPending: "IA en attente", score: (value: number) => `Score IA ${value}/100`, statusFor: (name: string) => `Statut de ${name}`, loading: "Chargement des candidatures", empty: "Aucune candidature ne correspond aux filtres." },
  en: { loadError: "Unable to load applications.", updated: "Application updated", reanalyzeQueued: "AI analysis queued: the profile will be refreshed automatically", reanalyzeFailed: (count: number) => `${count} AI analysis${count > 1 ? "es" : ""} queued for controlled retry`, header: "International applications", intro: "CVs are stored privately. AI analysis supports human review and never makes an automated decision.", retryFailures: "Retry failed AI analyses", refresh: "Refresh", filters: { status: "Status", allStatuses: "All statuses", specialty: "Specialty", specialtyPlaceholder: "E.g. anaesthesia", country: "Target country", countryPlaceholder: "E.g. Germany", language: "Language", languagePlaceholder: "E.g. English", certification: "Certification", certificationPlaceholder: "E.g. ACLS, ATLS", score: "Minimum AI score", scorePlaceholder: "E.g. 80", profile: "Matching profile", allProfiles: "All profiles" }, statuses: { new: "New", reviewing: "Under review", shortlisted: "Shortlisted", placed: "Placed", rejected: "Rejected", archived: "Archived" }, analysisStatuses: { queued: "Analysis pending", extracting: "Extracting", analyzing: "AI analysis in progress", completed: "Analysis completed", needs_review: "Human review required", failed: "Analysis to retry" }, countriesUnspecified: "Countries not specified", aiPending: "AI pending", score: (value: number) => `AI score ${value}/100`, statusFor: (name: string) => `Status for ${name}`, loading: "Loading applications", empty: "No applications match the filters." },
  de: { loadError: "Bewerbungen können nicht geladen werden.", updated: "Bewerbung aktualisiert", reanalyzeQueued: "KI-Analyse wurde eingeplant: Das Profil wird automatisch aktualisiert", reanalyzeFailed: (count: number) => `${count} KI-Analyse${count === 1 ? "" : "n"} zur kontrollierten Wiederholung eingeplant`, header: "Internationale Bewerbungen", intro: "Lebensläufe werden privat gespeichert. Die KI-Analyse unterstützt die menschliche Prüfung und trifft niemals automatisierte Entscheidungen.", retryFailures: "Fehlgeschlagene KI-Analysen wiederholen", refresh: "Aktualisieren", filters: { status: "Status", allStatuses: "Alle Status", specialty: "Fachgebiet", specialtyPlaceholder: "z. B. Anästhesie", country: "Zielland", countryPlaceholder: "z. B. Deutschland", language: "Sprache", languagePlaceholder: "z. B. Englisch", certification: "Zertifizierung", certificationPlaceholder: "z. B. ACLS, ATLS", score: "Mindest-KI-Score", scorePlaceholder: "z. B. 80", profile: "Matching-Profil", allProfiles: "Alle Profile" }, statuses: { new: "Neu", reviewing: "In Prüfung", shortlisted: "Vorausgewählt", placed: "Vermittelt", rejected: "Abgelehnt", archived: "Archiviert" }, analysisStatuses: { queued: "Analyse ausstehend", extracting: "Extraktion läuft", analyzing: "KI-Analyse läuft", completed: "Analyse abgeschlossen", needs_review: "Menschliche Prüfung erforderlich", failed: "Analyse wiederholen" }, countriesUnspecified: "Länder nicht angegeben", aiPending: "KI ausstehend", score: (value: number) => `KI-Score ${value}/100`, statusFor: (name: string) => `Status für ${name}`, loading: "Bewerbungen werden geladen", empty: "Keine Bewerbungen entsprechen den Filtern." },
  zh: { loadError: "无法加载申请。", updated: "申请已更新", reanalyzeQueued: "AI 分析已排队：档案将自动更新", reanalyzeFailed: (count: number) => `${count} 个 AI 分析已加入受控重试队列`, header: "国际申请", intro: "简历存储在私有空间中。AI 分析仅辅助人工审核，绝不作出自动决定。", retryFailures: "重试失败的 AI 分析", refresh: "刷新", filters: { status: "状态", allStatuses: "全部状态", specialty: "专业", specialtyPlaceholder: "例如：麻醉", country: "目标国家", countryPlaceholder: "例如：德国", language: "语言", languagePlaceholder: "例如：英语", certification: "认证", certificationPlaceholder: "例如：ACLS、ATLS", score: "最低 AI 评分", scorePlaceholder: "例如：80", profile: "匹配档案", allProfiles: "全部档案" }, statuses: { new: "新申请", reviewing: "审核中", shortlisted: "已入围", placed: "已推荐", rejected: "已拒绝", archived: "已归档" }, analysisStatuses: { queued: "等待分析", extracting: "正在提取", analyzing: "AI 分析中", completed: "分析已完成", needs_review: "需要人工审核", failed: "需要重新分析" }, countriesUnspecified: "未注明国家", aiPending: "等待 AI", score: (value: number) => `AI 评分 ${value}/100`, statusFor: (name: string) => `${name} 的状态`, loading: "正在加载申请", empty: "没有申请符合筛选条件。" },
} as const;

export const recruitmentActionsCopy = {
  fr: { cv: "CV", candidate360: "Fiche 360°", reanalyze: "Relancer l’analyse", analyze: "Analyser le CV", offerConversation: "Proposer un échange", requestDocuments: "Demander un complément", erase: "Effacer RGPD", confirmErase: "Confirmer l’effacement définitif du dossier candidat et de ses résultats IA ?", note: "Note interne", emailTitle: "Composer un email candidat", individualMessage: (name: string) => `Message individuel à ${name}.`, emailPrompt: "Préparez un message individuel.", messageType: "Type de message", emailLanguage: "Langue d’envoi", french: "Français", english: "English", extraRequest: "Précisions à demander au candidat", extraPlaceholder: "Ex. Merci de transmettre votre attestation d’inscription à l’ordre, vos diplômes et vos disponibilités.", extraHelp: "Ce texte libre sera ajouté au message dans la langue choisie.", cancel: "Annuler", send: "Envoyer l’email", profileInterest: "Proposer un échange", additionalInformation: "Demander un complément" },
  en: { cv: "CV", candidate360: "360° profile", reanalyze: "Run analysis again", analyze: "Analyse CV", offerConversation: "Offer a conversation", requestDocuments: "Request additional information", erase: "GDPR erase", confirmErase: "Confirm permanent erasure of the candidate file and its AI results?", note: "Internal note", emailTitle: "Compose candidate email", individualMessage: (name: string) => `Individual message to ${name}.`, emailPrompt: "Prepare an individual message.", messageType: "Message type", emailLanguage: "Sending language", french: "French", english: "English", extraRequest: "Details to request from the candidate", extraPlaceholder: "E.g. please send your professional registration certificate, diplomas and availability.", extraHelp: "This free text will be added to the message in the chosen language.", cancel: "Cancel", send: "Send email", profileInterest: "Offer a conversation", additionalInformation: "Request additional information" },
  de: { cv: "Lebenslauf", candidate360: "360°-Profil", reanalyze: "Analyse erneut starten", analyze: "Lebenslauf analysieren", offerConversation: "Austausch anbieten", requestDocuments: "Zusätzliche Unterlagen anfordern", erase: "DSGVO-Löschung", confirmErase: "Die Bewerbungsakte und ihre KI-Ergebnisse dauerhaft löschen?", note: "Interne Notiz", emailTitle: "E-Mail an Kandidaten verfassen", individualMessage: (name: string) => `Individuelle Nachricht an ${name}.`, emailPrompt: "Bereiten Sie eine individuelle Nachricht vor.", messageType: "Nachrichtentyp", emailLanguage: "Versandsprache", french: "Französisch", english: "Englisch", extraRequest: "Beim Kandidaten anzufordernde Angaben", extraPlaceholder: "z. B. bitte senden Sie Ihre Berufszulassung, Diplome und Verfügbarkeit.", extraHelp: "Dieser freie Text wird in der gewählten Sprache in die Nachricht eingefügt.", cancel: "Abbrechen", send: "E-Mail senden", profileInterest: "Austausch anbieten", additionalInformation: "Zusätzliche Unterlagen anfordern" },
  zh: { cv: "简历", candidate360: "360° 档案", reanalyze: "重新分析", analyze: "分析简历", offerConversation: "邀请沟通", requestDocuments: "请求补充材料", erase: "隐私删除", confirmErase: "确认永久删除候选人档案及其 AI 分析结果？", note: "内部备注", emailTitle: "撰写候选人邮件", individualMessage: (name: string) => `发送给 ${name} 的个人邮件。`, emailPrompt: "请准备一封个人邮件。", messageType: "消息类型", emailLanguage: "发送语言", french: "法语", english: "英语", extraRequest: "向候选人请求的补充信息", extraPlaceholder: "例如：请发送您的执业注册证明、文凭和可入职时间。", extraHelp: "此自由文本将以所选语言添加到邮件中。", cancel: "取消", send: "发送邮件", profileInterest: "邀请沟通", additionalInformation: "请求补充材料" },
} as const;

export const recruitmentDetailsCopy = {
  fr: { email: "Email", phone: "Téléphone", languages: "Langues déclarées", experience: "Expérience déclarée", years: "ans", availability: "Disponibilité", mobility: "Mobilité", certifications: "Certifications", file: "Fichier", fileCheck: "Contrôle du fichier", fileStatuses: { accepted: "validé", pending: "en attente" }, received: "Reçu le", retention: "Conservation jusqu’au", pipeline: "Pipeline", attempt: "tentative", analysis: "Analyse", versionUnknown: "version non renseignée", extraction: "Extraction", pages: (count: number) => `${count} page${count > 1 ? "s" : ""}`, ocr: "OCR", confidence: "confiance", lastError: "Dernière erreur", message: "Message", intelligentReading: "Lecture intelligente du CV", humanReviewOnly: "Aide à la revue humaine · aucune décision automatique", extractedProfile: "Profil extrait", titleUnknown: "Titre non identifié", specialtiesUnknown: "Spécialités non identifiées", skills: "Compétences", skillsUnknown: "Compétences non identifiées", strengths: "Points forts", reviewPoints: "Points à vérifier", notProvided: "Non renseigné", scoreReason: "Justification du score", extractionQuality: "Qualité d’extraction", analyzedOn: "Analysé le", waitingAnalysis: "L’analyse sera disponible après extraction du texte. Les formats DOC historiques nécessitent une vérification manuelle." },
  en: { email: "Email", phone: "Phone", languages: "Declared languages", experience: "Declared experience", years: "years", availability: "Availability", mobility: "Mobility", certifications: "Certifications", file: "File", fileCheck: "File check", fileStatuses: { accepted: "validated", pending: "pending" }, received: "Received on", retention: "Retained until", pipeline: "Pipeline", attempt: "attempt", analysis: "Analysis", versionUnknown: "version not provided", extraction: "Extraction", pages: (count: number) => `${count} page${count > 1 ? "s" : ""}`, ocr: "OCR", confidence: "confidence", lastError: "Last error", message: "Message", intelligentReading: "Intelligent CV review", humanReviewOnly: "Support for human review · no automated decision", extractedProfile: "Extracted profile", titleUnknown: "Title not identified", specialtiesUnknown: "Specialties not identified", skills: "Skills", skillsUnknown: "Skills not identified", strengths: "Strengths", reviewPoints: "Points to review", notProvided: "Not provided", scoreReason: "Score rationale", extractionQuality: "Extraction quality", analyzedOn: "Analysed on", waitingAnalysis: "The analysis will be available after text extraction. Legacy DOC files require manual review." },
  de: { email: "E-Mail", phone: "Telefon", languages: "Angegebene Sprachen", experience: "Angegebene Erfahrung", years: "Jahre", availability: "Verfügbarkeit", mobility: "Mobilität", certifications: "Zertifikate", file: "Datei", fileCheck: "Dateiprüfung", fileStatuses: { accepted: "validiert", pending: "ausstehend" }, received: "Eingegangen am", retention: "Aufbewahrung bis", pipeline: "Pipeline", attempt: "Versuch", analysis: "Analyse", versionUnknown: "Version nicht angegeben", extraction: "Extraktion", pages: (count: number) => `${count} Seite${count === 1 ? "" : "n"}`, ocr: "OCR", confidence: "Konfidenz", lastError: "Letzter Fehler", message: "Nachricht", intelligentReading: "Intelligente Lebenslaufauswertung", humanReviewOnly: "Unterstützung der menschlichen Prüfung · keine automatisierte Entscheidung", extractedProfile: "Extrahiertes Profil", titleUnknown: "Titel nicht erkannt", specialtiesUnknown: "Fachgebiete nicht erkannt", skills: "Kompetenzen", skillsUnknown: "Kompetenzen nicht erkannt", strengths: "Stärken", reviewPoints: "Zu prüfende Punkte", notProvided: "Nicht angegeben", scoreReason: "Begründung der Bewertung", extractionQuality: "Extraktionsqualität", analyzedOn: "Analysiert am", waitingAnalysis: "Die Analyse wird nach der Textextraktion verfügbar sein. Ältere DOC-Dateien erfordern eine manuelle Prüfung." },
  zh: { email: "电子邮箱", phone: "电话", languages: "申报语言", experience: "申报经验", years: "年", availability: "可入职时间", mobility: "流动性", certifications: "认证", file: "文件", fileCheck: "文件检查", fileStatuses: { accepted: "已验证", pending: "待处理" }, received: "收到日期", retention: "保存至", pipeline: "处理流程", attempt: "次尝试", analysis: "分析", versionUnknown: "未注明版本", extraction: "提取", pages: (count: number) => `${count} 页`, ocr: "OCR", confidence: "置信度", lastError: "最近错误", message: "消息", intelligentReading: "智能简历解读", humanReviewOnly: "辅助人工审核 · 不作自动决定", extractedProfile: "提取的档案", titleUnknown: "未识别职位", specialtiesUnknown: "未识别专业", skills: "技能", skillsUnknown: "未识别技能", strengths: "优势", reviewPoints: "待核实事项", notProvided: "未提供", scoreReason: "评分依据", extractionQuality: "提取质量", analyzedOn: "分析日期", waitingAnalysis: "文本提取后将提供分析结果。旧版 DOC 文件需要人工核验。" },
} as const;

export const recruitmentMatchingCopy = {
  fr: { title: "Profils de matching", intro: "Les profils servent à prioriser la revue humaine ; ils ne décident jamais d’un recrutement.", name: "Nom du profil", country: "Pays", specialty: "Spécialité", score: "Score min.", save: "Enregistrer", languages: "Langues requises, séparées par virgule", skills: "Compétences requises, séparées par virgule", saved: "Profil de matching enregistré" },
  en: { title: "Matching profiles", intro: "Profiles help prioritise human review; they never decide on a hire.", name: "Profile name", country: "Country", specialty: "Specialty", score: "Minimum score", save: "Save", languages: "Required languages, separated by commas", skills: "Required skills, separated by commas", saved: "Matching profile saved" },
  de: { title: "Matching-Profile", intro: "Profile priorisieren die menschliche Prüfung; sie entscheiden niemals über eine Einstellung.", name: "Profilname", country: "Land", specialty: "Fachgebiet", score: "Mindestscore", save: "Speichern", languages: "Erforderliche Sprachen, durch Kommas getrennt", skills: "Erforderliche Kompetenzen, durch Kommas getrennt", saved: "Matching-Profil gespeichert" },
  zh: { title: "匹配档案", intro: "档案可帮助优先安排人工审核；它们绝不决定是否录用。", name: "档案名称", country: "国家", specialty: "专业", score: "最低评分", save: "保存", languages: "所需语言，以逗号分隔", skills: "所需技能，以逗号分隔", saved: "匹配档案已保存" },
} as const;

type ExtractedProfile = {
  professionalTitle?: string;
  specialties?: string[];
  skills?: string[];
  languages?: string[];
  countriesOfInterest?: string[];
  yearsExperience?: number | null;
  normalizedExperiences?: Array<{ role?: string; organization?: string; startDate?: string | null; endDate?: string | null; employmentType?: string; durationMonths?: number | null }>;
};

function parseJsonList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string | null): ExtractedProfile {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function formatBytes(value: number | null) {
  if (!value) return "—";
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function scoreTone(score: number | null) {
  if (score === null) return "border-border bg-muted/30 text-muted-foreground";
  if (score >= 75) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (score >= 50) return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300";
}

function analysisStatusLabel(status: string | null | undefined, labels: Record<string, string>) {
  return labels[status || ""] || labels.queued;
}

function analysisStatusTone(status: string | null | undefined) {
  if (status === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "needs_review") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "failed") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-primary/25 bg-primary/10 text-primary";
}

export default function RecruitmentTab() {
  const { language } = useLanguage();
  const copy = recruitmentTableCopy[language as keyof typeof recruitmentTableCopy] ?? recruitmentTableCopy.fr;
  const actions = recruitmentActionsCopy[language as keyof typeof recruitmentActionsCopy] ?? recruitmentActionsCopy.fr;
  const details = recruitmentDetailsCopy[language as keyof typeof recruitmentDetailsCopy] ?? recruitmentDetailsCopy.fr;
  const matching = recruitmentMatchingCopy[language as keyof typeof recruitmentMatchingCopy] ?? recruitmentMatchingCopy.fr;
  const locale = language === "zh" ? "zh-CN" : language === "de" ? "de-DE" : language === "en" ? "en-GB" : "fr-FR";
  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [countryFilter, setCountryFilter] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [certificationFilter, setCertificationFilter] = useState("");
  const [minimumScore, setMinimumScore] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [candidate360Id, setCandidate360Id] = useState<number | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileCountry, setProfileCountry] = useState("");
  const [profileSpecialty, setProfileSpecialty] = useState("");
  const [profileScore, setProfileScore] = useState("80");
  const [profileLanguages, setProfileLanguages] = useState("");
  const [profileSkills, setProfileSkills] = useState("");
  const [emailComposer, setEmailComposer] = useState<{ id: number; candidateName: string; template: RecruitmentEmailTemplate } | null>(null);
  const [emailLanguage, setEmailLanguage] = useState<"fr" | "en">("fr");
  const [customRequest, setCustomRequest] = useState("");
  const utils = trpc.useUtils();
  const profilesQuery = trpc.admin.recruitment.profiles.list.useQuery();

  const { data, isLoading, error, refetch } = trpc.admin.recruitment.list.useQuery({
    status: statusFilter || undefined,
    country: countryFilter.trim() || undefined,
    specialty: specialtyFilter.trim() || undefined,
    language: languageFilter.trim() || undefined,
    certification: certificationFilter.trim() || undefined,
    minimumScore: minimumScore ? Number(minimumScore) : undefined,
    profileId: selectedProfileId ? Number(selectedProfileId) : undefined,
  });

  const updateStatus = trpc.admin.recruitment.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(copy.updated);
      utils.admin.recruitment.list.invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const downloadCv = trpc.admin.recruitment.getDownloadUrl.useMutation({
    onSuccess: ({ url, fileName }) => {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = fileName;
      link.click();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const reanalyze = trpc.admin.recruitment.reanalyze.useMutation({
    onSuccess: () => {
      toast.success(copy.reanalyzeQueued);
      utils.admin.recruitment.list.invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const reanalyzeFailed = trpc.admin.recruitment.reanalyzeFailed.useMutation({
    onSuccess: ({ queued }) => {
      toast.success(copy.reanalyzeFailed(queued));
      utils.admin.recruitment.list.invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const createProfile = trpc.admin.recruitment.profiles.create.useMutation({
    onSuccess: () => {
      toast.success(matching.saved);
      setProfileName("");
      profilesQuery.refetch();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const sendTemplateEmail = trpc.admin.recruitment.sendTemplateEmail.useMutation({
    onSuccess: () => {
      toast.success("Email envoyé au candidat");
      setEmailComposer(null);
      setCustomRequest("");
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  const openEmailComposer = (id: number, candidateName: string, template: RecruitmentEmailTemplate) => {
    setEmailComposer({ id, candidateName, template });
    setEmailLanguage("fr");
    setCustomRequest("");
  };

  const eraseApplication = trpc.admin.recruitment.erase.useMutation({
    onSuccess: () => {
      toast.success("Dossier candidat effacé");
      setExpandedId(null);
      utils.admin.recruitment.list.invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  if (error) {
    return <div className="py-8 text-center text-red-400">{copy.loadError}</div>;
  }

  return (
    <section className="space-y-6" aria-labelledby="recruitment-heading">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Hippocampus Consulting</p>
          <h2 id="recruitment-heading" className="mt-2 text-2xl font-semibold text-foreground">{copy.header}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {copy.intro}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => reanalyzeFailed.mutate({ limit: 10 })} disabled={reanalyzeFailed.isPending}>
            <BrainCircuit className={`mr-2 h-4 w-4 ${reanalyzeFailed.isPending ? "animate-pulse" : ""}`} />
            {copy.retryFailures}
          </Button>
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            {copy.refresh}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card/60 p-4 md:grid-cols-3">
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{copy.filters.status}</span>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as Status | "")} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground">
            <option value="">{copy.filters.allStatuses}</option>
            {statusOptions.map(option => <option key={option} value={option}>{copy.statuses[option]}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{copy.filters.specialty}</span>
          <input value={specialtyFilter} onChange={event => setSpecialtyFilter(event.target.value)} placeholder={copy.filters.specialtyPlaceholder} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{copy.filters.country}</span>
          <input value={countryFilter} onChange={event => setCountryFilter(event.target.value)} placeholder={copy.filters.countryPlaceholder} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{copy.filters.language}</span>
          <input value={languageFilter} onChange={event => setLanguageFilter(event.target.value)} placeholder={copy.filters.languagePlaceholder} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{copy.filters.certification}</span>
          <input value={certificationFilter} onChange={event => setCertificationFilter(event.target.value)} placeholder={copy.filters.certificationPlaceholder} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{copy.filters.score}</span>
          <input type="number" min="0" max="100" value={minimumScore} onChange={event => setMinimumScore(event.target.value)} placeholder={copy.filters.scorePlaceholder} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{copy.filters.profile}</span>
          <select value={selectedProfileId} onChange={event => setSelectedProfileId(event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground">
            <option value="">{copy.filters.allProfiles}</option>
            {profilesQuery.data?.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.minimumScore}+</option>)}
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-foreground">{matching.title}</h3>
            <p className="text-xs text-muted-foreground">{matching.intro}</p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-6">
          <input value={profileName} onChange={event => setProfileName(event.target.value)} placeholder={matching.name} className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground md:col-span-2" />
          <input value={profileCountry} onChange={event => setProfileCountry(event.target.value)} placeholder={matching.country} className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground" />
          <input value={profileSpecialty} onChange={event => setProfileSpecialty(event.target.value)} placeholder={matching.specialty} className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground" />
          <input type="number" min="0" max="100" value={profileScore} onChange={event => setProfileScore(event.target.value)} placeholder={matching.score} className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground" />
          <Button disabled={!profileName.trim() || createProfile.isPending} onClick={() => createProfile.mutate({ name: profileName.trim(), targetCountry: profileCountry.trim() || undefined, specialty: profileSpecialty.trim() || undefined, minimumScore: Number(profileScore) || 0, requiredLanguages: profileLanguages.split(",").map(value => value.trim()).filter(Boolean), requiredSkills: profileSkills.split(",").map(value => value.trim()).filter(Boolean) })}>
            {createProfile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} {matching.save}
          </Button>
          <input value={profileLanguages} onChange={event => setProfileLanguages(event.target.value)} placeholder={matching.languages} className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground md:col-span-3" />
          <input value={profileSkills} onChange={event => setProfileSkills(event.target.value)} placeholder={matching.skills} className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground md:col-span-3" />
        </div>
      </div>

      {isLoading ? (
        <PublicContentSkeleton label={copy.loading} />
      ) : data?.items.length ? (
        <div className="space-y-3">
          {data.items.map(application => {
            const countries = parseJsonList(application.targetCountries);
            const languages = parseJsonList(application.languages);
            const strengths = parseJsonList(application.aiStrengths);
            const weaknesses = parseJsonList(application.aiWeaknesses);
            const extractionWarnings = parseJsonList(application.extractionWarnings);
            const extracted = parseJsonObject(application.aiExtractedSkills);
            const expanded = expandedId === application.id;
            return (
              <article key={application.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <button type="button" onClick={() => setExpandedId(expanded ? null : application.id)} className="min-w-0 text-left">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 rounded-full bg-primary/10 p-2 text-primary"><UserRound className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground">{application.firstName} {application.lastName}</h3>
                        <p className="text-sm text-muted-foreground">{application.specialty} · {application.trackingId}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{countries.join(", ") || copy.countriesUnspecified}</p>
                      </div>
                    </div>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${scoreTone(application.aiScore)}`}>
                      {application.aiScore === null ? copy.aiPending : copy.score(application.aiScore)}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${analysisStatusTone(application.analysisStatus)}`}>
                      {analysisStatusLabel(application.analysisStatus, copy.analysisStatuses)}
                    </span>
                    <select aria-label={copy.statusFor(`${application.firstName} ${application.lastName}`)} value={application.status} disabled={updateStatus.isPending} onChange={event => updateStatus.mutate({ id: application.id, status: event.target.value as Status })} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">
                      {statusOptions.map(option => <option key={option} value={option}>{copy.statuses[option]}</option>)}
                    </select>
                          <Button size="sm" variant="outline" onClick={() => downloadCv.mutate({ id: application.id })} disabled={downloadCv.isPending}>
                            <Download className="mr-2 h-4 w-4" /> {actions.cv}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setCandidate360Id(application.id)}>
                            <ClipboardList className="mr-2 h-4 w-4" /> {actions.candidate360}
                          </Button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 grid gap-4 border-t border-border pt-4 text-sm md:grid-cols-2">
                    <div className="space-y-1 text-muted-foreground">
                      <p><strong className="text-foreground">{details.email} :</strong> {application.email}</p>
                      <p><strong className="text-foreground">{details.phone} :</strong> {application.phone || "—"}</p>
                      <p><strong className="text-foreground">{details.languages} :</strong> {languages.join(", ") || "—"}</p>
                      <p><strong className="text-foreground">{details.experience} :</strong> {application.yearsExperience ?? "—"} {details.years}</p>
                      <p><strong className="text-foreground">{details.availability} :</strong> {application.availability || "—"}</p>
                      <p><strong className="text-foreground">{details.mobility} :</strong> {application.mobility || "—"}</p>
                      <p><strong className="text-foreground">{details.certifications} :</strong> {application.certifications || "—"}</p>
                    </div>
                    <div className="space-y-1 text-muted-foreground">
                      <p><strong className="text-foreground">{details.file} :</strong> {application.cvOriginalName} ({formatBytes(application.cvSizeBytes)})</p>
                      <p><strong className="text-foreground">{details.fileCheck} :</strong> {application.fileValidationStatus === "accepted" ? details.fileStatuses.accepted : application.fileValidationStatus || details.fileStatuses.pending}{application.fileSecurityScanVersion ? ` · ${application.fileSecurityScanVersion}` : ""}</p>
                      <p><strong className="text-foreground">{details.received} :</strong> {new Date(application.createdAt).toLocaleString(locale, { timeZone: "Europe/Paris" })}</p>
                      <p><strong className="text-foreground">{details.retention} :</strong> {application.retentionUntil ? new Date(application.retentionUntil).toLocaleDateString(locale, { timeZone: "Europe/Paris" }) : "—"}</p>
                      <p><strong className="text-foreground">{details.pipeline} :</strong> {analysisStatusLabel(application.analysisStatus, copy.analysisStatuses)} · {details.attempt} {application.analysisAttempts ?? 0}</p>
                      {application.analysisModel && <p><strong className="text-foreground">{details.analysis} :</strong> {application.analysisModel} · {application.analysisPromptVersion || details.versionUnknown}</p>}
                      {application.extractionMethod && <p><strong className="text-foreground">{details.extraction} :</strong> {application.extractionMethod}{application.extractionTotalPages ? ` · ${details.pages(application.extractionTotalPages)}` : ""}</p>}
                      {application.ocrModelVersion && <p><strong className="text-foreground">{details.ocr} :</strong> {application.ocrModelVersion}{application.ocrConfidence !== null ? ` · ${details.confidence} ${application.ocrConfidence}%` : ""}</p>}
                      {application.analysisLastError && <p className="text-destructive"><strong>{details.lastError} :</strong> {application.analysisLastError}</p>}
                      {application.message && <p className="pt-2"><strong className="text-foreground">{details.message} :</strong> {application.message}</p>}
                    </div>

                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 md:col-span-2">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="rounded-lg bg-primary/10 p-2 text-primary"><BrainCircuit className="h-5 w-5" /></span>
                          <div>
                            <h4 className="font-semibold text-foreground">{details.intelligentReading}</h4>
                            <p className="text-xs text-muted-foreground">{details.humanReviewOnly}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => reanalyze.mutate({ id: application.id })} disabled={reanalyze.isPending || eraseApplication.isPending}>
                            {reanalyze.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                            {application.aiAnalyzedAt ? actions.reanalyze : actions.analyze}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEmailComposer(application.id, `${application.firstName} ${application.lastName}`, "profile_interest")} disabled={sendTemplateEmail.isPending || eraseApplication.isPending || reanalyze.isPending}>
                            <Mail className="mr-2 h-4 w-4" /> {actions.offerConversation}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEmailComposer(application.id, `${application.firstName} ${application.lastName}`, "additional_information")} disabled={sendTemplateEmail.isPending || eraseApplication.isPending || reanalyze.isPending}>
                            <Mail className="mr-2 h-4 w-4" /> {actions.requestDocuments}
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => { if (window.confirm(actions.confirmErase)) eraseApplication.mutate({ id: application.id }); }} disabled={eraseApplication.isPending || reanalyze.isPending}>
                            {eraseApplication.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            {actions.erase}
                          </Button>
                        </div>
                      </div>

                      {application.aiSummary ? (
                        <div className="mt-4 space-y-4">
                          <p className="leading-6 text-foreground/90">{application.aiSummary}</p>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{details.extractedProfile}</p>
                              <p className="text-foreground">{extracted.professionalTitle || details.titleUnknown}</p>
                              <p className="text-muted-foreground">{extracted.specialties?.join(", ") || details.specialtiesUnknown}</p>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{details.skills}</p>
                              <p className="text-foreground">{extracted.skills?.join(", ") || details.skillsUnknown}</p>
                            </div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{details.strengths}</p>
                              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{strengths.length ? strengths.map(item => <li key={item}>{item}</li>) : <li>{details.notProvided}</li>}</ul>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{details.reviewPoints}</p>
                              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{weaknesses.length ? weaknesses.map(item => <li key={item}>{item}</li>) : <li>{details.notProvided}</li>}</ul>
                            </div>
                          </div>
                          {application.aiMatchReasoning && <p className="border-t border-primary/10 pt-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">{details.scoreReason} :</strong> {application.aiMatchReasoning}</p>}
                          {extractionWarnings.length > 0 && <p className="border-t border-primary/10 pt-3 text-xs leading-5 text-amber-700 dark:text-amber-300"><strong>{details.extractionQuality} :</strong> {extractionWarnings.join(" · ")}</p>}
                          {application.aiAnalyzedAt && <p className="text-[11px] text-muted-foreground">{details.analyzedOn} {new Date(application.aiAnalyzedAt).toLocaleString(locale, { timeZone: "Europe/Paris" })}</p>}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-muted-foreground">{details.waitingAnalysis}</p>
                      )}
                    </div>

                    <label className="space-y-1 text-sm text-muted-foreground md:col-span-2">
                      <span>{actions.note}</span>
                      <textarea defaultValue={application.adminNotes ?? ""} onBlur={event => { const value = event.target.value.trim(); if (value !== (application.adminNotes ?? "")) updateStatus.mutate({ id: application.id, status: application.status as Status, adminNotes: value }); }} className="min-h-20 w-full rounded-md border border-border bg-background p-3 text-foreground" maxLength={5000} />
                    </label>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <FileSearch className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
          {copy.empty}
        </div>
      )}

      <Dialog open={Boolean(emailComposer)} onOpenChange={open => { if (!open && !sendTemplateEmail.isPending) setEmailComposer(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{actions.emailTitle}</DialogTitle>
            <DialogDescription>
              {emailComposer ? actions.individualMessage(emailComposer.candidateName) : actions.emailPrompt}
            </DialogDescription>
          </DialogHeader>
          {emailComposer && (
            <div className="space-y-4 py-2">
              <label className="block space-y-1 text-sm text-muted-foreground">
                <span>{actions.messageType}</span>
                <select value={emailComposer.template} onChange={event => setEmailComposer(current => current ? { ...current, template: event.target.value as RecruitmentEmailTemplate } : current)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground">
                  <option value="profile_interest">{actions.profileInterest}</option>
                  <option value="additional_information">{actions.additionalInformation}</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm text-muted-foreground">
                <span>{actions.emailLanguage}</span>
                <select value={emailLanguage} onChange={event => setEmailLanguage(event.target.value as "fr" | "en")} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground">
                  <option value="fr">{actions.french}</option>
                  <option value="en">{actions.english}</option>
                </select>
              </label>
              {emailComposer.template === "additional_information" && (
                <label className="block space-y-1 text-sm text-muted-foreground">
                  <span>{actions.extraRequest}</span>
                  <textarea value={customRequest} onChange={event => setCustomRequest(event.target.value)} maxLength={3000} placeholder={actions.extraPlaceholder} className="min-h-32 w-full rounded-md border border-border bg-background p-3 text-foreground placeholder:text-muted-foreground" />
                  <span className="text-xs">{actions.extraHelp}</span>
                </label>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailComposer(null)} disabled={sendTemplateEmail.isPending}>{actions.cancel}</Button>
            <Button disabled={!emailComposer || sendTemplateEmail.isPending} onClick={() => emailComposer && sendTemplateEmail.mutate({ id: emailComposer.id, template: emailComposer.template, language: emailLanguage, customRequest: emailComposer.template === "additional_information" ? customRequest.trim() || undefined : undefined })}>
              {sendTemplateEmail.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              {actions.send}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Candidate360Dialog applicationId={candidate360Id} onOpenChange={open => { if (!open) setCandidate360Id(null); }} />
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3, Eye, Loader2, Mail, Send, ShieldCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { getRecruitmentCampaignTemplate, RECRUITMENT_CAMPAIGN_TEMPLATES, type RecruitmentCampaignTemplateId } from "./recruitmentCampaignTemplates";
import { deliveryRateLabel } from "./campaignDeliveryMetrics";
import { useLanguage } from "@/contexts/LanguageContext";

type MailingTabProps = {
  initialSelectedIds: number[];
};

type AudienceMode = "selected" | "all_eligible" | "filtered";

const mailingCopy = {
  fr: { title: "Mailing recrutement", intro: "Diffusez une offre uniquement à des profils ayant explicitement accepté les communications de recrutement. L’envoi est journalisé candidat par candidat.", statuses: { draft: "Brouillon", sending: "Envoi en cours", sent: "Envoyée", partially_sent: "Partiellement envoyée", failed: "Échec d’envoi" }, campaignName: "Nom interne de la campagne", campaignNamePlaceholder: "Ex. Anesthésistes – Allemagne 2026", emailLanguage: "Langue de l’email", template: "Modèle d’offre réutilisable", templatePlaceholder: "Choisir un modèle (facultatif)", templateHelp: "Le modèle préremplit l’offre. Vérifiez et complétez les éléments entre crochets avant envoi.", emailSubject: "Objet de l’email", emailSubjectPlaceholder: "Ex. Opportunité médicale internationale", offerMessage: "Message de l’offre", offerMessagePlaceholder: "Présentez la mission, la localisation, les critères et le moyen de répondre. Ne transmettez aucune donnée de patient.", characters: "caractères", audience: "Audience", selectedProfiles: "Profils sélectionnés", allEligible: "Tout le vivier éligible", filteredPool: "Vivier filtré", noSelected: "Aucun profil sélectionné. Retournez dans le Vivier pour choisir les destinataires.", specialty: "Spécialité", specialtyPlaceholder: "Ex. infirmier", country: "Pays", countryPlaceholder: "Ex. Canada", minimumScore: "Score IA minimum", scorePlaceholder: "Ex. 75", preview: "Prévisualisation", previewHelp: "La liste est recalculée côté serveur selon le consentement et les filtres actifs.", eligibleRecipients: "destinataire(s) éligible(s)", scoreUnavailable: "score indisponible", otherProfiles: "autre(s) profil(s)", reviewBeforeSending: "Vérifier avant envoi", history: "Historique des campagnes", historyLoading: "Chargement de l’historique des campagnes", recipients: "destinataire(s)", createdOn: "Créée le", delivered: "Distribués", opened: "Ouverts", delayed: "Différés", errors: "Erreurs / suppressions", deliveryNotice: "Les ouvertures sont fournies par Resend à titre indicatif : certains clients de messagerie peuvent les limiter ou les fausser. Les adresses en bounce, plainte ou suppression restent exclues des campagnes suivantes.", noCampaign: "Aucune campagne n’a encore été enregistrée.", confirmTitle: "Confirmer l’envoi de la campagne", confirmDescription: "Vous allez adresser cette campagne uniquement à des profils ayant consenti aux communications de recrutement. Chaque tentative sera conservée dans l’historique.", consentNotice: "Aucun destinataire sans consentement marketing ne sera contacté.", returnToEditing: "Revenir à l’édition", sending: "Envoi…", confirmSending: "Confirmer l’envoi", campaignCompleted: "Campagne terminée" },
  en: { title: "Recruitment mailing", intro: "Send an offer only to profiles that have explicitly accepted recruitment communications. Each delivery is logged candidate by candidate.", statuses: { draft: "Draft", sending: "Sending", sent: "Sent", partially_sent: "Partially sent", failed: "Sending failed" }, campaignName: "Internal campaign name", campaignNamePlaceholder: "E.g. Anaesthetists – Germany 2026", emailLanguage: "Email language", template: "Reusable offer template", templatePlaceholder: "Choose a template (optional)", templateHelp: "The template pre-fills the offer. Review and complete the elements in brackets before sending.", emailSubject: "Email subject", emailSubjectPlaceholder: "E.g. International medical opportunity", offerMessage: "Offer message", offerMessagePlaceholder: "Describe the assignment, location, criteria and response method. Do not include any patient data.", characters: "characters", audience: "Audience", selectedProfiles: "Selected profiles", allEligible: "Entire eligible pool", filteredPool: "Filtered pool", noSelected: "No profile is selected. Return to the Talent Pool to choose recipients.", specialty: "Specialty", specialtyPlaceholder: "E.g. nurse", country: "Country", countryPlaceholder: "E.g. Canada", minimumScore: "Minimum AI score", scorePlaceholder: "E.g. 75", preview: "Preview", previewHelp: "The list is recalculated server-side according to consent and active filters.", eligibleRecipients: "eligible recipient(s)", scoreUnavailable: "score unavailable", otherProfiles: "other profile(s)", reviewBeforeSending: "Review before sending", history: "Campaign history", historyLoading: "Loading campaign history", recipients: "recipient(s)", createdOn: "Created on", delivered: "Delivered", opened: "Opened", delayed: "Delayed", errors: "Errors / suppressions", deliveryNotice: "Open events are supplied by Resend as an indication: some email clients may limit or distort them. Addresses with a bounce, complaint or suppression remain excluded from future campaigns.", noCampaign: "No campaign has been recorded yet.", confirmTitle: "Confirm campaign sending", confirmDescription: "This campaign will only be sent to profiles that have consented to recruitment communications. Each attempt will be retained in the history.", consentNotice: "No recipient without marketing consent will be contacted.", returnToEditing: "Return to editing", sending: "Sending…", confirmSending: "Confirm sending", campaignCompleted: "Campaign completed" },
  de: { title: "Recruiting-Mailing", intro: "Versenden Sie Angebote nur an Profile, die Recruiting-Kommunikation ausdrücklich akzeptiert haben. Jede Zustellung wird pro Kandidat protokolliert.", statuses: { draft: "Entwurf", sending: "Wird gesendet", sent: "Gesendet", partially_sent: "Teilweise gesendet", failed: "Versand fehlgeschlagen" }, campaignName: "Interner Kampagnenname", campaignNamePlaceholder: "z. B. Anästhesisten – Deutschland 2026", emailLanguage: "E-Mail-Sprache", template: "Wiederverwendbare Angebotsvorlage", templatePlaceholder: "Vorlage wählen (optional)", templateHelp: "Die Vorlage füllt das Angebot vor. Prüfen und ergänzen Sie die Elemente in Klammern vor dem Versand.", emailSubject: "E-Mail-Betreff", emailSubjectPlaceholder: "z. B. Internationale medizinische Gelegenheit", offerMessage: "Nachricht zum Angebot", offerMessagePlaceholder: "Beschreiben Sie Auftrag, Ort, Kriterien und Antwortweg. Übermitteln Sie keine Patientendaten.", characters: "Zeichen", audience: "Zielgruppe", selectedProfiles: "Ausgewählte Profile", allEligible: "Gesamter berechtigter Pool", filteredPool: "Gefilterter Pool", noSelected: "Kein Profil ausgewählt. Kehren Sie zum Talentpool zurück, um Empfänger auszuwählen.", specialty: "Fachgebiet", specialtyPlaceholder: "z. B. Pflegekraft", country: "Land", countryPlaceholder: "z. B. Kanada", minimumScore: "Mindest-KI-Score", scorePlaceholder: "z. B. 75", preview: "Vorschau", previewHelp: "Die Liste wird serverseitig anhand von Einwilligung und aktiven Filtern neu berechnet.", eligibleRecipients: "berechtigte Empfänger", scoreUnavailable: "Score nicht verfügbar", otherProfiles: "weitere Profile", reviewBeforeSending: "Vor Versand prüfen", history: "Kampagnenverlauf", historyLoading: "Kampagnenverlauf wird geladen", recipients: "Empfänger", createdOn: "Erstellt am", delivered: "Zugestellt", opened: "Geöffnet", delayed: "Verzögert", errors: "Fehler / Unterdrückungen", deliveryNotice: "Öffnungen werden von Resend nur indikativ bereitgestellt: Einige E-Mail-Clients können sie begrenzen oder verfälschen. Adressen mit Bounce, Beschwerde oder Unterdrückung bleiben von künftigen Kampagnen ausgeschlossen.", noCampaign: "Noch keine Kampagne erfasst.", confirmTitle: "Kampagnenversand bestätigen", confirmDescription: "Diese Kampagne wird nur an Profile gesendet, die Recruiting-Kommunikation zugestimmt haben. Jeder Versuch wird im Verlauf gespeichert.", consentNotice: "Kein Empfänger ohne Marketing-Einwilligung wird kontaktiert.", returnToEditing: "Zur Bearbeitung zurückkehren", sending: "Wird gesendet…", confirmSending: "Versand bestätigen", campaignCompleted: "Kampagne abgeschlossen" },
  zh: { title: "招聘邮件", intro: "仅向明确同意接收招聘沟通的候选人发送职位信息。每次发送都会逐位候选人记录。", statuses: { draft: "草稿", sending: "发送中", sent: "已发送", partially_sent: "部分已发送", failed: "发送失败" }, campaignName: "活动内部名称", campaignNamePlaceholder: "例如：麻醉医师 – 德国 2026", emailLanguage: "邮件语言", template: "可复用职位模板", templatePlaceholder: "选择模板（可选）", templateHelp: "模板会预填职位内容。发送前请核查并补充方括号中的内容。", emailSubject: "邮件主题", emailSubjectPlaceholder: "例如：国际医疗职位机会", offerMessage: "职位信息", offerMessagePlaceholder: "请介绍任务、地点、条件及回复方式。请勿包含任何患者数据。", characters: "个字符", audience: "受众", selectedProfiles: "已选候选人", allEligible: "全部合格人才库", filteredPool: "筛选后人才库", noSelected: "尚未选择候选人。请返回人才库选择收件人。", specialty: "专业", specialtyPlaceholder: "例如：护士", country: "国家", countryPlaceholder: "例如：加拿大", minimumScore: "最低 AI 分数", scorePlaceholder: "例如：75", preview: "预览", previewHelp: "服务器会根据同意状态和当前筛选条件重新计算名单。", eligibleRecipients: "名合格收件人", scoreUnavailable: "分数不可用", otherProfiles: "其他候选人", reviewBeforeSending: "发送前核对", history: "活动历史", historyLoading: "正在加载活动历史", recipients: "名收件人", createdOn: "创建于", delivered: "已送达", opened: "已打开", delayed: "已延迟", errors: "错误 / 已抑制", deliveryNotice: "打开数据由 Resend 提供，仅供参考：部分邮件客户端可能限制或扭曲该数据。出现退信、投诉或抑制的地址将继续被排除在后续活动之外。", noCampaign: "尚未记录任何活动。", confirmTitle: "确认发送活动", confirmDescription: "此活动仅会发送给已同意接收招聘沟通的候选人。每次尝试都会保留在历史记录中。", consentNotice: "不会联系任何未同意营销沟通的收件人。", returnToEditing: "返回编辑", sending: "发送中…", confirmSending: "确认发送", campaignCompleted: "活动已完成" },
} as const;

function campaignStatusLabel(status: string, labels: Record<string, string>) {
  return labels[status] || status;
}

function campaignStatusTone(status: string) {
  if (status === "sent") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "partially_sent") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "failed") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-primary/25 bg-primary/10 text-primary";
}

export default function MailingTab({ initialSelectedIds }: MailingTabProps) {
  const { language: interfaceLanguage } = useLanguage();
  const copy = mailingCopy[interfaceLanguage as keyof typeof mailingCopy] ?? mailingCopy.fr;
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<AudienceMode>(initialSelectedIds.length ? "selected" : "all_eligible");
  const [selectedIds, setSelectedIds] = useState<number[]>(initialSelectedIds);
  const [specialty, setSpecialty] = useState("");
  const [country, setCountry] = useState("");
  const [minimumScore, setMinimumScore] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [templateId, setTemplateId] = useState<"" | RecruitmentCampaignTemplateId>("");
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  useEffect(() => {
    if (initialSelectedIds.length) {
      setSelectedIds(initialSelectedIds);
      setMode("selected");
    }
  }, [initialSelectedIds]);

  const audienceInput = useMemo(() => ({
    mode,
    selectedIds,
    specialty: specialty.trim() || undefined,
    country: country.trim() || undefined,
    minimumScore: minimumScore ? Number(minimumScore) : undefined,
  }), [mode, selectedIds, specialty, country, minimumScore]);
  const audienceQuery = trpc.admin.recruitment.campaigns.previewAudience.useQuery(audienceInput);
  const campaignsQuery = trpc.admin.recruitment.campaigns.list.useQuery();
  const sendCampaign = trpc.admin.recruitment.campaigns.send.useMutation({
    onSuccess: ({ total, sent, failed }) => {
      toast.success(`${copy.campaignCompleted}: ${sent}/${total}${failed ? `, ${failed}` : ""}.`);
      setConfirmationOpen(false);
      setTitle("");
      setSubject("");
      setBody("");
      utils.admin.recruitment.campaigns.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const canReview = Boolean(title.trim() && subject.trim() && body.trim() && (mode !== "selected" || selectedIds.length));
  const audience = audienceQuery.data || [];

  const send = () => {
    sendCampaign.mutate({ ...audienceInput, title: title.trim(), subject: subject.trim(), body: body.trim(), language, confirmed: true });
  };

  const applyTemplate = (id: string) => {
    setTemplateId(id as RecruitmentCampaignTemplateId);
    const template = getRecruitmentCampaignTemplate(id, language);
    if (!template) return;
    setTitle(template.title);
    setSubject(template.subject);
    setBody(template.body);
  };

  return (
    <section className="space-y-7" aria-labelledby="mailing-heading">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Hippocampus Consulting</p>
        <h2 id="mailing-heading" className="mt-2 text-2xl font-semibold text-foreground">{copy.title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{copy.intro}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>{copy.campaignName}</span>
              <input value={title} onChange={event => setTitle(event.target.value)} maxLength={180} placeholder={copy.campaignNamePlaceholder} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
            </label>
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>{copy.emailLanguage}</span>
              <select value={language} onChange={event => setLanguage(event.target.value as "fr" | "en")} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground">
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm text-muted-foreground">
              <span>{copy.template}</span>
            <select value={templateId} onChange={event => applyTemplate(event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground">
              <option value="">{copy.templatePlaceholder}</option>
              {RECRUITMENT_CAMPAIGN_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.label[language]}</option>)}
            </select>
            <span className="text-xs">{copy.templateHelp}</span>
          </label>
          <label className="block space-y-1 text-sm text-muted-foreground">
            <span>{copy.emailSubject}</span>
            <input value={subject} onChange={event => setSubject(event.target.value)} maxLength={255} placeholder={copy.emailSubjectPlaceholder} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
          </label>
          <label className="block space-y-1 text-sm text-muted-foreground">
            <span>{copy.offerMessage}</span>
            <textarea value={body} onChange={event => setBody(event.target.value)} maxLength={8000} placeholder={copy.offerMessagePlaceholder} className="min-h-56 w-full rounded-md border border-border bg-background p-3 text-foreground placeholder:text-muted-foreground" />
            <span className="text-xs">{body.length}/8000 {copy.characters}</span>
          </label>

          <fieldset className="space-y-3 border-t border-border pt-5">
            <legend className="font-semibold text-foreground">{copy.audience}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["selected", `${copy.selectedProfiles}${selectedIds.length ? ` (${selectedIds.length})` : ""}`],
                ["all_eligible", copy.allEligible],
                ["filtered", copy.filteredPool],
              ] as Array<[AudienceMode, string]>).map(([value, label]) => (
                <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${mode === value ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"}`}>
                  <input type="radio" name="audience-mode" value={value} checked={mode === value} onChange={() => setMode(value)} /> {label}
                </label>
              ))}
            </div>
            {mode === "selected" && !selectedIds.length && <p className="text-sm text-destructive">{copy.noSelected}</p>}
            {mode === "filtered" && (
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1 text-sm text-muted-foreground"><span>{copy.specialty}</span><input value={specialty} onChange={event => setSpecialty(event.target.value)} placeholder={copy.specialtyPlaceholder} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" /></label>
                <label className="space-y-1 text-sm text-muted-foreground"><span>{copy.country}</span><input value={country} onChange={event => setCountry(event.target.value)} placeholder={copy.countryPlaceholder} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" /></label>
                <label className="space-y-1 text-sm text-muted-foreground"><span>{copy.minimumScore}</span><input type="number" min="0" max="100" value={minimumScore} onChange={event => setMinimumScore(event.target.value)} placeholder={copy.scorePlaceholder} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" /></label>
              </div>
            )}
          </fieldset>
        </div>

        <aside className="h-fit rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><UsersRound className="h-5 w-5" /></span>
            <div>
              <h3 className="font-semibold text-foreground">{copy.preview}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{copy.previewHelp}</p>
            </div>
          </div>
          <p className="mt-5 text-3xl font-semibold text-foreground">{audienceQuery.isLoading ? "…" : audience.length}</p>
          <p className="text-sm text-muted-foreground">{audience.length} {copy.eligibleRecipients}</p>
          <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto text-sm text-muted-foreground">
            {audience.slice(0, 8).map(candidate => <li key={candidate.id}><strong className="text-foreground">{candidate.firstName} {candidate.lastName}</strong><span className="block text-xs">{candidate.specialty} · {candidate.aiScore === null ? copy.scoreUnavailable : `${candidate.aiScore}/100`}</span></li>)}
            {audience.length > 8 && <li className="text-xs">… {audience.length - 8} {copy.otherProfiles}.</li>}
          </ul>
          <Button className="mt-5 w-full" onClick={() => setConfirmationOpen(true)} disabled={!canReview || !audience.length || audienceQuery.isLoading}>
            <Send className="mr-2 h-4 w-4" /> {copy.reviewBeforeSending}
          </Button>
        </aside>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /><h3 className="font-semibold text-foreground">{copy.history}</h3></div>
        {campaignsQuery.isLoading ? <PublicContentSkeleton label={copy.historyLoading} /> : campaignsQuery.data?.length ? (
          <div className="space-y-3">
            {campaignsQuery.data.map(campaign => {
              const delivery = campaign.delivery;
              const delivered = Number(delivery.delivered || 0);
              const opened = Number(delivery.opened || 0);
              const failed = Number(delivery.failed || 0);
              const delayed = Number(delivery.delayed || 0);
              const total = Number(delivery.total || campaign.recipientCount || 0);
              return <article key={campaign.id} className="flex flex-col gap-4 rounded-xl border border-border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div><h4 className="font-semibold text-foreground">{campaign.title}</h4><p className="mt-1 text-sm text-muted-foreground">{campaign.subject} · {campaign.language.toUpperCase()} · {campaign.recipientCount} {copy.recipients}</p><p className="mt-1 text-xs text-muted-foreground">{copy.createdOn} {new Date(campaign.createdAt).toLocaleString(interfaceLanguage === "zh" ? "zh-CN" : interfaceLanguage === "de" ? "de-DE" : interfaceLanguage === "en" ? "en-GB" : "fr-FR", { timeZone: "Europe/Paris" })}</p></div>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${campaignStatusTone(campaign.status)}`}>{campaignStatusLabel(campaign.status, copy.statuses)}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label={`Suivi de la campagne ${campaign.title}`}>
                  <div className="rounded-lg bg-emerald-500/10 p-3 text-sm"><span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> {copy.delivered}</span><p className="mt-1 font-semibold text-foreground">{delivered} <span className="text-xs font-normal text-muted-foreground">/ {total}</span></p></div>
                  <div className="rounded-lg bg-cyan-500/10 p-3 text-sm"><span className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300"><Eye className="h-4 w-4" /> {copy.opened}</span><p className="mt-1 font-semibold text-foreground">{opened} <span className="text-xs font-normal text-muted-foreground">· {deliveryRateLabel(opened, delivered)}</span></p></div>
                  <div className="rounded-lg bg-amber-500/10 p-3 text-sm"><span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300"><Clock3 className="h-4 w-4" /> {copy.delayed}</span><p className="mt-1 font-semibold text-foreground">{delayed}</p></div>
                  <div className="rounded-lg bg-destructive/10 p-3 text-sm"><span className="flex items-center gap-1.5 text-destructive"><CircleAlert className="h-4 w-4" /> {copy.errors}</span><p className="mt-1 font-semibold text-foreground">{failed}</p></div>
                </div>
                <p className="text-xs text-muted-foreground">{copy.deliveryNotice}</p>
              </article>;
            })}
          </div>
        ) : <p className="py-8 text-sm text-muted-foreground">{copy.noCampaign}</p>}
      </section>

      <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground"><ShieldCheck className="mr-2 inline h-4 w-4 text-primary" /> {copy.consentNotice}</div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendCampaign.isPending}>{copy.returnToEditing}</AlertDialogCancel>
            <AlertDialogAction onClick={event => { event.preventDefault(); send(); }} disabled={sendCampaign.isPending}>{sendCampaign.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {copy.sending}</> : <><Send className="mr-2 h-4 w-4" /> {copy.confirmSending}</>}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

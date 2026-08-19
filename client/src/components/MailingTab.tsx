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
  fr: { title: "Mailing recrutement", intro: "Diffusez une offre uniquement à des profils ayant explicitement accepté les communications de recrutement. L’envoi est journalisé candidat par candidat.", statuses: { draft: "Brouillon", sending: "Envoi en cours", sent: "Envoyée", partially_sent: "Partiellement envoyée", failed: "Échec d’envoi" } },
  en: { title: "Recruitment mailing", intro: "Send an offer only to profiles that have explicitly accepted recruitment communications. Each delivery is logged candidate by candidate.", statuses: { draft: "Draft", sending: "Sending", sent: "Sent", partially_sent: "Partially sent", failed: "Sending failed" } },
  de: { title: "Recruiting-Mailing", intro: "Versenden Sie Angebote nur an Profile, die Recruiting-Kommunikation ausdrücklich akzeptiert haben. Jede Zustellung wird pro Kandidat protokolliert.", statuses: { draft: "Entwurf", sending: "Wird gesendet", sent: "Gesendet", partially_sent: "Teilweise gesendet", failed: "Versand fehlgeschlagen" } },
  zh: { title: "招聘邮件", intro: "仅向明确同意接收招聘沟通的候选人发送职位信息。每次发送都会逐位候选人记录。", statuses: { draft: "草稿", sending: "发送中", sent: "已发送", partially_sent: "部分已发送", failed: "发送失败" } },
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
      toast.success(`Campagne terminée : ${sent}/${total} email(s) envoyé(s)${failed ? `, ${failed} échec(s)` : ""}.`);
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
              <span>Nom interne de la campagne</span>
              <input value={title} onChange={event => setTitle(event.target.value)} maxLength={180} placeholder="Ex. Anesthésistes – Allemagne 2026" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
            </label>
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Langue de l’email</span>
              <select value={language} onChange={event => setLanguage(event.target.value as "fr" | "en")} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground">
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm text-muted-foreground">
            <span>Modèle d’offre réutilisable</span>
            <select value={templateId} onChange={event => applyTemplate(event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground">
              <option value="">Choisir un modèle (facultatif)</option>
              {RECRUITMENT_CAMPAIGN_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.label[language]}</option>)}
            </select>
            <span className="text-xs">Le modèle préremplit l’offre. Vérifiez et complétez les éléments entre crochets avant envoi.</span>
          </label>
          <label className="block space-y-1 text-sm text-muted-foreground">
            <span>Objet de l’email</span>
            <input value={subject} onChange={event => setSubject(event.target.value)} maxLength={255} placeholder="Ex. Opportunité médicale internationale" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" />
          </label>
          <label className="block space-y-1 text-sm text-muted-foreground">
            <span>Message de l’offre</span>
            <textarea value={body} onChange={event => setBody(event.target.value)} maxLength={8000} placeholder="Présentez la mission, la localisation, les critères et le moyen de répondre. Ne transmettez aucune donnée de patient." className="min-h-56 w-full rounded-md border border-border bg-background p-3 text-foreground placeholder:text-muted-foreground" />
            <span className="text-xs">{body.length}/8000 caractères</span>
          </label>

          <fieldset className="space-y-3 border-t border-border pt-5">
            <legend className="font-semibold text-foreground">Audience</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["selected", `Profils sélectionnés${selectedIds.length ? ` (${selectedIds.length})` : ""}`],
                ["all_eligible", "Tout le vivier éligible"],
                ["filtered", "Vivier filtré"],
              ] as Array<[AudienceMode, string]>).map(([value, label]) => (
                <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${mode === value ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"}`}>
                  <input type="radio" name="audience-mode" value={value} checked={mode === value} onChange={() => setMode(value)} /> {label}
                </label>
              ))}
            </div>
            {mode === "selected" && !selectedIds.length && <p className="text-sm text-destructive">Aucun profil sélectionné. Retournez dans le Vivier pour choisir les destinataires.</p>}
            {mode === "filtered" && (
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1 text-sm text-muted-foreground"><span>Spécialité</span><input value={specialty} onChange={event => setSpecialty(event.target.value)} placeholder="Ex. infirmier" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" /></label>
                <label className="space-y-1 text-sm text-muted-foreground"><span>Pays</span><input value={country} onChange={event => setCountry(event.target.value)} placeholder="Ex. Canada" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" /></label>
                <label className="space-y-1 text-sm text-muted-foreground"><span>Score IA minimum</span><input type="number" min="0" max="100" value={minimumScore} onChange={event => setMinimumScore(event.target.value)} placeholder="Ex. 75" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground" /></label>
              </div>
            )}
          </fieldset>
        </div>

        <aside className="h-fit rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><UsersRound className="h-5 w-5" /></span>
            <div>
              <h3 className="font-semibold text-foreground">Prévisualisation</h3>
              <p className="mt-1 text-sm text-muted-foreground">La liste est recalculée côté serveur selon le consentement et les filtres actifs.</p>
            </div>
          </div>
          <p className="mt-5 text-3xl font-semibold text-foreground">{audienceQuery.isLoading ? "…" : audience.length}</p>
          <p className="text-sm text-muted-foreground">destinataire{audience.length > 1 ? "s" : ""} éligible{audience.length > 1 ? "s" : ""}</p>
          <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto text-sm text-muted-foreground">
            {audience.slice(0, 8).map(candidate => <li key={candidate.id}><strong className="text-foreground">{candidate.firstName} {candidate.lastName}</strong><span className="block text-xs">{candidate.specialty} · {candidate.aiScore === null ? "score indisponible" : `${candidate.aiScore}/100`}</span></li>)}
            {audience.length > 8 && <li className="text-xs">… et {audience.length - 8} autre{audience.length - 8 > 1 ? "s" : ""} profil{audience.length - 8 > 1 ? "s" : ""}.</li>}
          </ul>
          <Button className="mt-5 w-full" onClick={() => setConfirmationOpen(true)} disabled={!canReview || !audience.length || audienceQuery.isLoading}>
            <Send className="mr-2 h-4 w-4" /> Vérifier avant envoi
          </Button>
        </aside>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /><h3 className="font-semibold text-foreground">Historique des campagnes</h3></div>
        {campaignsQuery.isLoading ? <PublicContentSkeleton label="Chargement de l’historique des campagnes" /> : campaignsQuery.data?.length ? (
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
                  <div><h4 className="font-semibold text-foreground">{campaign.title}</h4><p className="mt-1 text-sm text-muted-foreground">{campaign.subject} · {campaign.language.toUpperCase()} · {campaign.recipientCount} destinataire{campaign.recipientCount > 1 ? "s" : ""}</p><p className="mt-1 text-xs text-muted-foreground">Créée le {new Date(campaign.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p></div>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${campaignStatusTone(campaign.status)}`}>{campaignStatusLabel(campaign.status, copy.statuses)}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label={`Suivi de la campagne ${campaign.title}`}>
                  <div className="rounded-lg bg-emerald-500/10 p-3 text-sm"><span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Distribués</span><p className="mt-1 font-semibold text-foreground">{delivered} <span className="text-xs font-normal text-muted-foreground">/ {total}</span></p></div>
                  <div className="rounded-lg bg-cyan-500/10 p-3 text-sm"><span className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300"><Eye className="h-4 w-4" /> Ouverts</span><p className="mt-1 font-semibold text-foreground">{opened} <span className="text-xs font-normal text-muted-foreground">· {deliveryRateLabel(opened, delivered)}</span></p></div>
                  <div className="rounded-lg bg-amber-500/10 p-3 text-sm"><span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300"><Clock3 className="h-4 w-4" /> Différés</span><p className="mt-1 font-semibold text-foreground">{delayed}</p></div>
                  <div className="rounded-lg bg-destructive/10 p-3 text-sm"><span className="flex items-center gap-1.5 text-destructive"><CircleAlert className="h-4 w-4" /> Erreurs / suppressions</span><p className="mt-1 font-semibold text-foreground">{failed}</p></div>
                </div>
                <p className="text-xs text-muted-foreground">Les ouvertures sont fournies par Resend à titre indicatif : certains clients de messagerie peuvent les limiter ou les fausser. Les adresses en bounce, plainte ou suppression restent exclues des campagnes suivantes.</p>
              </article>;
            })}
          </div>
        ) : <p className="py-8 text-sm text-muted-foreground">Aucune campagne n’a encore été enregistrée.</p>}
      </section>

      <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l’envoi de la campagne</AlertDialogTitle>
            <AlertDialogDescription>Vous allez adresser « {subject || "sans objet"} » à {audience.length} profil{audience.length > 1 ? "s" : ""} ayant consenti aux communications de recrutement. Chaque tentative sera conservée dans l’historique de campagne.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground"><ShieldCheck className="mr-2 inline h-4 w-4 text-primary" /> Aucun destinataire sans consentement marketing ne sera contacté.</div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendCampaign.isPending}>Revenir à l’édition</AlertDialogCancel>
            <AlertDialogAction onClick={event => { event.preventDefault(); send(); }} disabled={sendCampaign.isPending}>{sendCampaign.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi…</> : <><Send className="mr-2 h-4 w-4" /> Confirmer l’envoi</>}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

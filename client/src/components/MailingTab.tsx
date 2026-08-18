import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Mail, Save, Send, ShieldCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type MailingTabProps = {
  initialSelectedIds: number[];
};

type AudienceMode = "selected" | "all_eligible" | "filtered";

function campaignStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Brouillon",
    sending: "Envoi en cours",
    sent: "Envoyée",
    partially_sent: "Partiellement envoyée",
    failed: "Échec d’envoi",
  };
  return labels[status] || status;
}

function campaignStatusTone(status: string) {
  if (status === "sent") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "partially_sent") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "failed") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-primary/25 bg-primary/10 text-primary";
}

export default function MailingTab({ initialSelectedIds }: MailingTabProps) {
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
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState<"europe" | "canada" | "middle_east" | "vvip_offshore" | "paramedical" | "general">("general");
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
  const offerTemplatesQuery = trpc.admin.recruitment.offerTemplates.list.useQuery();
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
  const saveTemplate = trpc.admin.recruitment.offerTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Modèle d’offre enregistré");
      setTemplateName("");
      offerTemplatesQuery.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const canReview = Boolean(title.trim() && subject.trim() && body.trim() && (mode !== "selected" || selectedIds.length));
  const audience = audienceQuery.data || [];

  const send = () => {
    sendCampaign.mutate({ ...audienceInput, title: title.trim(), subject: subject.trim(), body: body.trim(), language, confirmed: true });
  };

  return (
    <section className="space-y-7" aria-labelledby="mailing-heading">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Hippocampus Consulting</p>
        <h2 id="mailing-heading" className="mt-2 text-2xl font-semibold text-foreground">Mailing recrutement</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Diffusez une offre uniquement à des profils ayant explicitement accepté les communications de recrutement. L’envoi est journalisé candidat par candidat.</p>
      </div>

      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-start gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><FileText className="h-5 w-5" /></span><div><h3 className="font-semibold text-foreground">Modèles d’offres réutilisables</h3><p className="mt-1 text-sm text-muted-foreground">Chargez un modèle par zone ou activité, puis adaptez-le avant tout envoi.</p></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <select value={templateId} onChange={event => { const id = event.target.value; setTemplateId(id); const template = offerTemplatesQuery.data?.find(item => item.id === Number(id)); if (template) { setTitle(template.name); setSubject(template.subject); setBody(template.body); setLanguage(template.language); setTemplateCategory(template.category); } }} className="h-10 rounded-md border border-border bg-background px-3 text-foreground">
            <option value="">Choisir un modèle existant</option>
            {offerTemplatesQuery.data?.filter(template => template.active === 1).map(template => <option key={template.id} value={template.id}>{template.name} · {template.category} · {template.language.toUpperCase()}</option>)}
          </select>
          <Button variant="outline" onClick={() => { setTemplateId(""); setTemplateName(""); }} disabled={!templateId}>Nouveau modèle</Button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_12rem_auto]">
          <input value={templateName} onChange={event => setTemplateName(event.target.value)} maxLength={180} placeholder="Nom du modèle à enregistrer" className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground" />
          <select value={templateCategory} onChange={event => setTemplateCategory(event.target.value as typeof templateCategory)} className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"><option value="general">Général</option><option value="europe">Europe</option><option value="canada">Canada</option><option value="middle_east">Moyen-Orient</option><option value="vvip_offshore">VVIP / Offshore</option><option value="paramedical">Paramédical</option></select>
          <Button variant="outline" disabled={!templateName.trim() || !subject.trim() || body.trim().length < 10 || saveTemplate.isPending} onClick={() => saveTemplate.mutate({ name: templateName.trim(), category: templateCategory, language, subject: subject.trim(), body: body.trim() })}>{saveTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Enregistrer</Button>
        </div>
      </section>

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
        {campaignsQuery.isLoading ? <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement de l’historique…</div> : campaignsQuery.data?.length ? (
          <div className="space-y-3">
            {campaignsQuery.data.map(campaign => <article key={campaign.id} className="flex flex-col gap-3 rounded-xl border border-border p-4 md:flex-row md:items-center md:justify-between">
              <div><h4 className="font-semibold text-foreground">{campaign.title}</h4><p className="mt-1 text-sm text-muted-foreground">{campaign.subject} · {campaign.language.toUpperCase()} · {campaign.recipientCount} destinataire{campaign.recipientCount > 1 ? "s" : ""}</p><p className="mt-1 text-xs text-muted-foreground">Délivrés : {campaign.delivery.delivered} · acceptés pour envoi : {campaign.delivery.sent} · retards : {campaign.delivery.delayed} · erreurs/rebonds : {campaign.delivery.failed}</p><p className="mt-1 text-xs text-muted-foreground">Créée le {new Date(campaign.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p></div>
              <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${campaignStatusTone(campaign.status)}`}>{campaignStatusLabel(campaign.status)}</span>
            </article>)}
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

import { useMemo, useState } from "react";
import { BriefcaseBusiness, CheckCircle2, ChevronRight, Download, Loader2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { getPositiveMatchBreakdown } from "./matchBreakdown";
import PublicContentSkeleton from "./PublicContentSkeleton";
import { downloadRecruitmentCsv } from "./recruitmentCsvDownload";
import { useLanguage } from "@/contexts/LanguageContext";

const briefCopy = {
  fr: { title: "Briefs Employeurs", missionNeeds: "besoin(s) de mission reçu(s)", statuses: { new: "Nouveau brief", reviewing: "Qualification en cours", shortlist_sent: "Shortlist envoyée", contract_signed: "Mission confirmée", closed: "Clôturée" }, statusUpdated: "Statut du brief mis à jour", candidateAdded: "Candidat ajouté à la shortlist", exportDone: "profil(s) de shortlist exporté(s). L’export est journalisé.", loading: "Chargement des briefs employeurs", loadError: "Erreur de chargement", timelineUnknown: "Calendrier à préciser", viewProfiles: "Voir les profils", qualify: "Qualifier", noBrief: "Aucun brief Employeur à traiter.", shortlistAssisted: "Shortlist assistée", selectBrief: "Sélectionnez un brief pour consulter les correspondances basées exclusivement sur la spécialité, la mobilité et les certifications déclarées.", calculating: "Calcul des correspondances candidats", humanReview: "Les scores sont une aide à la revue humaine, pas une décision automatisée.", export: "Exporter la shortlist", availabilityUnknown: "Disponibilité à confirmer", noMatch: "Aucune correspondance professionnelle explicite détectée.", scoreDetail: "Détail du score de compatibilité", shortlisted: "Shortlisté", shortlist: "Shortlister", noCandidate: "Aucun candidat disponible pour le moment.", page: "Page", of: "sur", profiles: "profil(s) à examiner", previous: "Précédent", next: "Suivant", details: "Détails du brief", contact: "Contact", email: "Email", phone: "Téléphone", environment: "Environnement", requirements: "Certifications / exigences", languagesRequired: "Langues requises", minimumExperience: "Expérience minimale", availabilityNeeded: "Disponibilité souhaitée", description: "Description du poste", employerNotes: "Notes de l’employeur", receivedOn: "Reçu le", acknowledgedOn: "Qualifié le", shortlistSentOn: "Shortlist envoyée le", notProvided: "non précisé", years: "an(s)", confirmMission: "Mission confirmée", closeMission: "Clôturer", closeConfirm: "Clôturer cette mission ? Elle ne sera plus comptée parmi les missions actives.", reopen: "Rouvrir", removeFromShortlist: "Retirer de la shortlist", removed: "Retiré", candidateRemoved: "Candidat retiré de la shortlist", shareReminder: "Avant de transmettre la shortlist à l’établissement, informez chaque candidat et obtenez son accord pour ce destinataire et ce pays. L’export ne contient pas le score IA." },
  en: { title: "Employer briefs", missionNeeds: "mission request(s) received", statuses: { new: "New brief", reviewing: "Qualification in progress", shortlist_sent: "Shortlist sent", contract_signed: "Mission confirmed", closed: "Closed" }, statusUpdated: "Brief status updated", candidateAdded: "Candidate added to the shortlist", exportDone: "shortlist profile(s) exported. The export is logged.", loading: "Loading employer briefs", loadError: "Loading error", timelineUnknown: "Timeline to be confirmed", viewProfiles: "View profiles", qualify: "Qualify", noBrief: "No employer brief to process.", shortlistAssisted: "Assisted shortlist", selectBrief: "Select a brief to consult matches based solely on declared specialty, mobility and certifications.", calculating: "Calculating candidate matches", humanReview: "Scores support human review; they are not an automated decision.", export: "Export shortlist", availabilityUnknown: "Availability to be confirmed", noMatch: "No explicit professional match detected.", scoreDetail: "Compatibility score details", shortlisted: "Shortlisted", shortlist: "Shortlist", noCandidate: "No candidate is currently available.", page: "Page", of: "of", profiles: "profile(s) to review", previous: "Previous", next: "Next", details: "Brief details", contact: "Contact", email: "Email", phone: "Phone", environment: "Environment", requirements: "Certifications / requirements", languagesRequired: "Required languages", minimumExperience: "Minimum experience", availabilityNeeded: "Desired availability", description: "Job description", employerNotes: "Employer notes", receivedOn: "Received on", acknowledgedOn: "Qualified on", shortlistSentOn: "Shortlist sent on", notProvided: "not provided", years: "year(s)", confirmMission: "Mission confirmed", closeMission: "Close", closeConfirm: "Close this mission? It will no longer count as an active mission.", reopen: "Reopen", removeFromShortlist: "Remove from shortlist", removed: "Removed", candidateRemoved: "Candidate removed from the shortlist", shareReminder: "Before sending the shortlist to the institution, inform each candidate and obtain their agreement for this recipient and this country. The export does not include the AI score." },
  de: { title: "Arbeitgeber-Briefs", missionNeeds: "Missionsanfrage(n) eingegangen", statuses: { new: "Neuer Brief", reviewing: "Qualifizierung läuft", shortlist_sent: "Shortlist gesendet", contract_signed: "Mission bestätigt", closed: "Abgeschlossen" }, statusUpdated: "Brief-Status aktualisiert", candidateAdded: "Kandidat zur Shortlist hinzugefügt", exportDone: "Shortlist-Profil(e) exportiert. Der Export wird protokolliert.", loading: "Arbeitgeber-Briefs werden geladen", loadError: "Ladefehler", timelineUnknown: "Zeitplan noch festzulegen", viewProfiles: "Profile anzeigen", qualify: "Qualifizieren", noBrief: "Kein Arbeitgeber-Brief zu bearbeiten.", shortlistAssisted: "Unterstützte Shortlist", selectBrief: "Wählen Sie einen Brief, um Übereinstimmungen ausschließlich anhand von Fachgebiet, Mobilität und angegebenen Zertifikaten zu prüfen.", calculating: "Kandidatenübereinstimmungen werden berechnet", humanReview: "Scores unterstützen die menschliche Prüfung und sind keine automatisierte Entscheidung.", export: "Shortlist exportieren", availabilityUnknown: "Verfügbarkeit zu bestätigen", noMatch: "Keine ausdrückliche berufliche Übereinstimmung erkannt.", scoreDetail: "Details des Kompatibilitätsscores", shortlisted: "Auf Shortlist", shortlist: "Auf Shortlist setzen", noCandidate: "Derzeit ist kein Kandidat verfügbar.", page: "Seite", of: "von", profiles: "Profil(e) zur Prüfung", previous: "Zurück", next: "Weiter", details: "Brief-Details", contact: "Kontakt", email: "E-Mail", phone: "Telefon", environment: "Umfeld", requirements: "Zertifikate / Anforderungen", languagesRequired: "Erforderliche Sprachen", minimumExperience: "Mindesterfahrung", availabilityNeeded: "Gewünschte Verfügbarkeit", description: "Stellenbeschreibung", employerNotes: "Notizen des Arbeitgebers", receivedOn: "Eingegangen am", acknowledgedOn: "Qualifiziert am", shortlistSentOn: "Shortlist gesendet am", notProvided: "nicht angegeben", years: "Jahr(e)", confirmMission: "Mission bestätigt", closeMission: "Abschließen", closeConfirm: "Diese Mission abschließen? Sie zählt dann nicht mehr zu den aktiven Missionen.", reopen: "Wieder öffnen", removeFromShortlist: "Von der Shortlist entfernen", removed: "Entfernt", candidateRemoved: "Kandidat von der Shortlist entfernt", shareReminder: "Informieren Sie vor dem Versand der Shortlist an die Einrichtung jeden Kandidaten und holen Sie seine Zustimmung für diesen Empfänger und dieses Land ein. Der Export enthält keinen KI-Score." },
  zh: { title: "雇主需求", missionNeeds: "已收到任务需求", statuses: { new: "新需求", reviewing: "资格确认中", shortlist_sent: "已发送候选名单", contract_signed: "任务已确认", closed: "已关闭" }, statusUpdated: "需求状态已更新", candidateAdded: "候选人已加入候选名单", exportDone: "个候选名单已导出。导出操作已记录。", loading: "正在加载雇主需求", loadError: "加载错误", timelineUnknown: "待确认时间表", viewProfiles: "查看候选人", qualify: "资格确认", noBrief: "没有待处理的雇主需求。", shortlistAssisted: "辅助候选名单", selectBrief: "请选择一项需求，以查看仅根据已声明专业、流动性和证书得出的匹配结果。", calculating: "正在计算候选人匹配", humanReview: "分数仅用于辅助人工审核，并非自动决策。", export: "导出候选名单", availabilityUnknown: "待确认可用性", noMatch: "未检测到明确的职业匹配。", scoreDetail: "匹配分数详情", shortlisted: "已列入名单", shortlist: "加入名单", noCandidate: "目前没有可用候选人。", page: "第", of: "页，共", profiles: "个待审查候选人", previous: "上一页", next: "下一页", details: "需求详情", contact: "联系人", email: "邮箱", phone: "电话", environment: "工作环境", requirements: "证书 / 要求", languagesRequired: "所需语言", minimumExperience: "最低经验", availabilityNeeded: "期望到岗时间", description: "职位描述", employerNotes: "雇主备注", receivedOn: "收到日期", acknowledgedOn: "资格确认日期", shortlistSentOn: "候选名单发送日期", notProvided: "未提供", years: "年", confirmMission: "任务已确认", closeMission: "关闭", closeConfirm: "关闭此任务？它将不再计入进行中的任务。", reopen: "重新打开", removeFromShortlist: "从候选名单移除", removed: "已移除", candidateRemoved: "候选人已从候选名单移除", shareReminder: "在将候选名单发送给机构之前，请告知每位候选人并取得其对该接收方和该国家的同意。导出文件不包含 AI 分数。" },
} as const;

export default function EmployerBriefsTab() {
  const { language } = useLanguage();
  const copy = briefCopy[language as keyof typeof briefCopy] ?? briefCopy.fr;
  const utils = trpc.useUtils();
  const [selectedBriefId, setSelectedBriefId] = useState<number | null>(null);
  const [matchPage, setMatchPage] = useState(0);
  const { data: briefs, isLoading, error } = trpc.admin.clientBriefs.list.useQuery();
  const matchesInput = useMemo(() => ({ briefId: selectedBriefId ?? 1, page: matchPage, limit: 25 }), [selectedBriefId, matchPage]);
  const matches = trpc.admin.clientBriefs.candidates.useQuery(
    matchesInput,
    { enabled: selectedBriefId !== null },
  );
  const updateStatus = trpc.admin.clientBriefs.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(copy.statusUpdated);
      utils.admin.clientBriefs.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const associate = trpc.admin.clientBriefs.associateCandidate.useMutation({
    onSuccess: (_result, variables) => {
      toast.success(variables.status === "declined" ? copy.candidateRemoved : copy.candidateAdded);
      if (selectedBriefId) utils.admin.clientBriefs.candidates.invalidate(matchesInput);
    },
    onError: error => toast.error(error.message),
  });
  const exportShortlist = trpc.admin.recruitment.exportCsv.useMutation({
    onSuccess: result => {
      downloadRecruitmentCsv(result);
      toast.success(`${result.count} ${copy.exportDone}`);
    },
    onError: exportError => toast.error(exportError.message),
  });
  const activeBrief = matches.data?.brief ?? null;
  const selectedBrief = briefs?.find(brief => brief.id === selectedBriefId) ?? null;
  const locale = language === "zh" ? "zh-CN" : language === "de" ? "de-DE" : language === "en" ? "en-GB" : "fr-FR";
  const formatDate = (value: Date | string | null | undefined) => value ? new Date(value).toLocaleString(locale, { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" }) : null;
  const closeBrief = (id: number) => { if (window.confirm(copy.closeConfirm)) updateStatus.mutate({ id, status: "closed" }); };

  if (isLoading) return <PublicContentSkeleton label={copy.loading} />;
  if (error) return <p className="py-8 text-center text-red-400">{copy.loadError}: {error.message}</p>;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="space-y-3">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
            <p className="text-sm text-muted-foreground">{briefs?.length ?? 0} {copy.missionNeeds}</p>
          </div>
          <BriefcaseBusiness className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        {briefs?.map(brief => (
          <article key={brief.id} className={`rounded-xl border p-4 transition-colors ${selectedBriefId === brief.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{brief.organizationName}</p>
                <p className="mt-1 text-sm text-muted-foreground">{brief.specialtyNeeded} · {brief.country}</p>
                <p className="mt-1 text-xs text-muted-foreground">{brief.targetEnvironment} · {brief.timeline || copy.timelineUnknown}</p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{copy.statuses[brief.status as keyof typeof copy.statuses] ?? brief.status}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { setSelectedBriefId(brief.id); setMatchPage(0); }}>
                <UsersRound className="mr-1 h-3.5 w-3.5" />{copy.viewProfiles}
              </Button>
              {brief.status === "new" && <Button size="sm" onClick={() => updateStatus.mutate({ id: brief.id, status: "reviewing" })}>{copy.qualify}</Button>}
              {brief.status === "reviewing" && <Button size="sm" onClick={() => updateStatus.mutate({ id: brief.id, status: "shortlist_sent" })}>{copy.statuses.shortlist_sent}</Button>}
              {brief.status === "shortlist_sent" && <Button size="sm" onClick={() => updateStatus.mutate({ id: brief.id, status: "contract_signed" })}>{copy.confirmMission}</Button>}
              {brief.status !== "closed" && <Button size="sm" variant="ghost" disabled={updateStatus.isPending} onClick={() => closeBrief(brief.id)}>{copy.closeMission}</Button>}
              {brief.status === "closed" && <Button size="sm" variant="ghost" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: brief.id, status: "reviewing" })}>{copy.reopen}</Button>}
            </div>
          </article>
        ))}
        {(!briefs || briefs.length === 0) && <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">{copy.noBrief}</p>}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        {!selectedBriefId && <div className="flex min-h-72 flex-col items-center justify-center text-center"><UsersRound className="mb-3 h-8 w-8 text-primary" /><h2 className="font-semibold text-foreground">{copy.shortlistAssisted}</h2><p className="mt-2 max-w-sm text-sm text-muted-foreground">{copy.selectBrief}</p></div>}
        {selectedBriefId && matches.isLoading && <PublicContentSkeleton cards={2} columns={2} label={copy.calculating} />}
          {selectedBrief && <section className="mb-5 rounded-lg border border-border bg-background p-4" aria-label={`${copy.details} ${selectedBrief.briefId}`}>
            <h3 className="mb-3 text-sm font-semibold text-foreground">{copy.details} · {selectedBrief.organizationName}</h3>
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">{copy.contact}</dt><dd className="text-foreground">{selectedBrief.contactName}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{copy.email}</dt><dd><a className="break-all text-primary underline underline-offset-2" href={`mailto:${selectedBrief.email}`}>{selectedBrief.email}</a></dd></div>
              <div><dt className="text-xs text-muted-foreground">{copy.phone}</dt><dd>{selectedBrief.phone ? <a className="text-primary underline underline-offset-2" href={`tel:${selectedBrief.phone.replace(/[^+\d]/g, "")}`}>{selectedBrief.phone}</a> : <span className="text-muted-foreground">{copy.notProvided}</span>}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{copy.environment}</dt><dd className="text-foreground">{selectedBrief.targetEnvironment}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{copy.receivedOn}</dt><dd className="text-foreground">{formatDate(selectedBrief.createdAt)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{copy.availabilityNeeded}</dt><dd className="text-foreground">{selectedBrief.availabilityNeeded || selectedBrief.timeline || copy.notProvided}</dd></div>
              {selectedBrief.acknowledgedAt && <div><dt className="text-xs text-muted-foreground">{copy.acknowledgedOn}</dt><dd className="text-foreground">{formatDate(selectedBrief.acknowledgedAt)}</dd></div>}
              {selectedBrief.shortlistSentAt && <div><dt className="text-xs text-muted-foreground">{copy.shortlistSentOn}</dt><dd className="text-foreground">{formatDate(selectedBrief.shortlistSentAt)}</dd></div>}
              <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{copy.requirements}</dt><dd className="whitespace-pre-wrap text-foreground">{selectedBrief.requiredCertifications || copy.notProvided}</dd></div>
              {selectedBrief.requiredLanguages && <div><dt className="text-xs text-muted-foreground">{copy.languagesRequired}</dt><dd className="text-foreground">{selectedBrief.requiredLanguages}</dd></div>}
              {selectedBrief.minimumYearsExperience !== null && selectedBrief.minimumYearsExperience !== undefined && <div><dt className="text-xs text-muted-foreground">{copy.minimumExperience}</dt><dd className="text-foreground">{selectedBrief.minimumYearsExperience} {copy.years}</dd></div>}
              {selectedBrief.jobDescription && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{copy.description}</dt><dd className="whitespace-pre-wrap text-foreground">{selectedBrief.jobDescription}</dd></div>}
              <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{copy.employerNotes}</dt><dd className="whitespace-pre-wrap text-foreground">{selectedBrief.notes || copy.notProvided}</dd></div>
            </dl>
          </section>}
        {matches.data && activeBrief && <>
          <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm text-primary">{activeBrief.briefId}</p><h2 className="text-xl font-semibold text-foreground">{activeBrief.specialtyNeeded} — {activeBrief.country}</h2><p className="mt-1 text-sm text-muted-foreground">{copy.humanReview}</p><p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">{copy.shareReminder}</p></div><Button size="sm" variant="outline" disabled={exportShortlist.isPending} onClick={() => exportShortlist.mutate({ type: "shortlist", briefId: activeBrief.id })}>{exportShortlist.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}{copy.export}</Button></div>
          <div className="space-y-3">
            {matches.data.candidates.map(candidate => (
              <article key={candidate.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row">
                  <div><div className="flex items-center gap-2"><p className="font-medium text-foreground">{candidate.firstName} {candidate.lastName}</p><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{candidate.match.score}/100</span></div><p className="mt-1 text-sm text-muted-foreground">{candidate.specialty} · {candidate.availability || copy.availabilityUnknown}</p>{candidate.match.reasons.length > 0 ? <p className="mt-2 text-xs text-muted-foreground">{candidate.match.reasons.join(" · ")}</p> : <p className="mt-2 text-xs text-muted-foreground">{copy.noMatch}</p>}{getPositiveMatchBreakdown(candidate.match.breakdown).length > 0 && <div className="mt-3 flex flex-wrap gap-1.5" aria-label={copy.scoreDetail}>{getPositiveMatchBreakdown(candidate.match.breakdown).map(item => <span key={item.key} className="rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] font-medium text-foreground">{item.label} +{item.points}</span>)}</div>}</div>
                  {candidate.association?.status === "shortlisted"
                    ? <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end"><span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />{copy.shortlisted}</span><Button size="sm" variant="outline" disabled={associate.isPending} onClick={() => associate.mutate({ briefId: activeBrief.id, applicationId: candidate.id, status: "declined" })}>{copy.removeFromShortlist}</Button></div>
                    : <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">{candidate.association?.status === "declined" && <span className="text-xs text-muted-foreground">{copy.removed}</span>}<Button size="sm" disabled={associate.isPending} onClick={() => associate.mutate({ briefId: activeBrief.id, applicationId: candidate.id, matchScore: candidate.match.score, status: "shortlisted" })}>{copy.shortlist}<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></div>}
                </div>
              </article>
            ))}
            {matches.data.candidates.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{copy.noCandidate}</p>}
          </div>
          {matches.data.pagination.totalPages > 1 && <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{copy.page} {matches.data.pagination.page + 1} {copy.of} {matches.data.pagination.totalPages} · {matches.data.pagination.total} {copy.profiles}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={matches.data.pagination.page === 0 || matches.isFetching} onClick={() => setMatchPage(current => Math.max(0, current - 1))}>{copy.previous}</Button><Button size="sm" variant="outline" disabled={matches.data.pagination.page + 1 >= matches.data.pagination.totalPages || matches.isFetching} onClick={() => setMatchPage(current => current + 1)}>{copy.next}</Button></div></div>}
        </>}
      </section>
    </div>
  );
}

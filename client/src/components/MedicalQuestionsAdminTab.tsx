import { useEffect, useState } from "react";
import { Archive, Clock3, Mail, Phone, ShieldCheck, Sparkles, Send, Save, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import AdminLoadMore from "@/components/AdminLoadMore";
import { adminListCount, adminPageOffsets, ADMIN_PAGE_SIZE, mergeAdminPages, useAdminPageCount } from "@/components/adminPagination";
import { toast } from "sonner";

const MIN_PRIVATE_RESPONSE_LENGTH = 20;

type MedicalQuestionStatus = "submitted" | "drafting" | "answered" | "published" | "rejected";

/**
 * ADM-01: the tab opens on the questions to answer (new and drafts), oldest
 * first, so that none waits out of sight behind the newer ones.
 */
export const MEDICAL_QUESTION_QUEUES = {
  todo: { label: "À traiter", statuses: ["submitted", "drafting"], order: "oldest", empty: "Aucune question à traiter." },
  answered: { label: "Répondues", statuses: ["answered", "published"], order: "newest", empty: "Aucune question répondue." },
  rejected: { label: "Classées sans suite", statuses: ["rejected"], order: "newest", empty: "Aucune question classée sans suite." },
  all: { label: "Toutes", statuses: undefined, order: "newest", empty: "Aucune question reçue." },
} as const satisfies Record<string, { label: string; statuses: readonly MedicalQuestionStatus[] | undefined; order: "oldest" | "newest"; empty: string }>;

type MedicalQuestionQueue = keyof typeof MEDICAL_QUESTION_QUEUES;

const STATUS_LABELS: Record<MedicalQuestionStatus, string> = {
  submitted: "Nouvelle",
  drafting: "Brouillon",
  answered: "Répondue",
  published: "Publiée",
  rejected: "Classée sans suite",
};

export default function MedicalQuestionsAdminTab() {
  const [queue, setQueue] = useState<MedicalQuestionQueue>("todo");
  const { pageCount, loadMore } = useAdminPageCount(queue);
  const { statuses, order } = MEDICAL_QUESTION_QUEUES[queue];
  const pages = trpc.useQueries(t => adminPageOffsets(pageCount).map(offset => t.medicalQuestions.admin.list({ statuses: statuses ? [...statuses] : undefined, order, limit: ADMIN_PAGE_SIZE, offset })));
  const { items, total, isLoading, isLoadingMore, error, loadMoreError, retryLoadMore } = mergeAdminPages(pages);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adminResponse, setAdminResponse] = useState("");
  const [publicQuestion, setPublicQuestion] = useState("");
  const [publicResponse, setPublicResponse] = useState("");
  const [publish, setPublish] = useState(false);
  const selected = trpc.medicalQuestions.admin.get.useQuery(
    { id: selectedId ?? 0 },
    { enabled: selectedId !== null }
  );
  const utils = trpc.useUtils();
  const saveDraft = trpc.medicalQuestions.admin.saveDraft.useMutation({
    onSuccess: () => {
      void utils.medicalQuestions.admin.get.invalidate();
      void utils.medicalQuestions.admin.list.invalidate();
      toast.success("Brouillon enregistré.");
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  const improve = trpc.medicalQuestions.admin.improveDraft.useMutation({
    onSuccess: result => {
      setAdminResponse(result.suggestion);
      toast.success("Proposition IA appliquée : relisez-la avant toute validation.");
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  const sendValidated = trpc.medicalQuestions.admin.sendValidatedResponse.useMutation({
    onSuccess: result => {
      void utils.medicalQuestions.admin.get.invalidate();
      void utils.medicalQuestions.admin.list.invalidate();
      toast.success(result.resent ? "Réponse renvoyée par email." : result.published ? "Réponse envoyée et version anonymisée publiée." : "Réponse envoyée par email.");
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  const updatePublication = trpc.medicalQuestions.admin.updatePublication.useMutation({
    onSuccess: () => {
      void utils.medicalQuestions.admin.get.invalidate();
      void utils.medicalQuestions.admin.list.invalidate();
      toast.success("Publication mise à jour, sans nouvel email au patient.");
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  const unpublish = trpc.medicalQuestions.admin.unpublish.useMutation({
    onSuccess: () => {
      setPublish(false);
      void utils.medicalQuestions.admin.get.invalidate();
      void utils.medicalQuestions.admin.list.invalidate();
      toast.success("La question a été retirée de la bibliothèque publique. Le dossier privé et son journal sont conservés.");
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  const reject = trpc.medicalQuestions.admin.reject.useMutation({
    onSuccess: () => {
      void utils.medicalQuestions.admin.get.invalidate();
      void utils.medicalQuestions.admin.list.invalidate();
      toast.success("Question classée sans suite. Le dossier privé et son journal sont conservés ; enregistrer un brouillon la remet à traiter.");
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  // RGPD-12: erasure request or withdrawn consent; the security journal keeps a trace that names no one.
  const remove = trpc.medicalQuestions.admin.delete.useMutation({
    onSuccess: () => {
      setSelectedId(null);
      void utils.medicalQuestions.admin.list.invalidate();
      toast.success("Question supprimée définitivement, avec sa version publique et son journal.");
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  useEffect(() => {
    if (!selected.data) return;
    setAdminResponse(selected.data.adminResponse ?? "");
    setPublicQuestion(selected.data.publicQuestion ?? "");
    setPublicResponse(selected.data.publicResponse ?? "");
    setPublish(selected.data.status === "published");
  }, [selected.data]);

  const responseLength = adminResponse.trim().length;
  const responseReady = responseLength >= MIN_PRIVATE_RESPONSE_LENGTH;
  const remainingCharacters = Math.max(0, MIN_PRIVATE_RESPONSE_LENGTH - responseLength);
  const missingPublicContent = publish && (!publicQuestion.trim() || !publicResponse.trim());
  // ADM-MQ-01: once the answer is sent, the main button cannot email again.
  const alreadySent = Boolean(selected.data?.responseSentAt);
  const sendDisabled = alreadySent || !responseReady || sendValidated.isPending || missingPublicContent;
  const draftDisabled = !responseReady || saveDraft.isPending;

  const validationHint = !responseReady
    ? `Ajoutez encore ${remainingCharacters} caractère${remainingCharacters > 1 ? "s" : ""} à la réponse privée pour activer la validation.`
    : missingPublicContent
      ? "Complétez la question et la réponse anonymisées pour publier la version publique."
      : "La réponse est prête : vous pouvez valider l’envoi. Relisez-la une dernière fois avant de confirmer.";

  function handleSend() {
    if (!selected.data) return;
    if (!responseReady) {
      toast.error(`La réponse privée doit comporter au moins ${MIN_PRIVATE_RESPONSE_LENGTH} caractères.`);
      return;
    }
    if (missingPublicContent) {
      toast.error("La question et la réponse anonymisées sont obligatoires pour publier.");
      return;
    }
    sendValidated.mutate({
      id: selected.data.id,
      adminResponse,
      publicQuestion,
      publicResponse,
      publish,
    });
  }

  function handleResend() {
    if (!selected.data || !responseReady) return;
    if (!window.confirm("Renvoyer la réponse par email au patient ? Un nouvel email sera envoyé ; la publication n’est pas modifiée.")) return;
    sendValidated.mutate({ id: selected.data.id, adminResponse, publicQuestion, publicResponse, publish: false, resend: true });
  }

  function handlePublicationUpdate() {
    if (!selected.data) return;
    if (!publicQuestion.trim() || !publicResponse.trim()) {
      toast.error("La question et la réponse anonymisées sont obligatoires pour publier.");
      return;
    }
    updatePublication.mutate({ id: selected.data.id, publicQuestion, publicResponse });
  }

  if (isLoading) return <PublicContentSkeleton cards={3} label="Chargement des questions médicales" />;
  if (error) return <p className="text-destructive">{error.message}</p>;

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
      <div className="min-w-0">
        <p className="section-kicker">Service gratuit</p>
        <h2 className="mt-2 font-display text-3xl">Questions médicales</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Les coordonnées et la question originale restent privées. Aucun envoi ni publication n’est possible sans validation médicale.
        </p>
        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Questions affichées">
          {(Object.keys(MEDICAL_QUESTION_QUEUES) as MedicalQuestionQueue[]).map(key => (
            <button
              type="button"
              key={key}
              onClick={() => setQueue(key)}
              aria-pressed={queue === key}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${queue === key ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}
            >
              {MEDICAL_QUESTION_QUEUES[key].label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {adminListCount(items.length, total, "question(s)")}{queue === "todo" ? " · de la plus ancienne à la plus récente" : ""}
        </p>
        <div className="mt-4 space-y-3">
          {items.map(question => (
            <button
              type="button"
              key={question.id}
              onClick={() => setSelectedId(question.id)}
              className={`min-w-0 w-full rounded-2xl border p-4 text-left transition-colors ${selectedId === question.id ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-semibold text-foreground">{question.firstName} {question.lastName}</span>
                <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{STATUS_LABELS[question.status] ?? question.status}</span>
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{question.trackingId}</p>
              <p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{question.question}</p>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                {new Date(question.createdAt).toLocaleString("fr-FR")}
              </p>
            </button>
          ))}
          {items.length === 0 && <p className="rounded-2xl border border-border p-5 text-muted-foreground">{MEDICAL_QUESTION_QUEUES[queue].empty}</p>}
        </div>
        <AdminLoadMore shown={items.length} total={total} loading={isLoadingMore} onLoadMore={loadMore} error={loadMoreError} onRetry={retryLoadMore} />
      </div>

      <div className="min-w-0 rounded-3xl border border-border bg-card/50 p-6">
        {selected.isLoading ? (
          <PublicContentSkeleton cards={1} label="Chargement de la demande" />
        ) : selected.error ? (
          <div className="grid min-h-80 place-items-center text-center">
            <div className="max-w-md space-y-3" role="alert">
              <p className="font-medium text-destructive">Impossible de charger cette demande privée.</p>
              <p className="text-sm text-muted-foreground">{selected.error.message}</p>
              <button type="button" onClick={() => void selected.refetch()} className="rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10">Réessayer le chargement</button>
            </div>
          </div>
        ) : selected.data ? (
          <div>
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wider">Données privées — administration uniquement</span>
            </div>
            <h3 className="mt-4 font-display text-2xl">{selected.data.firstName} {selected.data.lastName}</h3>
            <p className="mt-1 text-sm text-muted-foreground">Référence <span className="font-mono text-foreground">{selected.data.trackingId}</span> · {STATUS_LABELS[selected.data.status] ?? selected.data.status}</p>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><Mail className="h-4 w-4" />{selected.data.email}</span>
              <span className="flex items-center gap-2"><Phone className="h-4 w-4" />{selected.data.phone}</span>
            </div>
            <div className="mt-6 rounded-2xl border border-border bg-background/70 p-5">
              <p className="whitespace-pre-line leading-7 text-foreground">{selected.data.question}</p>
            </div>
            {selected.data.responseSentAt && (
              <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200" role="status">
                Réponse envoyée le {new Date(selected.data.responseSentAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}. Un nouvel envoi n’est possible que par « Renvoyer la réponse par email ».
              </p>
            )}

            <div className="mt-6 space-y-3">
              <label className="block text-sm font-medium" htmlFor="medical-question-private-response">
                Réponse privée envoyée par email
                <textarea
                  id="medical-question-private-response"
                  value={adminResponse}
                  onChange={event => setAdminResponse(event.target.value)}
                  rows={8}
                  className="form-control mt-2 block w-full"
                  placeholder="Rédigez la réponse générale relue par le médecin."
                  aria-describedby="medical-question-response-requirement"
                />
              </label>
              <p id="medical-question-response-requirement" className={`text-xs leading-5 ${responseReady ? "text-emerald-300" : "text-amber-300"}`} aria-live="polite">
                {responseLength}/{MIN_PRIVATE_RESPONSE_LENGTH} caractères minimum. {validationHint}
              </p>
              <button
                type="button"
                onClick={() => improve.mutate({ adminResponse })}
                disabled={!responseReady || improve.isPending}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles className="h-4 w-4" />
                {improve.isPending ? "Reformulation…" : "Améliorer la formulation avec IA"}
              </button>
              <p className="text-xs leading-5 text-muted-foreground">L’IA ne crée pas de réponse médicale : elle reformule uniquement votre brouillon. Relisez toujours avant de valider.</p>

              <label className="block text-sm font-medium" htmlFor="medical-question-public-question">
                Question publique anonymisée
                <textarea id="medical-question-public-question" value={publicQuestion} onChange={event => setPublicQuestion(event.target.value)} rows={3} className="form-control mt-2 block w-full" placeholder="Supprimez tout élément identifiant." />
              </label>
              <label className="block text-sm font-medium" htmlFor="medical-question-public-response">
                Réponse publique anonymisée
                <textarea id="medical-question-public-response" value={publicResponse} onChange={event => setPublicResponse(event.target.value)} rows={6} className="form-control mt-2 block w-full" placeholder="Version destinée à la bibliothèque publique." />
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={publish} disabled={selected.data.publicationConsent !== 1} onChange={event => setPublish(event.target.checked)} className="form-consent-checkbox mt-1" />
                <span>{alreadySent ? "Version anonymisée publiée" : "Publier la version anonymisée après envoi"} {selected.data.publicationConsent === 1 ? "(accord de publication reçu)" : "(indisponible : aucun accord de publication)"}</span>
              </label>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => saveDraft.mutate({ id: selected.data!.id, adminResponse, publicQuestion, publicResponse })}
                  disabled={draftDisabled}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Save className="h-4 w-4" />
                  {saveDraft.isPending ? "Enregistrement…" : "Enregistrer le brouillon"}
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sendDisabled}
                  className="cta-primary inline-flex items-center gap-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                  {alreadySent ? "Réponse déjà envoyée" : sendValidated.isPending ? "Envoi…" : publish ? "Valider, envoyer et publier" : "Valider et envoyer"}
                </button>
                {alreadySent && selected.data.publicationConsent === 1 && (
                  <button
                    type="button"
                    onClick={handlePublicationUpdate}
                    disabled={updatePublication.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {updatePublication.isPending ? "Mise à jour…" : selected.data.status === "published" ? "Mettre à jour la publication" : "Publier la version anonymisée"}
                  </button>
                )}
                {alreadySent && (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={!responseReady || sendValidated.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sendValidated.isPending ? "Envoi…" : "Renvoyer la réponse par email"}
                  </button>
                )}
                {selected.data.status === "published" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Retirer cette question de la bibliothèque publique ? La réponse privée, les coordonnées et le journal d’audit resteront conservés.")) {
                        unpublish.mutate({ id: selected.data!.id });
                      }
                    }}
                    disabled={unpublish.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-destructive/60 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {unpublish.isPending ? "Retrait…" : "Retirer de la bibliothèque publique"}
                  </button>
                )}
                {!alreadySent && selected.data.status !== "rejected" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Classer sans suite la question ${selected.data!.trackingId} ? Aucun email n’est envoyé ; la question quitte la liste « À traiter », le dossier privé et son journal sont conservés.`)) {
                        reject.mutate({ id: selected.data!.id });
                      }
                    }}
                    disabled={reject.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Archive className="h-4 w-4" />
                    {reject.isPending ? "Classement…" : "Classer sans suite"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Supprimer définitivement la question ${selected.data!.trackingId} ? Les coordonnées, la question, la réponse, la version publique éventuelle et le journal de la question seront effacés. Action irréversible.`)) {
                      remove.mutate({ id: selected.data!.id });
                    }
                  }}
                  disabled={remove.isPending}
                  className="inline-flex items-center gap-2 rounded-lg border border-destructive/60 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                  {remove.isPending ? "Suppression…" : "Supprimer"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-80 place-items-center text-center text-muted-foreground">Sélectionnez une question pour consulter ses informations privées.</div>
        )}
      </div>
    </section>
  );
}

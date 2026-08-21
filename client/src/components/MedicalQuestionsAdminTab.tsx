import { useEffect, useState } from "react";
import { Clock3, Mail, Phone, ShieldCheck, Sparkles, Send, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { toast } from "sonner";

const MIN_PRIVATE_RESPONSE_LENGTH = 20;

export default function MedicalQuestionsAdminTab() {
  const { data, isLoading, error } = trpc.medicalQuestions.admin.list.useQuery({ limit: 50 });
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
      toast.success(result.published ? "Réponse envoyée et version anonymisée publiée." : "Réponse envoyée par email.");
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
  const sendDisabled = !responseReady || sendValidated.isPending || missingPublicContent;
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

  if (isLoading) return <PublicContentSkeleton cards={3} label="Chargement des questions médicales" />;
  if (error) return <p className="text-destructive">{error.message}</p>;

  return (
    <section className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
      <div>
        <p className="section-kicker">Service gratuit</p>
        <h2 className="mt-2 font-display text-3xl">Questions médicales</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Les coordonnées et la question originale restent privées. Aucun envoi ni publication n’est possible sans validation médicale.
        </p>
        <div className="mt-6 space-y-3">
          {data?.map(question => (
            <button
              type="button"
              key={question.id}
              onClick={() => setSelectedId(question.id)}
              className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedId === question.id ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-foreground">{question.firstName} {question.lastName}</span>
                <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{question.status}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{question.question}</p>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                {new Date(question.createdAt).toLocaleString("fr-FR")}
              </p>
            </button>
          ))}
          {!data?.length && <p className="rounded-2xl border border-border p-5 text-muted-foreground">Aucune question en attente.</p>}
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card/50 p-6">
        {selected.isLoading ? (
          <PublicContentSkeleton cards={1} label="Chargement de la demande" />
        ) : selected.data ? (
          <div>
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wider">Données privées — administration uniquement</span>
            </div>
            <h3 className="mt-4 font-display text-2xl">{selected.data.firstName} {selected.data.lastName}</h3>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><Mail className="h-4 w-4" />{selected.data.email}</span>
              <span className="flex items-center gap-2"><Phone className="h-4 w-4" />{selected.data.phone}</span>
            </div>
            <div className="mt-6 rounded-2xl border border-border bg-background/70 p-5">
              <p className="whitespace-pre-line leading-7 text-foreground">{selected.data.question}</p>
            </div>

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
                <span>Publier la version anonymisée après envoi {selected.data.publicationConsent === 1 ? "(accord de publication reçu)" : "(indisponible : aucun accord de publication)"}</span>
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
                  {sendValidated.isPending ? "Envoi…" : publish ? "Valider, envoyer et publier" : "Valider et envoyer"}
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

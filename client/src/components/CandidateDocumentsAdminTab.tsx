import { useState } from "react";
import { Download, FileCheck2, FileWarning, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { canRequestCandidateDocumentReanalysis } from "@shared/candidateDocumentReanalysis";
import { toast } from "sonner";

const documentLabels: Record<string, string> = {
  identity_document: "Pièce d’identité", medical_license: "Autorisation / licence médicale", diploma: "Diplôme", certificate: "Certificat professionnel", professional_insurance: "Assurance professionnelle", vaccination_record: "Justificatif de vaccination", criminal_record: "Casier / extrait judiciaire", employment_evidence: "Attestation d’emploi", proof_of_address: "Justificatif de domicile", other: "Autre document",
};

export default function CandidateDocumentsAdminTab() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<string>("needs_review");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const list = trpc.admin.candidateDocuments.list.useQuery({ status: filter === "all" ? undefined : filter as "uploaded" | "validating" | "analyzing" | "needs_review" | "reviewed" | "rejected" | "archived" });
  const review = trpc.admin.candidateDocuments.review.useMutation({
    onSuccess: () => { toast.success("Revue du document enregistrée"); utils.admin.candidateDocuments.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const reanalyze = trpc.admin.candidateDocuments.reanalyze.useMutation({
    onSuccess: () => { toast.success("Analyse relancée : le document repasse dans la file sécurisée."); utils.admin.candidateDocuments.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const download = trpc.admin.candidateDocuments.download.useMutation({ onSuccess: data => window.open(data.url, "_blank", "noopener,noreferrer"), onError: error => toast.error(error.message) });

  return <section className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Coffre candidat</p><h2 className="mt-1 text-2xl font-bold text-foreground">Revue humaine des documents</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">L’IA fournit une synthèse indicative. Vérifiez toujours le fichier original avant de valider, refuser ou archiver un document.</p></div><div className="w-full sm:w-56"><Label htmlFor="candidate-document-filter">État</Label><Select value={filter} onValueChange={setFilter}><SelectTrigger id="candidate-document-filter" className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="needs_review">À revoir</SelectItem><SelectItem value="analyzing">En analyse</SelectItem><SelectItem value="uploaded">Reçus</SelectItem><SelectItem value="reviewed">Validés</SelectItem><SelectItem value="rejected">Refusés</SelectItem><SelectItem value="archived">Archivés</SelectItem><SelectItem value="all">Tous</SelectItem></SelectContent></Select></div></div>
    {list.isLoading && <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="mb-3 animate-spin"/>Chargement sécurisé…</div>}
    {list.data?.map(document => <Card key={document.id} className="border-border bg-card"><CardHeader className="gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-base">{documentLabels[document.category] || document.category}{document.categoryOtherLabel ? ` · ${document.categoryOtherLabel}` : ""}</CardTitle><CardDescription className="mt-1">{[document.firstName, document.lastName].filter(Boolean).join(" ") || "Candidat"} · {document.candidateEmail}<br/>{document.originalName} · {(document.sizeBytes / 1024).toFixed(0)} Ko</CardDescription></div><div className="flex flex-wrap gap-2"><span className="rounded-full border border-cyan-800/60 bg-cyan-950/30 px-3 py-1 text-xs text-cyan-200">{document.analysisStatus === "completed" ? "Synthèse disponible" : document.analysisStatus === "needs_review" ? "Revue humaine requise" : document.analysisStatus}</span><Button variant="outline" size="sm" onClick={() => reanalyze.mutate({ id: document.id })} disabled={reanalyze.isPending || !canRequestCandidateDocumentReanalysis(document)}><RotateCcw/>Relancer l’IA</Button><Button variant="outline" size="sm" onClick={() => download.mutate({ id: document.id })} disabled={download.isPending}><Download/>Ouvrir</Button></div></CardHeader><CardContent className="grid gap-5 pt-5 lg:grid-cols-[1.1fr_0.9fr]"><div><div className="rounded-xl border border-cyan-950/60 bg-cyan-950/15 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-cyan-100"><ShieldCheck size={17}/>Synthèse IA d’aide à la revue</div><p className="mt-2 text-sm leading-6 text-muted-foreground">{document.aiSummary || "Analyse non disponible : une revue humaine est requise."}</p>{document.aiConfidence !== null && <p className="mt-3 text-xs text-cyan-200">Indice de confiance : {document.aiConfidence}% · Modèle : {document.aiModel || "non renseigné"}</p>}</div>{document.aiFlags && <p className="mt-3 flex gap-2 text-xs text-amber-400"><FileWarning size={15}/>Points à vérifier : {(() => { try { return JSON.parse(document.aiFlags).join(" · "); } catch { return document.aiFlags; } })()}</p>}</div><div className="space-y-3"><Label htmlFor={`candidate-document-note-${document.id}`}>Note de revue obligatoire</Label><Input id={`candidate-document-note-${document.id}`} value={notes[document.id] ?? document.reviewNotes ?? ""} onChange={event => setNotes(current => ({ ...current, [document.id]: event.target.value }))} placeholder="Ex. Original vérifié, date d’expiration confirmée…"/><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => review.mutate({ id: document.id, status: "reviewed", notes: notes[document.id] ?? document.reviewNotes ?? "Document vérifié par revue humaine." })} disabled={review.isPending}><FileCheck2/>Valider</Button><Button size="sm" variant="destructive" onClick={() => review.mutate({ id: document.id, status: "rejected", notes: notes[document.id] ?? document.reviewNotes ?? "Document refusé après revue humaine." })} disabled={review.isPending}>Refuser</Button><Button size="sm" variant="outline" onClick={() => review.mutate({ id: document.id, status: "archived", notes: notes[document.id] ?? document.reviewNotes ?? "Document archivé après revue humaine." })} disabled={review.isPending}>Archiver</Button></div></div></CardContent></Card>)}
    {!list.isLoading && !list.data?.length && <Card className="border-dashed"><CardContent className="py-14 text-center text-muted-foreground">Aucun document ne correspond à ce filtre.</CardContent></Card>}
  </section>;
}

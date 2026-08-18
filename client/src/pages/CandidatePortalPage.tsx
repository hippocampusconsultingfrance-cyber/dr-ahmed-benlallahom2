import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Download, FileCheck2, FileClock, FileLock2, FileUp, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

const categories = [
  ["identity_document", "Pièce d’identité"], ["medical_license", "Autorisation / licence médicale"], ["diploma", "Diplôme"], ["certificate", "Certificat professionnel"], ["professional_insurance", "Assurance professionnelle"], ["vaccination_record", "Justificatif de vaccination"], ["criminal_record", "Casier / extrait judiciaire"], ["employment_evidence", "Attestation d’emploi"], ["proof_of_address", "Justificatif de domicile"], ["other", "Autre document"],
] as const;

function labelStatus(status: string) {
  return ({ queued: "En attente d’analyse", extracting: "Extraction en cours", analyzing: "Analyse IA en cours", completed: "Analyse prête à relire", needs_review: "Revue humaine requise", failed: "Revue humaine requise" } as Record<string, string>)[status] ?? status;
}

export default function CandidatePortalPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>("diploma");
  const [otherLabel, setOtherLabel] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const me = trpc.candidatePortal.me.useQuery();
  const documents = trpc.candidatePortal.documents.useQuery(undefined, { enabled: Boolean(me.data) });
  const logout = trpc.candidatePortal.logout.useMutation({ onSuccess: () => navigate("/candidate/access") });
  const download = trpc.candidatePortal.documentDownload.useMutation({ onSuccess: data => window.open(data.url, "_blank", "noopener,noreferrer") });
  const isBusy = me.isLoading || documents.isLoading;

  useEffect(() => { if (!me.isLoading && !me.data) navigate("/candidate/access"); }, [me.data, me.isLoading, navigate]);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) { setUploadMessage("Sélectionnez un document avant de l’envoyer."); return; }
    if (category === "other" && !otherLabel.trim()) { setUploadMessage("Précisez la nature de ce document."); return; }
    setUploadMessage("Envoi sécurisé en cours…");
    const body = new FormData();
    body.set("document", file);
    body.set("category", category);
    if (category === "other") body.set("categoryOtherLabel", otherLabel.trim());
    try {
      const response = await fetch("/api/candidate/documents", { method: "POST", body, credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Le document n’a pas pu être envoyé.");
      setFile(null); setOtherLabel(""); setUploadMessage("Document reçu. Son analyse est préparée pour revue humaine.");
      const input = document.getElementById("candidate-document-file") as HTMLInputElement | null; if (input) input.value = "";
      await utils.candidatePortal.documents.invalidate();
    } catch (error) { setUploadMessage(error instanceof Error ? error.message : "Le document n’a pas pu être envoyé."); }
  }

  const firstName = me.data?.firstName || "Candidat";
  const documentCount = documents.data?.length ?? 0;
  return <main className="min-h-screen bg-[#030a12] text-slate-100"><header className="border-b border-cyan-950/70 bg-slate-950/75 px-4 py-4 backdrop-blur sm:px-8"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><FileLock2 size={20}/></span><div><p className="text-xs font-bold uppercase tracking-[0.19em] text-cyan-300">Hippocampus Consulting</p><p className="font-semibold text-white">Espace candidat sécurisé</p></div></div><Button variant="ghost" className="text-slate-300 hover:text-white" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut/>Déconnexion</Button></div></header><div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12"><div className="grid gap-5 md:grid-cols-3"><Card className="border-cyan-950/70 bg-slate-950/60 text-white md:col-span-2"><CardHeader><CardTitle className="text-3xl">Bonjour {firstName}</CardTitle><CardDescription className="text-slate-400">Votre coffre vous permet de transmettre des documents administratifs au bon moment, sans envoi par email.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-5 text-sm"><span className="flex items-center gap-2 text-cyan-200"><ShieldCheck size={18}/>Accès privé vérifié</span><span className="flex items-center gap-2 text-cyan-200"><FileCheck2 size={18}/>{documentCount} document{documentCount > 1 ? "s" : ""} dans le coffre</span></CardContent></Card><Card className="border-amber-900/50 bg-amber-950/20 text-amber-50"><CardHeader><CardTitle className="text-base">Protection des données</CardTitle><CardDescription className="leading-6 text-amber-100/75">L’IA prépare uniquement une synthèse pour notre équipe. Chaque document reste soumis à une revue humaine.</CardDescription></CardHeader></Card></div><div className="mt-8 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]"><Card className="h-fit border-cyan-950/70 bg-slate-950/60 text-white"><CardHeader><CardTitle>Déposer un document</CardTitle><CardDescription className="text-slate-400">PDF, DOC, DOCX, JPG ou PNG · 10 Mo maximum</CardDescription></CardHeader><CardContent><form onSubmit={upload} className="space-y-5"><div className="space-y-2"><Label htmlFor="candidate-document-category">Catégorie</Label><Select value={category} onValueChange={setCategory}><SelectTrigger id="candidate-document-category"><SelectValue /></SelectTrigger><SelectContent>{categories.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>{category === "other" && <div className="space-y-2"><Label htmlFor="candidate-document-other">Précisez le document</Label><Input id="candidate-document-other" value={otherLabel} onChange={event => setOtherLabel(event.target.value)} maxLength={160}/></div>}<div className="space-y-2"><Label htmlFor="candidate-document-file">Fichier</Label><Input id="candidate-document-file" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={event => setFile(event.target.files?.[0] ?? null)} required /></div>{uploadMessage && <p role="status" className="rounded-lg border border-cyan-900/60 bg-cyan-950/30 p-3 text-sm text-cyan-100">{uploadMessage}</p>}<Button type="submit" className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={!me.data}><FileUp/>Envoyer de façon sécurisée</Button></form></CardContent></Card><section><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold text-white">Mes documents</h2>{isBusy && <Loader2 className="animate-spin text-cyan-300"/>}</div><div className="space-y-4">{documents.data?.map(document => <Card key={document.id} className="border-slate-800 bg-slate-950/60 text-white"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="font-medium text-white">{categories.find(([value]) => value === document.category)?.[1] || document.category}{document.categoryOtherLabel ? ` · ${document.categoryOtherLabel}` : ""}</p><p className="mt-1 truncate text-sm text-slate-400">{document.originalName} · {(document.sizeBytes / 1024).toFixed(0)} Ko</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-cyan-800/60 bg-cyan-950/30 px-2.5 py-1 text-cyan-200">{labelStatus(document.analysisStatus)}</span>{document.aiConfidence !== null && <span className="rounded-full border border-slate-700 px-2.5 py-1 text-slate-300">Confiance IA : {document.aiConfidence}%</span>}</div>{document.aiSummary && <p className="mt-3 text-sm leading-6 text-slate-300">{document.aiSummary}</p>}{document.reviewNotes && <p className="mt-3 text-sm text-amber-200">Note de revue : {document.reviewNotes}</p>}</div><Button variant="outline" size="sm" className="shrink-0" onClick={() => download.mutate({ id: document.id })} disabled={download.isPending}><Download/>Télécharger</Button></CardContent></Card>)}{!isBusy && !documents.data?.length && <Card className="border-dashed border-slate-800 bg-transparent"><CardContent className="p-8 text-center text-slate-400"><FileClock className="mx-auto mb-3 text-slate-600"/>Aucun document n’a encore été déposé.</CardContent></Card>}</div></section></div></div></main>;
}

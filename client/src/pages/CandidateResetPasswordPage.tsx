import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { SEOHead } from "@/components/SEOHead";

export default function CandidateResetPasswordPage() {
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const reset = trpc.candidatePortal.resetPassword.useMutation({ onSuccess: () => navigate("/candidate/portal"), onError: error => setNotice(error.message) });
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";
  return <><SEOHead title="Réinitialisation du mot de passe | Hippocampus Consulting" description="Réinitialisez votre accès candidat sécurisé." noIndex /><main className="grid min-h-screen place-items-center bg-[#030a12] p-6 text-white"><form onSubmit={event => { event.preventDefault(); reset.mutate({ email, token, password }); }} className="w-full max-w-md rounded-3xl border border-cyan-950 bg-slate-950/80 p-8"><KeyRound className="text-cyan-300"/><h1 className="mt-5 text-2xl font-semibold">Nouveau mot de passe</h1><p className="mt-2 text-sm leading-6 text-slate-400">Choisissez un mot de passe unique d’au moins 15 caractères.</p><div className="mt-6 space-y-2"><Label htmlFor="new-candidate-password">Mot de passe</Label><Input id="new-candidate-password" type="password" minLength={15} value={password} onChange={event => setPassword(event.target.value)} required /></div>{notice && <p className="mt-4 text-sm text-amber-300">{notice}</p>}<Button className="mt-6 w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={reset.isPending}>{reset.isPending && <Loader2 className="animate-spin"/>}Enregistrer et accéder à mon espace</Button></form></main></>;
}

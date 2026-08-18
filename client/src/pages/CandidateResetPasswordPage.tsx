import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

export default function CandidateResetPasswordPage() {
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  const reset = trpc.candidatePortal.resetPassword.useMutation({ onSuccess: () => navigate("/candidate/portal"), onError: error => setNotice(error.message) });
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";
  return <main className="grid min-h-screen place-items-center bg-[#030a12] p-6 text-white"><form onSubmit={event => { event.preventDefault(); if (password !== passwordConfirmation) { setNotice("Les deux mots de passe doivent être identiques."); return; } reset.mutate({ email, token, password }); }} className="w-full max-w-md rounded-3xl border border-cyan-950 bg-slate-950/80 p-8"><KeyRound className="text-cyan-300"/><h1 className="mt-5 text-2xl font-semibold">Nouveau mot de passe</h1><p className="mt-2 text-sm leading-6 text-slate-400">Choisissez un mot de passe unique d’au moins 15 caractères.</p><div className="mt-6 space-y-2"><Label htmlFor="new-candidate-password">Mot de passe</Label><Input id="new-candidate-password" type="password" minLength={15} value={password} onChange={event => setPassword(event.target.value)} required /></div><div className="mt-4 space-y-2"><Label htmlFor="new-candidate-password-confirmation">Confirmer le mot de passe</Label><Input id="new-candidate-password-confirmation" type="password" minLength={15} value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} required /></div>{notice && <p className="mt-4 text-sm text-amber-300">{notice}</p>}<Button className="mt-6 w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={reset.isPending}>{reset.isPending && <Loader2 className="animate-spin"/>}Enregistrer et accéder à mon espace</Button></form></main>;
}

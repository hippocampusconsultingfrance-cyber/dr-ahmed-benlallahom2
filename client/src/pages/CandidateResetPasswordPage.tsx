import { FormEvent, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { SEOHead } from "@/components/SEOHead";
import { useLanguage } from "@/contexts/LanguageContext";
import { candidateAccountCopy, CandidateAccountLanguage } from "./candidateAccountCopy";

export default function CandidateResetPasswordPage() {
  const [, navigate] = useLocation();
  const { language } = useLanguage();
  const copy = candidateAccountCopy[(language in candidateAccountCopy ? language : "fr") as CandidateAccountLanguage];
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  const reset = trpc.candidatePortal.resetPassword.useMutation({
    onSuccess: () => navigate("/candidate/portal"),
    onError: error => setNotice(error.message || copy.genericError),
  });
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setNotice(""); if (password !== passwordConfirmation) { setNotice(copy.passwordMismatch); return; } reset.mutate({ email, token, password }); };
  return <><SEOHead title={copy.resetMetaTitle} description={copy.resetMetaDescription} noIndex /><main id="main-content" tabIndex={-1} className="grid min-h-screen place-items-center bg-[#030a12] p-6 text-white"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-cyan-950 bg-slate-950/80 p-8"><KeyRound className="text-cyan-300" aria-hidden="true"/><h1 className="mt-5 text-2xl font-semibold">{copy.resetTitle}</h1><p id="candidate-reset-password-hint" className="mt-2 text-sm leading-6 text-slate-400">{copy.resetDescription}</p><div className="mt-6 space-y-2"><Label htmlFor="new-candidate-password">{copy.password}</Label><Input id="new-candidate-password" type="password" minLength={15} autoComplete="new-password" aria-describedby="candidate-reset-password-hint" value={password} onChange={event => setPassword(event.target.value)} required /></div><div className="mt-4 space-y-2"><Label htmlFor="new-candidate-password-confirmation">{copy.confirmPassword}</Label><Input id="new-candidate-password-confirmation" type="password" minLength={15} autoComplete="new-password" aria-describedby="candidate-reset-password-hint" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} required /></div>{notice && <p role="status" className="mt-4 text-sm text-amber-300">{notice}</p>}<Button className="mt-6 w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={reset.isPending}>{reset.isPending && <Loader2 className="animate-spin" aria-hidden="true"/>}{copy.save}</Button></form></main></>;
}

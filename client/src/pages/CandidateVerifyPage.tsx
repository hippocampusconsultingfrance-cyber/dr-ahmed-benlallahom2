import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { SEOHead } from "@/components/SEOHead";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import CandidateLegalFooter from "@/components/CandidateLegalFooter";
import LanguageMenu from "@/components/LanguageMenu";
import { candidateAccountCopy, CandidateAccountLanguage } from "./candidateAccountCopy";

/**
 * Activation page opened from the emailed link. The password is chosen here,
 * after the link has proven ownership of the mailbox, and the account is
 * verified in the same server call (SEC-02 / CAND-16).
 */
export default function CandidateVerifyPage() {
  const [, navigate] = useLocation();
  const { language } = useLanguage();
  const copy = candidateAccountCopy[(language in candidateAccountCopy ? language : "fr") as CandidateAccountLanguage];
  const utils = trpc.useUtils();
  const input = useMemo(() => { const params = new URLSearchParams(window.location.search); return { email: params.get("email") ?? "", token: params.get("token") ?? "" }; }, []);
  const hasLink = Boolean(input.email && input.token);
  const details = trpc.candidatePortal.activationDetails.useQuery(input, { enabled: hasLink, retry: false, refetchOnWindowFocus: false, staleTime: Infinity });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!details.data) return;
    setFirstName(current => current || details.data.firstName);
    setLastName(current => current || details.data.lastName);
  }, [details.data]);
  const verification = trpc.candidatePortal.verifyEmail.useMutation({
    onSuccess: async () => {
      await utils.candidatePortal.me.invalidate();
      setTimeout(() => navigate("/candidate/portal"), 1200);
    },
    onError: error => setNotice(error.message || copy.genericError),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    if (password !== passwordConfirmation) { setNotice(copy.passwordMismatch); return; }
    verification.mutate({ ...input, password, firstName: firstName.trim() || undefined, lastName: lastName.trim() || undefined });
  };
  const failed = !hasLink || details.isError;
  const loading = hasLink && details.isLoading;
  const showForm = Boolean(details.data) && !verification.isSuccess;

  return <><SEOHead title={copy.verifyMetaTitle} description={copy.verifyMetaDescription} noIndex /><main id="main-content" tabIndex={-1} className="flex min-h-screen flex-col items-center justify-center bg-[#030a12] p-6 text-white"><div className="mb-4 flex w-full max-w-md justify-end"><LanguageMenu tone="candidate" /></div>
    <div className="w-full max-w-md rounded-3xl border border-cyan-950 bg-slate-950/80 p-8 sm:p-10">
      {loading && <div className="text-center"><PublicContentSkeleton cards={1} label={copy.verifyingTitle} /><h1 className="mt-5 text-2xl font-semibold">{copy.verifyingTitle}</h1><p className="mt-3 text-slate-400">{copy.verifyingDescription}</p></div>}
      {showForm && <form onSubmit={submit} aria-busy={verification.isPending}>
        <KeyRound className="text-cyan-300" aria-hidden="true" />
        <h1 className="mt-5 text-2xl font-semibold">{copy.activationTitle}</h1>
        <p id="candidate-activation-hint" className="mt-2 text-sm leading-6 text-slate-400">{copy.activationDescription}</p>
        <div className="mt-6 space-y-2"><Label htmlFor="candidate-activation-email">{copy.email}</Label><Input id="candidate-activation-email" type="email" value={details.data?.email ?? input.email} readOnly autoComplete="username" /></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="candidate-activation-first-name">{copy.firstName}</Label><Input id="candidate-activation-first-name" value={firstName} onChange={event => setFirstName(event.target.value)} maxLength={120} autoComplete="given-name" required /></div>
          <div className="space-y-2"><Label htmlFor="candidate-activation-last-name">{copy.lastName}</Label><Input id="candidate-activation-last-name" value={lastName} onChange={event => setLastName(event.target.value)} maxLength={120} autoComplete="family-name" required /></div>
        </div>
        <div className="mt-4 space-y-2"><Label htmlFor="candidate-activation-password">{copy.password}</Label><Input id="candidate-activation-password" type="password" minLength={15} maxLength={128} autoComplete="new-password" aria-describedby="candidate-activation-password-hint" value={password} onChange={event => setPassword(event.target.value)} required /><p id="candidate-activation-password-hint" className="text-xs text-slate-500">{copy.passwordHint}</p></div>
        <div className="mt-4 space-y-2"><Label htmlFor="candidate-activation-password-confirmation">{copy.confirmPassword}</Label><Input id="candidate-activation-password-confirmation" type="password" minLength={15} maxLength={128} autoComplete="new-password" aria-describedby="candidate-activation-password-hint" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} required /></div>
        {notice && <p role="status" className="mt-4 text-sm text-amber-300">{notice}</p>}
        <Button type="submit" className="mt-6 w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={verification.isPending}>{verification.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}{copy.activate}</Button>
      </form>}
      {verification.isSuccess && <div className="text-center" role="status"><CheckCircle2 className="mx-auto text-emerald-400" size={46} aria-hidden="true" /><h1 className="mt-5 text-2xl font-semibold">{copy.verifiedTitle}</h1><p className="mt-3 text-slate-400">{copy.verifiedDescription}</p></div>}
      {failed && <div className="text-center"><ShieldAlert className="mx-auto text-amber-400" size={46} aria-hidden="true" /><h1 className="mt-5 text-2xl font-semibold">{copy.invalidTitle}</h1><p className="mt-3 text-slate-400">{copy.invalidDescription}</p><button type="button" onClick={() => navigate("/candidate/access")} className="mt-6 text-cyan-300">{copy.backToAccess}</button></div>}
    </div>
    <CandidateLegalFooter />
  </main></>;
}

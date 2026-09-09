import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { SEOHead } from "@/components/SEOHead";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { candidateAccountCopy, CandidateAccountLanguage } from "./candidateAccountCopy";

export default function CandidateVerifyPage() {
  const [, navigate] = useLocation();
  const { language } = useLanguage();
  const copy = candidateAccountCopy[(language in candidateAccountCopy ? language : "fr") as CandidateAccountLanguage];
  const input = useMemo(() => { const params = new URLSearchParams(window.location.search); return { email: params.get("email") ?? "", token: params.get("token") ?? "" }; }, []);
  const verification = trpc.candidatePortal.verifyEmail.useMutation({ onSuccess: () => setTimeout(() => navigate("/candidate/portal"), 1200) });
  useEffect(() => { if (input.email && input.token && !verification.isPending && !verification.isSuccess && !verification.error) verification.mutate(input); }, [input, verification]);
  const failed = Boolean(verification.error) || !input.email || !input.token;
  return <><SEOHead title={copy.verifyMetaTitle} description={copy.verifyMetaDescription} noIndex /><main id="main-content" tabIndex={-1} className="grid min-h-screen place-items-center bg-[#030a12] p-6 text-center text-white"><div className="w-full max-w-md rounded-3xl border border-cyan-950 bg-slate-950/80 p-10">{verification.isPending && <><PublicContentSkeleton cards={1} label={copy.verifyingTitle} /><h1 className="mt-5 text-2xl font-semibold">{copy.verifyingTitle}</h1><p className="mt-3 text-slate-400">{copy.verifyingDescription}</p></>}{verification.isSuccess && <><CheckCircle2 className="mx-auto text-emerald-400" size={46} aria-hidden="true"/><h1 className="mt-5 text-2xl font-semibold">{copy.verifiedTitle}</h1><p className="mt-3 text-slate-400">{copy.verifiedDescription}</p></>}{failed && <><ShieldAlert className="mx-auto text-amber-400" size={46} aria-hidden="true"/><h1 className="mt-5 text-2xl font-semibold">{copy.invalidTitle}</h1><p className="mt-3 text-slate-400">{copy.invalidDescription}</p><button onClick={() => navigate("/candidate/access")} className="mt-6 text-cyan-300">{copy.backToAccess}</button></>}</div></main></>;
}

import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { SEOHead } from "@/components/SEOHead";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";

export default function CandidateVerifyPage() {
  const [, navigate] = useLocation();
  const input = useMemo(() => { const params = new URLSearchParams(window.location.search); return { email: params.get("email") ?? "", token: params.get("token") ?? "" }; }, []);
  const verification = trpc.candidatePortal.verifyEmail.useMutation({ onSuccess: () => setTimeout(() => navigate("/candidate/portal"), 1200) });
  useEffect(() => { if (input.email && input.token && !verification.isPending && !verification.isSuccess && !verification.error) verification.mutate(input); }, [input, verification]);
  const failed = Boolean(verification.error) || !input.email || !input.token;
  return <><SEOHead title="Vérification de compte | Hippocampus Consulting" description="Vérifiez votre accès candidat sécurisé." noIndex /><main className="grid min-h-screen place-items-center bg-[#030a12] p-6 text-center text-white"><div className="w-full max-w-md rounded-3xl border border-cyan-950 bg-slate-950/80 p-10">{verification.isPending && <><PublicContentSkeleton cards={1} label="Vérification sécurisée du compte candidat" /><h1 className="mt-5 text-2xl font-semibold">Vérification sécurisée…</h1><p className="mt-3 text-slate-400">Validation de votre lien d’activation en cours.</p></>}{verification.isSuccess && <><CheckCircle2 className="mx-auto text-emerald-400" size={46}/><h1 className="mt-5 text-2xl font-semibold">Votre espace est activé</h1><p className="mt-3 text-slate-400">Redirection vers votre coffre documentaire.</p></>}{failed && <><ShieldAlert className="mx-auto text-amber-400" size={46}/><h1 className="mt-5 text-2xl font-semibold">Lien indisponible</h1><p className="mt-3 text-slate-400">Ce lien est invalide ou a expiré. Demandez un nouveau lien depuis l’espace candidat.</p><button onClick={() => navigate("/candidate/access")} className="mt-6 text-cyan-300">Retour à la connexion</button></>}</div></main></>;
}

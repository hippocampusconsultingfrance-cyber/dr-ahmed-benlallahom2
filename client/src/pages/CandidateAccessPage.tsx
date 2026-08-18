import { useState } from "react";
import { useLocation } from "wouter";
import { FileLock2, KeyRound, Loader2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { SEOHead } from "@/components/SEOHead";

type Mode = "login" | "register" | "forgot";

export default function CandidateAccessPage() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [terms, setTerms] = useState(false);
  const [documentConsent, setDocumentConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const login = trpc.candidatePortal.login.useMutation({
    onSuccess: () => navigate("/candidate/portal"),
    onError: error => setNotice(error.message),
  });
  const register = trpc.candidatePortal.register.useMutation({
    onSuccess: data => setNotice(data.message),
    onError: error => setNotice(error.message),
  });
  const reset = trpc.candidatePortal.requestPasswordReset.useMutation({
    onSuccess: data => setNotice(data.message),
    onError: error => setNotice(error.message),
  });
  const pending = login.isPending || register.isPending || reset.isPending;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setNotice("");
    if (mode === "login") {
      login.mutate({ email, password });
    } else if (mode === "register") {
      if (password !== passwordConfirmation) { setNotice("Les deux mots de passe doivent être identiques."); return; }
      if (!turnstileToken) { setNotice("Veuillez effectuer la vérification anti-bot avant de créer votre accès."); return; }
      register.mutate({ email, password, firstName, lastName, termsAccepted: terms, documentConsent, turnstileToken });
    } else {
      if (!turnstileToken) { setNotice("Veuillez effectuer la vérification anti-bot avant de demander un lien."); return; }
      reset.mutate({ email, turnstileToken });
    }
  }

  const title = mode === "login" ? "Accéder à mon espace" : mode === "register" ? "Créer mon espace candidat" : "Réinitialiser mon accès";
  const description = mode === "login" ? "Consultez et déposez vos documents administratifs en toute confidentialité." : mode === "register" ? "Créez un accès personnel pour transmettre et suivre vos documents." : "Nous vous enverrons un lien sécurisé si un compte correspond à cet email.";

  return (
    <main className="min-h-screen bg-[#030a12] px-4 py-10 text-slate-100 sm:py-16">
      <SEOHead title="Espace candidat sécurisé | Hippocampus Consulting" description="Créez ou accédez à votre espace candidat sécurisé." noIndex />
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-cyan-950/80 bg-slate-950/60 shadow-2xl shadow-cyan-950/20 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative overflow-hidden border-b border-cyan-950/70 bg-[radial-gradient(circle_at_25%_15%,rgba(8,145,178,0.26),transparent_42%),linear-gradient(150deg,#06243a,#06121e)] p-7 sm:p-10 lg:border-b-0 lg:border-r">
          <div className="absolute -right-16 -top-12 h-56 w-56 rounded-full border border-cyan-300/20" />
          <div className="relative">
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10 text-cyan-300"><FileLock2 size={24} /></div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Hippocampus Consulting</p>
            <h1 className="mt-3 font-serif text-4xl leading-tight text-white">Votre espace candidat sécurisé</h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-300">Déposez vos pièces administratives dans un coffre documentaire privé. Chaque analyse IA aide notre équipe à préparer la revue ; aucune décision n’est prise automatiquement.</p>
            <div className="mt-8 space-y-4 text-sm text-slate-200">
              {["Accès personnel par email et mot de passe", "Documents privés et téléchargements autorisés", "Analyse assistée suivie d’une revue humaine"].map(item => <div key={item} className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-cyan-300" size={18} /><span>{item}</span></div>)}
            </div>
          </div>
        </section>
        <section className="p-5 sm:p-10">
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader className="px-0 pt-0"><CardTitle className="text-2xl text-white">{title}</CardTitle><CardDescription className="mt-2 leading-6 text-slate-400">{description}</CardDescription></CardHeader>
            <CardContent className="px-0">
              <form className="space-y-5" onSubmit={submit}>
                {mode === "register" && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="candidate-first-name">Prénom</Label><Input id="candidate-first-name" value={firstName} onChange={event => setFirstName(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="candidate-last-name">Nom</Label><Input id="candidate-last-name" value={lastName} onChange={event => setLastName(event.target.value)} required /></div></div>}
                <div className="space-y-2"><Label htmlFor="candidate-email">Email professionnel</Label><Input id="candidate-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></div>
              {mode !== "forgot" && <div className="space-y-2"><Label htmlFor="candidate-password">Mot de passe</Label><Input id="candidate-password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} minLength={15} required /><p className="text-xs text-slate-500">Minimum 15 caractères. Choisissez un mot de passe long et unique.</p></div>}
              {mode === "register" && <div className="space-y-2"><Label htmlFor="candidate-password-confirmation">Confirmer le mot de passe</Label><Input id="candidate-password-confirmation" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} minLength={15} required /></div>}
              {mode === "register" && <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/45 p-4 text-sm"><label className="flex cursor-pointer gap-3"><Checkbox checked={terms} onCheckedChange={value => setTerms(value === true)} /><span>J’accepte les conditions d’utilisation et la politique de confidentialité.</span></label><label className="flex cursor-pointer gap-3"><Checkbox checked={documentConsent} onCheckedChange={value => setDocumentConsent(value === true)} /><span>Je consens au traitement confidentiel de mes documents administratifs et à une analyse IA d’aide à la revue humaine.</span></label></div>}
              {(mode === "register" || mode === "forgot") && <TurnstileWidget onToken={setTurnstileToken} />}
                {notice && <p role="status" className="rounded-lg border border-cyan-800/50 bg-cyan-950/30 p-3 text-sm text-cyan-100">{notice}</p>}
                <Button type="submit" className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : mode === "login" ? <LogIn /> : mode === "register" ? <UserPlus /> : <KeyRound />}{mode === "login" ? "Se connecter" : mode === "register" ? "Créer mon accès" : "Recevoir un lien sécurisé"}</Button>
              </form>
              <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-3 text-sm"><button type="button" onClick={() => { setMode("login"); setTurnstileToken(null); setNotice(""); }} className="text-cyan-300 hover:text-cyan-200">Connexion</button><button type="button" onClick={() => { setMode("register"); setTurnstileToken(null); setNotice(""); }} className="text-cyan-300 hover:text-cyan-200">Créer un accès</button><button type="button" onClick={() => { setMode("forgot"); setTurnstileToken(null); setNotice(""); }} className="text-slate-400 hover:text-white">Mot de passe oublié</button></div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

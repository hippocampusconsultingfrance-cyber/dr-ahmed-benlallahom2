import { FormEvent, useEffect, useState } from "react";
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
import { useLanguage } from "@/contexts/LanguageContext";

type Mode = "login" | "register" | "forgot";

export const candidateAccessCopy = {
  fr: {
    metaTitle: "Espace candidat sécurisé | Hippocampus Consulting",
    metaDescription: "Créez ou accédez à votre espace candidat sécurisé.",
    brandTitle: "Votre espace candidat sécurisé",
    brandDescription: "Déposez vos pièces administratives dans un coffre documentaire privé. Chaque analyse IA aide notre équipe à préparer la revue ; aucune décision n’est prise automatiquement.",
    safeguards: ["Accès personnel par email et mot de passe", "Documents privés et téléchargements autorisés", "Analyse assistée suivie d’une revue humaine"],
    loginTitle: "Accéder à mon espace",
    registerTitle: "Créer mon espace candidat",
    forgotTitle: "Réinitialiser mon accès",
    loginDescription: "Consultez et déposez vos documents administratifs en toute confidentialité.",
    registerDescription: "Créez un accès personnel pour transmettre et suivre vos documents.",
    forgotDescription: "Nous vous enverrons un lien sécurisé si un compte correspond à cet email.",
    firstName: "Prénom",
    lastName: "Nom",
    email: "Email professionnel",
    password: "Mot de passe",
    passwordHint: "Minimum 15 caractères. Choisissez un mot de passe long et unique.",
    confirmPassword: "Confirmer le mot de passe",
    terms: "J’accepte les conditions d’utilisation et la politique de confidentialité.",
    documentConsent: "Je consens au traitement confidentiel de mes documents administratifs et à une analyse IA d’aide à la revue humaine.",
    login: "Se connecter",
    register: "Créer mon accès",
    reset: "Recevoir un lien sécurisé",
    navigationLogin: "Connexion",
    navigationRegister: "Créer un accès",
    navigationForgot: "Mot de passe oublié",
    passwordMismatch: "Les deux mots de passe doivent être identiques.",
    termsMissing: "Veuillez accepter les conditions d’utilisation et la politique de confidentialité pour continuer.",
    documentConsentMissing: "Veuillez consentir au traitement confidentiel de vos documents pour continuer.",
    bothConsentMissing: "Veuillez accepter les conditions d’utilisation et consentir au traitement confidentiel de vos documents avant de créer votre accès.",
    turnstileRegisterMissing: "Veuillez effectuer la vérification anti-bot avant de créer votre accès.",
    turnstileResetMissing: "Veuillez effectuer la vérification anti-bot avant de demander un lien.",
    turnstileError: "La vérification anti-bot n’a pas abouti. Réessayez le contrôle avant de soumettre le formulaire.",
    genericError: "Cette action n’a pas pu être finalisée. Vérifiez vos informations et réessayez.",
    registerSuccess: "Votre demande d’accès a été enregistrée. Vérifiez votre email, y compris vos courriers indésirables, pour activer votre compte.",
    resetSuccess: "Si un compte correspond à cet email, un lien sécurisé de réinitialisation vous sera envoyé.",
    invitationWelcome: "Votre invitation a été vérifiée. Créez maintenant votre mot de passe ; l’activation de votre adresse email restera obligatoire.",
    invitationInvalid: "Cette invitation est invalide ou expirée. Vous pouvez demander un nouveau lien à notre équipe.",
  },
  en: {
    metaTitle: "Secure candidate portal | Hippocampus Consulting",
    metaDescription: "Create or access your secure candidate portal.",
    brandTitle: "Your secure candidate portal",
    brandDescription: "Upload your administrative documents to a private vault. AI analysis helps our team prepare its review; no decision is made automatically.",
    safeguards: ["Personal access by email and password", "Private documents and authorised downloads", "Assisted analysis followed by human review"],
    loginTitle: "Access my portal",
    registerTitle: "Create my candidate portal",
    forgotTitle: "Reset my access",
    loginDescription: "View and upload your administrative documents confidentially.",
    registerDescription: "Create personal access to send and follow your documents.",
    forgotDescription: "We will send you a secure link if an account matches this email.",
    firstName: "First name",
    lastName: "Last name",
    email: "Professional email",
    password: "Password",
    passwordHint: "At least 15 characters. Choose a long, unique password.",
    confirmPassword: "Confirm password",
    terms: "I accept the terms of use and privacy policy.",
    documentConsent: "I consent to the confidential processing of my administrative documents and AI analysis supporting human review.",
    login: "Sign in",
    register: "Create my access",
    reset: "Receive a secure link",
    navigationLogin: "Sign in",
    navigationRegister: "Create access",
    navigationForgot: "Forgot password",
    passwordMismatch: "Both passwords must match.",
    termsMissing: "Please accept the terms of use and privacy policy to continue.",
    documentConsentMissing: "Please consent to the confidential processing of your documents to continue.",
    bothConsentMissing: "Please accept the terms of use and consent to the confidential processing of your documents before creating your access.",
    turnstileRegisterMissing: "Please complete the anti-bot verification before creating your access.",
    turnstileResetMissing: "Please complete the anti-bot verification before requesting a link.",
    turnstileError: "Anti-bot verification did not complete. Please try the check again before submitting the form.",
    genericError: "This action could not be completed. Check your information and try again.",
    registerSuccess: "Your access request has been registered. Check your email, including your spam folder, to activate your account.",
    resetSuccess: "If an account matches this email, a secure reset link will be sent to you.",
    invitationWelcome: "Your invitation has been verified. Create your password now; email activation will still be required.",
    invitationInvalid: "This invitation is invalid or expired. You can request a new link from our team.",
  },
  de: {
    metaTitle: "Sicheres Kandidatenportal | Hippocampus Consulting",
    metaDescription: "Erstellen Sie Ihren sicheren Kandidatenzugang oder melden Sie sich an.",
    brandTitle: "Ihr sicheres Kandidatenportal",
    brandDescription: "Laden Sie Ihre Verwaltungsdokumente in einen privaten Dokumententresor hoch. Die KI-Analyse unterstützt unser Team bei der Prüfung; es wird keine Entscheidung automatisch getroffen.",
    safeguards: ["Persönlicher Zugang per E-Mail und Passwort", "Private Dokumente und autorisierte Downloads", "Unterstützte Analyse mit anschließender menschlicher Prüfung"],
    loginTitle: "Mein Portal öffnen",
    registerTitle: "Mein Kandidatenportal erstellen",
    forgotTitle: "Zugang zurücksetzen",
    loginDescription: "Sehen Sie Ihre Verwaltungsdokumente ein und laden Sie sie vertraulich hoch.",
    registerDescription: "Erstellen Sie einen persönlichen Zugang, um Ihre Dokumente zu übermitteln und zu verfolgen.",
    forgotDescription: "Wir senden Ihnen einen sicheren Link, wenn ein Konto zu dieser E-Mail passt.",
    firstName: "Vorname",
    lastName: "Nachname",
    email: "Berufliche E-Mail",
    password: "Passwort",
    passwordHint: "Mindestens 15 Zeichen. Wählen Sie ein langes, eindeutiges Passwort.",
    confirmPassword: "Passwort bestätigen",
    terms: "Ich akzeptiere die Nutzungsbedingungen und die Datenschutzrichtlinie.",
    documentConsent: "Ich stimme der vertraulichen Verarbeitung meiner Verwaltungsdokumente und einer KI-Analyse zur Unterstützung der menschlichen Prüfung zu.",
    login: "Anmelden",
    register: "Zugang erstellen",
    reset: "Sicheren Link erhalten",
    navigationLogin: "Anmelden",
    navigationRegister: "Zugang erstellen",
    navigationForgot: "Passwort vergessen",
    passwordMismatch: "Die beiden Passwörter müssen übereinstimmen.",
    termsMissing: "Bitte akzeptieren Sie die Nutzungsbedingungen und Datenschutzrichtlinie, um fortzufahren.",
    documentConsentMissing: "Bitte stimmen Sie der vertraulichen Verarbeitung Ihrer Dokumente zu, um fortzufahren.",
    bothConsentMissing: "Bitte akzeptieren Sie die Nutzungsbedingungen und stimmen Sie der vertraulichen Verarbeitung Ihrer Dokumente zu, bevor Sie Ihren Zugang erstellen.",
    turnstileRegisterMissing: "Bitte schließen Sie die Bot-Prüfung ab, bevor Sie Ihren Zugang erstellen.",
    turnstileResetMissing: "Bitte schließen Sie die Bot-Prüfung ab, bevor Sie einen Link anfordern.",
    turnstileError: "Die Bot-Prüfung wurde nicht abgeschlossen. Bitte versuchen Sie die Prüfung erneut, bevor Sie das Formular senden.",
    genericError: "Diese Aktion konnte nicht abgeschlossen werden. Prüfen Sie Ihre Angaben und versuchen Sie es erneut.",
    registerSuccess: "Ihre Zugangsanfrage wurde registriert. Prüfen Sie Ihre E-Mails einschließlich Spam-Ordner, um Ihr Konto zu aktivieren.",
    resetSuccess: "Wenn ein Konto zu dieser E-Mail passt, erhalten Sie einen sicheren Link zum Zurücksetzen.",
    invitationWelcome: "Ihre Einladung wurde geprüft. Erstellen Sie jetzt Ihr Passwort; die E-Mail-Aktivierung bleibt verpflichtend.",
    invitationInvalid: "Diese Einladung ist ungültig oder abgelaufen. Sie können unser Team um einen neuen Link bitten.",
  },
  zh: {
    metaTitle: "安全候选人门户 | Hippocampus Consulting",
    metaDescription: "创建或访问您的安全候选人门户。",
    brandTitle: "您的安全候选人门户",
    brandDescription: "请将您的行政文件上传至私密文档库。AI 分析协助团队准备审核；系统不会自动做出任何决定。",
    safeguards: ["通过电子邮件和密码进行个人访问", "私密文件和经授权的下载", "辅助分析后进行人工审核"],
    loginTitle: "访问我的门户",
    registerTitle: "创建我的候选人门户",
    forgotTitle: "重置我的访问权限",
    loginDescription: "以保密方式查看和上传您的行政文件。",
    registerDescription: "创建个人访问权限，以提交和跟踪您的文件。",
    forgotDescription: "如果此电子邮件对应账户，我们将向您发送安全链接。",
    firstName: "名字",
    lastName: "姓氏",
    email: "职业邮箱",
    password: "密码",
    passwordHint: "至少 15 个字符。请选择一个长且唯一的密码。",
    confirmPassword: "确认密码",
    terms: "我接受使用条款和隐私政策。",
    documentConsent: "我同意对我的行政文件进行保密处理，并接受用于支持人工审核的 AI 分析。",
    login: "登录",
    register: "创建访问权限",
    reset: "接收安全链接",
    navigationLogin: "登录",
    navigationRegister: "创建访问权限",
    navigationForgot: "忘记密码",
    passwordMismatch: "两次输入的密码必须一致。",
    termsMissing: "请接受使用条款和隐私政策以继续。",
    documentConsentMissing: "请同意对您的文件进行保密处理以继续。",
    bothConsentMissing: "创建访问权限前，请接受使用条款并同意对您的文件进行保密处理。",
    turnstileRegisterMissing: "创建访问权限前，请完成反机器人验证。",
    turnstileResetMissing: "请求链接前，请完成反机器人验证。",
    turnstileError: "反机器人验证未完成。提交表单前请重新验证。",
    genericError: "无法完成此操作。请检查您的信息后重试。",
    registerSuccess: "您的访问请求已登记。请检查您的邮箱（包括垃圾邮件文件夹）以激活账户。",
    resetSuccess: "如果此电子邮件对应账户，我们将向您发送安全的重置链接。",
    invitationWelcome: "您的邀请已验证。现在请创建密码；仍必须完成电子邮件激活。",
    invitationInvalid: "此邀请无效或已过期。您可以向我们的团队申请新的链接。",
  },
} as const;

type CandidateLanguage = keyof typeof candidateAccessCopy;
type CandidateCopy = (typeof candidateAccessCopy)[CandidateLanguage];

export function candidateNotice(message: string, copy: CandidateCopy) {
  if (message.includes("termsAccepted") && message.includes("documentConsent")) return copy.bothConsentMissing;
  if (message.includes("termsAccepted")) return copy.termsMissing;
  if (message.includes("documentConsent")) return copy.documentConsentMissing;
  if (message.includes("candidate_turnstile")) return copy.turnstileError;
  if (message.toLowerCase().includes("invitation")) return copy.invitationInvalid;
  return copy.genericError;
}

export type CandidateInvitationEntry = {
  token: string | null;
  legacyEmail: string | null;
};

/**
 * Supports the current signed invitation format and old links already delivered
 * to candidates. The legacy email is only used to prefill registration; account
 * activation and all authorization still happen server-side.
 */
export function getCandidateInvitationEntry(search: string): CandidateInvitationEntry {
  const params = new URLSearchParams(search);
  const invite = params.get("invite")?.trim() || "";
  const token = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(invite) ? invite : null;
  const legacyEmail = invite === "1"
    ? (params.get("email")?.trim().toLowerCase() || null)
    : null;
  return { token, legacyEmail };
}

export function getCandidateInvitationToken(search: string): string | null {
  return getCandidateInvitationEntry(search).token;
}

export default function CandidateAccessPage() {
  const [, navigate] = useLocation();
  const { language } = useLanguage();
  const copy = candidateAccessCopy[(language in candidateAccessCopy ? language : "fr") as CandidateLanguage];
  const [invitationEntry] = useState(() => getCandidateInvitationEntry(typeof window === "undefined" ? "" : window.location.search));
  const invitationToken = invitationEntry.token;
  const [mode, setMode] = useState<Mode>(() => invitationToken || invitationEntry.legacyEmail ? "register" : "login");
  const [email, setEmail] = useState(() => invitationEntry.legacyEmail || "");
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
    onError: error => setNotice(candidateNotice(error.message, copy)),
  });
  const register = trpc.candidatePortal.register.useMutation({
    onSuccess: () => setNotice(copy.registerSuccess),
    onError: error => setNotice(candidateNotice(error.message, copy)),
  });
  const reset = trpc.candidatePortal.requestPasswordReset.useMutation({
    onSuccess: () => setNotice(copy.resetSuccess),
    onError: error => setNotice(candidateNotice(error.message, copy)),
  });
  const invitation = trpc.candidatePortal.resolveInvitation.useQuery(
    { token: invitationToken || "invalid" },
    { enabled: Boolean(invitationToken), retry: false },
  );
  useEffect(() => {
    if (invitationToken || invitationEntry.legacyEmail) setMode("register");
    if (invitation.data) {
      setMode("register");
      setEmail(invitation.data.email);
      setFirstName(invitation.data.firstName);
      setLastName(invitation.data.lastName);
      setNotice(copy.invitationWelcome);
    } else if (invitationEntry.legacyEmail) {
      setEmail(invitationEntry.legacyEmail);
      setNotice(copy.invitationWelcome);
    } else if (invitationToken && invitation.isError) {
      setNotice(copy.invitationInvalid);
    }
  }, [copy.invitationInvalid, copy.invitationWelcome, invitation.data, invitation.isError, invitationEntry.legacyEmail, invitationToken]);
  const pending = login.isPending || register.isPending || reset.isPending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    if (mode === "login") {
      login.mutate({ email, password });
    } else if (mode === "register") {
      if (password !== passwordConfirmation) { setNotice(copy.passwordMismatch); return; }
      if (!terms || !documentConsent) {
        setNotice(!terms && !documentConsent ? copy.bothConsentMissing : !terms ? copy.termsMissing : copy.documentConsentMissing);
        return;
      }
      if (!turnstileToken) { setNotice(copy.turnstileRegisterMissing); return; }
      register.mutate({ email, password, firstName, lastName, termsAccepted: terms, documentConsent, turnstileToken, invitationToken: invitationToken || undefined });
    } else {
      if (!turnstileToken) { setNotice(copy.turnstileResetMissing); return; }
      reset.mutate({ email, turnstileToken });
    }
  }

  const title = mode === "login" ? copy.loginTitle : mode === "register" ? copy.registerTitle : copy.forgotTitle;
  const description = mode === "login" ? copy.loginDescription : mode === "register" ? copy.registerDescription : copy.forgotDescription;

  return (
    <main className="min-h-screen bg-[#030a12] px-4 py-10 text-slate-100 sm:py-16">
      <SEOHead title={copy.metaTitle} description={copy.metaDescription} noIndex />
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-cyan-950/80 bg-slate-950/60 shadow-2xl shadow-cyan-950/20 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative overflow-hidden border-b border-cyan-950/70 bg-[radial-gradient(circle_at_25%_15%,rgba(8,145,178,0.26),transparent_42%),linear-gradient(150deg,#06243a,#06121e)] p-7 sm:p-10 lg:border-b-0 lg:border-r">
          <div className="absolute -right-16 -top-12 h-56 w-56 rounded-full border border-cyan-300/20" />
          <div className="relative">
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10 text-cyan-300"><FileLock2 size={24} /></div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Hippocampus Consulting</p>
            <h1 className="mt-3 font-serif text-4xl leading-tight text-white">{copy.brandTitle}</h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-300">{copy.brandDescription}</p>
            <div className="mt-8 space-y-4 text-sm text-slate-200">
              {copy.safeguards.map(item => <div key={item} className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-cyan-300" size={18} /><span>{item}</span></div>)}
            </div>
          </div>
        </section>
        <section className="p-5 sm:p-10">
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader className="px-0 pt-0"><CardTitle className="text-2xl text-white">{title}</CardTitle><CardDescription className="mt-2 leading-6 text-slate-400">{description}</CardDescription></CardHeader>
            <CardContent className="px-0">
              <form className="space-y-5" onSubmit={submit}>
                {mode === "register" && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="candidate-first-name">{copy.firstName}</Label><Input id="candidate-first-name" value={firstName} onChange={event => setFirstName(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="candidate-last-name">{copy.lastName}</Label><Input id="candidate-last-name" value={lastName} onChange={event => setLastName(event.target.value)} required /></div></div>}
                <div className="space-y-2"><Label htmlFor="candidate-email">{copy.email}</Label><Input id="candidate-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} readOnly={mode === "register" && Boolean(invitationToken && invitation.data)} required /></div>
                {mode !== "forgot" && <div className="space-y-2"><Label htmlFor="candidate-password">{copy.password}</Label><Input id="candidate-password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} minLength={15} required /><p className="text-xs text-slate-500">{copy.passwordHint}</p></div>}
                {mode === "register" && <div className="space-y-2"><Label htmlFor="candidate-password-confirmation">{copy.confirmPassword}</Label><Input id="candidate-password-confirmation" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} minLength={15} required /></div>}
                {mode === "register" && <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/45 p-4 text-sm"><label className="flex cursor-pointer gap-3"><Checkbox checked={terms} onCheckedChange={value => setTerms(value === true)} /><span>{copy.terms}</span></label><label className="flex cursor-pointer gap-3"><Checkbox checked={documentConsent} onCheckedChange={value => setDocumentConsent(value === true)} /><span>{copy.documentConsent}</span></label></div>}
                {(mode === "register" || mode === "forgot") && <TurnstileWidget onToken={setTurnstileToken} />}
                {notice && <p role="status" className="rounded-lg border border-cyan-800/50 bg-cyan-950/30 p-3 text-sm text-cyan-100">{notice}</p>}
                <Button type="submit" className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : mode === "login" ? <LogIn /> : mode === "register" ? <UserPlus /> : <KeyRound />}{mode === "login" ? copy.login : mode === "register" ? copy.register : copy.reset}</Button>
              </form>
              <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-3 text-sm"><button type="button" onClick={() => { setMode("login"); setTurnstileToken(null); setNotice(""); }} className="text-cyan-300 hover:text-cyan-200">{copy.navigationLogin}</button><button type="button" onClick={() => { setMode("register"); setTurnstileToken(null); setNotice(""); }} className="text-cyan-300 hover:text-cyan-200">{copy.navigationRegister}</button><button type="button" onClick={() => { setMode("forgot"); setTurnstileToken(null); setNotice(""); }} className="text-slate-400 hover:text-white">{copy.navigationForgot}</button></div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

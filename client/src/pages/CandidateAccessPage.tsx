import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { FileLock2, KeyRound, Loader2, LogIn, MailCheck, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { SEOHead } from "@/components/SEOHead";
import { useLanguage } from "@/contexts/LanguageContext";

type Mode = "login" | "register" | "forgot" | "activation";

export function candidateModeFocusTarget(mode: Mode): string {
  return mode === "register" ? "candidate-first-name" : "candidate-email";
}

export const candidateAccessCopy = {
  fr: {
    metaTitle: "Espace candidat sécurisé | Hippocampus Consulting",
    metaDescription: "Créez ou accédez à votre espace candidat sécurisé.",
    brandTitle: "Votre espace candidat sécurisé",
    brandDescription: "Déposez vos pièces administratives dans un coffre documentaire privé. Vos documents professionnels bénéficient d’une synthèse IA qui aide notre équipe à préparer la revue ; vos pièces d’identité sont vérifiées uniquement par une personne. Aucune décision n’est prise automatiquement.",
    safeguards: ["Accès personnel par email et mot de passe", "Documents privés et téléchargements autorisés", "Analyse assistée suivie d’une revue humaine"],
    loginTitle: "Accéder à mon espace",
    registerTitle: "Créer mon espace candidat",
    forgotTitle: "Réinitialiser mon accès",
    activationTitle: "Renvoyer l’e-mail d’activation",
    loginDescription: "Consultez et déposez vos documents administratifs en toute confidentialité.",
    registerDescription: "Indiquez votre identité. Vous choisirez votre mot de passe depuis le lien d’activation envoyé par email, une fois votre adresse confirmée.",
    forgotDescription: "Nous vous enverrons un lien sécurisé si un compte correspond à cet email.",
    activationDescription: "Demandez un nouveau lien si votre compte a été créé mais n’est pas encore activé.",
    firstName: "Prénom",
    lastName: "Nom",
    email: "Email",
    password: "Mot de passe",
    passwordHint: "Minimum 15 caractères. Choisissez un mot de passe long et unique.",
    confirmPassword: "Confirmer le mot de passe",
    terms: "J’accepte les conditions d’utilisation et la politique de confidentialité.",
    documentConsent: "Je consens au traitement confidentiel de mes documents administratifs et à une analyse IA de mes documents professionnels (diplômes, licences, certificats) en aide à la revue humaine. Les pièces d’identité ne sont jamais analysées par l’IA.",
    login: "Se connecter",
    register: "Créer mon accès",
    reset: "Recevoir un lien sécurisé",
    resendActivation: "Renvoyer le lien d’activation",
    navigationLogin: "Connexion",
    navigationRegister: "Créer un accès",
    navigationForgot: "Mot de passe oublié",
    navigationActivation: "E-mail d’activation non reçu",
    passwordMismatch: "Les deux mots de passe doivent être identiques.",
    termsMissing: "Veuillez accepter les conditions d’utilisation et la politique de confidentialité pour continuer.",
    documentConsentMissing: "Veuillez consentir au traitement confidentiel de vos documents pour continuer.",
    bothConsentMissing: "Veuillez accepter les conditions d’utilisation et consentir au traitement confidentiel de vos documents avant de créer votre accès.",
    turnstileRegisterMissing: "Veuillez effectuer la vérification anti-bot avant de créer votre accès.",
    turnstileResetMissing: "Veuillez effectuer la vérification anti-bot avant de demander un lien.",
    turnstileActivationMissing: "Veuillez effectuer la vérification anti-bot avant de renvoyer le lien d’activation.",
    turnstileError: "La vérification anti-bot n’a pas abouti. Réessayez le contrôle avant de soumettre le formulaire.",
    genericError: "Cette action n’a pas pu être finalisée. Vérifiez vos informations et réessayez.",
    registerSuccess: "Votre demande d’accès a été enregistrée. Ouvrez le lien reçu par email (vérifiez aussi vos courriers indésirables) pour confirmer votre adresse et choisir votre mot de passe.",
    resetSuccess: "Si un compte correspond à cet email, un lien sécurisé de réinitialisation vous sera envoyé.",
    activationSuccess: "Si un compte non activé correspond à cet email, un nouveau lien d’activation vous sera envoyé. Vérifiez aussi vos courriers indésirables.",
    invitationWelcome: "Votre invitation a été vérifiée. Confirmez vos informations : vous choisirez ensuite votre mot de passe depuis le lien d’activation envoyé par email.",
    invitationInvalid: "Ce lien d’invitation n’est pas valide. Vous pouvez tout de même créer votre espace ci-dessous avec l’adresse email utilisée pour votre candidature.",
    invitationExpired: "Votre lien d’invitation a expiré, mais vous pouvez créer votre espace ci-dessous : votre adresse email est préremplie et votre candidature sera rattachée automatiquement.",
  },
  en: {
    metaTitle: "Secure candidate portal | Hippocampus Consulting",
    metaDescription: "Create or access your secure candidate portal.",
    brandTitle: "Your secure candidate portal",
    brandDescription: "Upload your administrative documents to a private vault. Your professional documents receive an AI summary that helps our team prepare its review; identity documents are checked by a person only. No decision is made automatically.",
    safeguards: ["Personal access by email and password", "Private documents and authorised downloads", "Assisted analysis followed by human review"],
    loginTitle: "Access my portal",
    registerTitle: "Create my candidate portal",
    forgotTitle: "Reset my access",
    activationTitle: "Resend the activation email",
    loginDescription: "View and upload your administrative documents confidentially.",
    registerDescription: "Enter your details. You will choose your password from the activation link sent by email, once your address is confirmed.",
    forgotDescription: "We will send you a secure link if an account matches this email.",
    activationDescription: "Request a new link if your account was created but has not yet been activated.",
    firstName: "First name",
    lastName: "Last name",
    email: "Professional email",
    password: "Password",
    passwordHint: "At least 15 characters. Choose a long, unique password.",
    confirmPassword: "Confirm password",
    terms: "I accept the terms of use and privacy policy.",
    documentConsent: "I consent to the confidential processing of my administrative documents and to AI analysis of my professional documents (diplomas, licences, certificates) supporting human review. Identity documents are never analysed by AI.",
    login: "Sign in",
    register: "Create my access",
    reset: "Receive a secure link",
    resendActivation: "Resend activation link",
    navigationLogin: "Sign in",
    navigationRegister: "Create access",
    navigationForgot: "Forgot password",
    navigationActivation: "Activation email not received",
    passwordMismatch: "Both passwords must match.",
    termsMissing: "Please accept the terms of use and privacy policy to continue.",
    documentConsentMissing: "Please consent to the confidential processing of your documents to continue.",
    bothConsentMissing: "Please accept the terms of use and consent to the confidential processing of your documents before creating your access.",
    turnstileRegisterMissing: "Please complete the anti-bot verification before creating your access.",
    turnstileResetMissing: "Please complete the anti-bot verification before requesting a link.",
    turnstileActivationMissing: "Please complete the anti-bot verification before resending the activation link.",
    turnstileError: "Anti-bot verification did not complete. Please try the check again before submitting the form.",
    genericError: "This action could not be completed. Check your information and try again.",
    registerSuccess: "Your access request has been registered. Open the link sent by email (also check your spam folder) to confirm your address and choose your password.",
    resetSuccess: "If an account matches this email, a secure reset link will be sent to you.",
    activationSuccess: "If an unverified account matches this email, a new activation link will be sent. Please also check your spam folder.",
    invitationWelcome: "Your invitation has been verified. Confirm your details: you will then choose your password from the activation link sent by email.",
    invitationInvalid: "This invitation link is not valid. You can still create your portal below with the email address used for your application.",
    invitationExpired: "Your invitation link has expired, but you can create your portal below: your email address is prefilled and your application will be linked automatically.",
  },
  de: {
    metaTitle: "Sicheres Kandidatenportal | Hippocampus Consulting",
    metaDescription: "Erstellen Sie Ihren sicheren Kandidatenzugang oder melden Sie sich an.",
    brandTitle: "Ihr sicheres Kandidatenportal",
    brandDescription: "Laden Sie Ihre Verwaltungsdokumente in einen privaten Dokumententresor hoch. Ihre beruflichen Dokumente erhalten eine KI-Zusammenfassung, die unser Team bei der Prüfung unterstützt; Ausweisdokumente werden ausschließlich von einer Person geprüft. Es wird keine Entscheidung automatisch getroffen.",
    safeguards: ["Persönlicher Zugang per E-Mail und Passwort", "Private Dokumente und autorisierte Downloads", "Unterstützte Analyse mit anschließender menschlicher Prüfung"],
    loginTitle: "Mein Portal öffnen",
    registerTitle: "Mein Kandidatenportal erstellen",
    forgotTitle: "Zugang zurücksetzen",
    activationTitle: "Aktivierungs-E-Mail erneut senden",
    loginDescription: "Sehen Sie Ihre Verwaltungsdokumente ein und laden Sie sie vertraulich hoch.",
    registerDescription: "Geben Sie Ihre Daten ein. Ihr Passwort wählen Sie über den per E-Mail gesendeten Aktivierungslink, sobald Ihre Adresse bestätigt ist.",
    forgotDescription: "Wir senden Ihnen einen sicheren Link, wenn ein Konto zu dieser E-Mail passt.",
    activationDescription: "Fordern Sie einen neuen Link an, wenn Ihr Konto erstellt, aber noch nicht aktiviert wurde.",
    firstName: "Vorname",
    lastName: "Nachname",
    email: "Berufliche E-Mail",
    password: "Passwort",
    passwordHint: "Mindestens 15 Zeichen. Wählen Sie ein langes, eindeutiges Passwort.",
    confirmPassword: "Passwort bestätigen",
    terms: "Ich akzeptiere die Nutzungsbedingungen und die Datenschutzrichtlinie.",
    documentConsent: "Ich stimme der vertraulichen Verarbeitung meiner Verwaltungsdokumente und einer KI-Analyse meiner beruflichen Dokumente (Diplome, Zulassungen, Zertifikate) zur Unterstützung der menschlichen Prüfung zu. Ausweisdokumente werden nie von der KI analysiert.",
    login: "Anmelden",
    register: "Zugang erstellen",
    reset: "Sicheren Link erhalten",
    resendActivation: "Aktivierungslink erneut senden",
    navigationLogin: "Anmelden",
    navigationRegister: "Zugang erstellen",
    navigationForgot: "Passwort vergessen",
    navigationActivation: "Aktivierungs-E-Mail nicht erhalten",
    passwordMismatch: "Die beiden Passwörter müssen übereinstimmen.",
    termsMissing: "Bitte akzeptieren Sie die Nutzungsbedingungen und Datenschutzrichtlinie, um fortzufahren.",
    documentConsentMissing: "Bitte stimmen Sie der vertraulichen Verarbeitung Ihrer Dokumente zu, um fortzufahren.",
    bothConsentMissing: "Bitte akzeptieren Sie die Nutzungsbedingungen und stimmen Sie der vertraulichen Verarbeitung Ihrer Dokumente zu, bevor Sie Ihren Zugang erstellen.",
    turnstileRegisterMissing: "Bitte schließen Sie die Bot-Prüfung ab, bevor Sie Ihren Zugang erstellen.",
    turnstileResetMissing: "Bitte schließen Sie die Bot-Prüfung ab, bevor Sie einen Link anfordern.",
    turnstileActivationMissing: "Bitte schließen Sie die Bot-Prüfung ab, bevor Sie den Aktivierungslink erneut anfordern.",
    turnstileError: "Die Bot-Prüfung wurde nicht abgeschlossen. Bitte versuchen Sie die Prüfung erneut, bevor Sie das Formular senden.",
    genericError: "Diese Aktion konnte nicht abgeschlossen werden. Prüfen Sie Ihre Angaben und versuchen Sie es erneut.",
    registerSuccess: "Ihre Zugangsanfrage wurde registriert. Öffnen Sie den per E-Mail erhaltenen Link (prüfen Sie auch den Spam-Ordner), um Ihre Adresse zu bestätigen und Ihr Passwort zu wählen.",
    resetSuccess: "Wenn ein Konto zu dieser E-Mail passt, erhalten Sie einen sicheren Link zum Zurücksetzen.",
    activationSuccess: "Wenn ein nicht aktiviertes Konto zu dieser E-Mail passt, wird ein neuer Aktivierungslink gesendet. Prüfen Sie bitte auch Ihren Spam-Ordner.",
    invitationWelcome: "Ihre Einladung wurde geprüft. Bestätigen Sie Ihre Angaben: Ihr Passwort wählen Sie anschließend über den per E-Mail gesendeten Aktivierungslink.",
    invitationInvalid: "Dieser Einladungslink ist ungültig. Sie können Ihr Portal trotzdem unten mit der E-Mail-Adresse Ihrer Bewerbung erstellen.",
    invitationExpired: "Ihr Einladungslink ist abgelaufen, Sie können Ihr Portal aber unten erstellen: Ihre E-Mail-Adresse ist vorausgefüllt und Ihre Bewerbung wird automatisch verknüpft.",
  },
  zh: {
    metaTitle: "安全候选人门户 | Hippocampus Consulting",
    metaDescription: "创建或访问您的安全候选人门户。",
    brandTitle: "您的安全候选人门户",
    brandDescription: "请将您的行政文件上传至私密文档库。您的职业文件会生成 AI 摘要，协助团队准备审核；身份证明文件仅由人工核验。系统不会自动做出任何决定。",
    safeguards: ["通过电子邮件和密码进行个人访问", "私密文件和经授权的下载", "辅助分析后进行人工审核"],
    loginTitle: "访问我的门户",
    registerTitle: "创建我的候选人门户",
    forgotTitle: "重置我的访问权限",
    activationTitle: "重新发送激活邮件",
    loginDescription: "以保密方式查看和上传您的行政文件。",
    registerDescription: "请填写您的身份信息。确认电子邮件地址后，您将通过邮件中的激活链接设置密码。",
    forgotDescription: "如果此电子邮件对应账户，我们将向您发送安全链接。",
    activationDescription: "如果账户已经创建但尚未激活，请申请新的激活链接。",
    firstName: "名字",
    lastName: "姓氏",
    email: "职业邮箱",
    password: "密码",
    passwordHint: "至少 15 个字符。请选择一个长且唯一的密码。",
    confirmPassword: "确认密码",
    terms: "我接受使用条款和隐私政策。",
    documentConsent: "我同意对我的行政文件进行保密处理，并同意对我的职业文件（学历证书、执照、证书）进行用于支持人工审核的 AI 分析。身份证明文件绝不会由 AI 分析。",
    login: "登录",
    register: "创建访问权限",
    reset: "接收安全链接",
    resendActivation: "重新发送激活链接",
    navigationLogin: "登录",
    navigationRegister: "创建访问权限",
    navigationForgot: "忘记密码",
    navigationActivation: "未收到激活邮件",
    passwordMismatch: "两次输入的密码必须一致。",
    termsMissing: "请接受使用条款和隐私政策以继续。",
    documentConsentMissing: "请同意对您的文件进行保密处理以继续。",
    bothConsentMissing: "创建访问权限前，请接受使用条款并同意对您的文件进行保密处理。",
    turnstileRegisterMissing: "创建访问权限前，请完成反机器人验证。",
    turnstileResetMissing: "请求链接前，请完成反机器人验证。",
    turnstileActivationMissing: "重新发送激活链接前，请完成反机器人验证。",
    turnstileError: "反机器人验证未完成。提交表单前请重新验证。",
    genericError: "无法完成此操作。请检查您的信息后重试。",
    registerSuccess: "您的访问请求已登记。请打开邮件中的链接（也请检查垃圾邮件文件夹），确认您的地址并设置密码。",
    resetSuccess: "如果此电子邮件对应账户，我们将向您发送安全的重置链接。",
    activationSuccess: "如果此电子邮件对应尚未激活的账户，我们将发送新的激活链接。也请检查垃圾邮件文件夹。",
    invitationWelcome: "您的邀请已验证。请确认您的信息：随后您将通过邮件中的激活链接设置密码。",
    invitationInvalid: "此邀请链接无效。您仍可在下方使用申请时填写的电子邮件地址创建门户。",
    invitationExpired: "您的邀请链接已过期，但您仍可在下方创建门户：电子邮件地址已预填，您的申请将自动关联。",
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [terms, setTerms] = useState(false);
  const [documentConsent, setDocumentConsent] = useState(false);
  const [consentAttempted, setConsentAttempted] = useState(false);
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
  const resendActivation = trpc.candidatePortal.resendVerification.useMutation({
    onSuccess: () => setNotice(copy.activationSuccess),
    onError: error => setNotice(candidateNotice(error.message, copy)),
  });
  const invitation = trpc.candidatePortal.resolveInvitation.useQuery(
    { token: invitationToken || "invalid" },
    { enabled: Boolean(invitationToken), retry: false },
  );
  // Only a valid, unexpired invitation is sent with the registration; an expired or
  // invalid one falls back to the normal sign-up instead of blocking it (CAND-11).
  const activeInvitationToken = invitationToken && invitation.data && !invitation.data.expired ? invitationToken : undefined;
  useEffect(() => {
    if (invitationToken || invitationEntry.legacyEmail) setMode("register");
    if (invitation.data) {
      setMode("register");
      setEmail(invitation.data.email);
      setFirstName(invitation.data.firstName);
      setLastName(invitation.data.lastName);
      setNotice(invitation.data.expired ? copy.invitationExpired : copy.invitationWelcome);
    } else if (invitationEntry.legacyEmail) {
      setEmail(invitationEntry.legacyEmail);
      setNotice(copy.invitationWelcome);
    } else if (invitationToken && invitation.isError) {
      setNotice(copy.invitationInvalid);
    }
  }, [copy.invitationExpired, copy.invitationInvalid, copy.invitationWelcome, invitation.data, invitation.isError, invitationEntry.legacyEmail, invitationToken]);
  const pending = login.isPending || register.isPending || reset.isPending || resendActivation.isPending;

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setTurnstileToken(null);
    setNotice("");
    setConsentAttempted(false);
    window.requestAnimationFrame(() => document.getElementById(candidateModeFocusTarget(nextMode))?.focus());
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    if (mode === "login") {
      login.mutate({ email, password });
    } else if (mode === "register") {
      if (!terms || !documentConsent) {
        setConsentAttempted(true);
        setNotice(!terms && !documentConsent ? copy.bothConsentMissing : !terms ? copy.termsMissing : copy.documentConsentMissing);
        return;
      }
      setConsentAttempted(false);
      if (!turnstileToken) { setNotice(copy.turnstileRegisterMissing); return; }
      // No password at this stage: it is chosen from the emailed activation link (SEC-02).
      register.mutate({ email, firstName, lastName, termsAccepted: terms, documentConsent, turnstileToken, invitationToken: activeInvitationToken });
    } else if (mode === "forgot") {
      if (!turnstileToken) { setNotice(copy.turnstileResetMissing); return; }
      reset.mutate({ email, turnstileToken });
    } else {
      if (!turnstileToken) { setNotice(copy.turnstileActivationMissing); return; }
      resendActivation.mutate({ email, turnstileToken });
    }
  }

  const title = mode === "login" ? copy.loginTitle : mode === "register" ? copy.registerTitle : mode === "forgot" ? copy.forgotTitle : copy.activationTitle;
  const description = mode === "login" ? copy.loginDescription : mode === "register" ? copy.registerDescription : mode === "forgot" ? copy.forgotDescription : copy.activationDescription;

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#030a12] px-4 py-10 text-slate-100 sm:py-16">
      <SEOHead title={copy.metaTitle} description={copy.metaDescription} noIndex />
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-cyan-950/80 bg-slate-950/60 shadow-2xl shadow-cyan-950/20 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative overflow-hidden border-b border-cyan-950/70 bg-[radial-gradient(circle_at_25%_15%,rgba(8,145,178,0.26),transparent_42%),linear-gradient(150deg,#06243a,#06121e)] p-7 sm:p-10 lg:border-b-0 lg:border-r">
          <div className="absolute -right-16 -top-12 h-56 w-56 rounded-full border border-cyan-300/20" />
          <div className="relative">
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10 text-cyan-300"><FileLock2 size={24} aria-hidden="true" /></div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Hippocampus Consulting</p>
            <h1 className="mt-3 font-serif text-4xl leading-tight text-white">{copy.brandTitle}</h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-300">{copy.brandDescription}</p>
            <div className="mt-8 space-y-4 text-sm text-slate-200">
              {copy.safeguards.map(item => <div key={item} className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-cyan-300" size={18} aria-hidden="true" /><span>{item}</span></div>)}
            </div>
          </div>
        </section>
        <section className="p-5 sm:p-10">
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader className="px-0 pt-0"><CardTitle className="text-2xl text-white">{title}</CardTitle><CardDescription className="mt-2 leading-6 text-slate-400">{description}</CardDescription></CardHeader>
            <CardContent className="px-0">
              <form id="candidate-access-form" className="space-y-5" onSubmit={submit}>
                {mode === "register" && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="candidate-first-name">{copy.firstName}</Label><Input id="candidate-first-name" value={firstName} onChange={event => setFirstName(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="candidate-last-name">{copy.lastName}</Label><Input id="candidate-last-name" value={lastName} onChange={event => setLastName(event.target.value)} required /></div></div>}
                <div className="space-y-2"><Label htmlFor="candidate-email">{copy.email}</Label><Input id="candidate-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} readOnly={mode === "register" && Boolean(activeInvitationToken)} required /></div>
                {mode === "login" && <div className="space-y-2"><Label htmlFor="candidate-password">{copy.password}</Label><Input id="candidate-password" type="password" autoComplete="current-password" aria-describedby="candidate-password-hint" value={password} onChange={event => setPassword(event.target.value)} minLength={15} required /><p id="candidate-password-hint" className="text-xs text-slate-500">{copy.passwordHint}</p></div>}
                {mode === "register" && <div className="candidate-consent-panel space-y-3 rounded-xl border border-slate-700/90 bg-slate-900/75 p-4 text-sm"><label className={`candidate-consent-item ${consentAttempted && !terms ? "candidate-consent-item-invalid" : ""}`}><Checkbox className="candidate-consent-checkbox" checked={terms} aria-invalid={consentAttempted && !terms} onCheckedChange={value => { const next = value === true; setTerms(next); if (next && documentConsent) setConsentAttempted(false); }} /><span>{copy.terms}</span></label><label className={`candidate-consent-item ${consentAttempted && !documentConsent ? "candidate-consent-item-invalid" : ""}`}><Checkbox className="candidate-consent-checkbox" checked={documentConsent} aria-invalid={consentAttempted && !documentConsent} onCheckedChange={value => { const next = value === true; setDocumentConsent(next); if (next && terms) setConsentAttempted(false); }} /><span>{copy.documentConsent}</span></label></div>}
                {(mode === "register" || mode === "forgot" || mode === "activation") && <TurnstileWidget onToken={setTurnstileToken} />}
                {notice && <p role="status" className="rounded-lg border border-cyan-800/50 bg-cyan-950/30 p-3 text-sm text-cyan-100">{notice}</p>}
                <Button type="submit" className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={pending}>{pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : mode === "login" ? <LogIn aria-hidden="true" /> : mode === "register" ? <UserPlus aria-hidden="true" /> : mode === "activation" ? <MailCheck aria-hidden="true" /> : <KeyRound aria-hidden="true" />}{mode === "login" ? copy.login : mode === "register" ? copy.register : mode === "activation" ? copy.resendActivation : copy.reset}</Button>
              </form>
              <div role="group" aria-label={copy.brandTitle} className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-3 text-sm"><button type="button" aria-controls="candidate-access-form" aria-pressed={mode === "login"} onClick={() => changeMode("login")} className={mode === "login" ? "font-semibold text-white underline decoration-cyan-300 underline-offset-4" : "text-cyan-300 hover:text-cyan-200"}>{copy.navigationLogin}</button><button type="button" aria-controls="candidate-access-form" aria-pressed={mode === "register"} onClick={() => changeMode("register")} className={mode === "register" ? "font-semibold text-white underline decoration-cyan-300 underline-offset-4" : "text-cyan-300 hover:text-cyan-200"}>{copy.navigationRegister}</button><button type="button" aria-controls="candidate-access-form" aria-pressed={mode === "forgot"} onClick={() => changeMode("forgot")} className={mode === "forgot" ? "font-semibold text-white underline decoration-cyan-300 underline-offset-4" : "text-slate-400 hover:text-white"}>{copy.navigationForgot}</button><button type="button" aria-controls="candidate-access-form" aria-pressed={mode === "activation"} onClick={() => changeMode("activation")} className={mode === "activation" ? "font-semibold text-white underline decoration-cyan-300 underline-offset-4" : "text-slate-400 hover:text-white"}>{copy.navigationActivation}</button></div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

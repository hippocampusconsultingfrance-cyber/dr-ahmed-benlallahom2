import { FormEvent, useRef, useState } from "react";
import { CheckCircle2, FileUp, Globe2, Loader2, ShieldCheck, UsersRound, Building2 } from "lucide-react";
import { Link } from "wouter";
import { SEOHead } from "@/components/SEOHead";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { siteConfig } from "@/data/site-config";
import { resolveCountryForSubmission } from "@/lib/countrySubmission";
import { reportFieldsToCorrect, type FieldToCorrect } from "@/lib/formFieldsToCorrect";
import { getInvalidCharactersCopy } from "@/lib/publicFormCopy";
import { INVALID_CHARACTERS_REASON } from "@shared/publicFormRefusalReasons";
import { cleanTextInput } from "@shared/textInputCleaning";

export const employerCopy = {
  fr: {
    eyebrow: "Hippocampus Consulting · Espace Employeurs & Partenaires",
    title: "Déléguez le recrutement de vos équipes médicales d’élite.",
    intro: "Nous sélectionnons et qualifions, pour les hôpitaux, cliniques, plateformes pétrolières, grands groupes industriels et missions offshore, des professionnels de santé d'exception prêts à intervenir en Europe, au Canada, au Moyen-Orient, en Afrique et sur les sites isolés.",
    formTitle: "Soumettre un brief de mission",
    formIntro: "Précisez vos besoins opérationnels. Notre cellule spécialisée prend un premier contact avec vous sous 24 h ouvrées.",
    orgName: "Établissement ou entreprise",
    orgNamePlaceholder: "Hôpital, Groupe, Société",
    contactName: "Nom du responsable",
    contactNamePlaceholder: "Dr. / M. / Mme",
    email: "Email",
    phone: "Téléphone",
    targetEnvironment: "Environnement de la mission",
    env1: "Hôpital / Clinique internationale",
    env2: "Plateforme pétrolière / Site Offshore",
    env3: "Mission VVIP offshore / Groupe industriel",
    env4: "Site minier ou industriel isolé",
    specialtyNeeded: "Spécialité médicale ou paramédicale recherchée",
    specialtyPlaceholder: "Ex. Médecin urgentiste, IADE, etc.",
    country: "Pays / Zone géographique",
    countryPlaceholder: "Ex. Arabie saoudite, Canada, France",
    requiredCertifications: "Certifications obligatoires (ex. ATLS, ACLS, HUET)",
    certificationsPlaceholder: "ATLS, ACLS, HUET, OGP, etc.",
    timeline: "Calendrier souhaité (ex. Immédiat, Q3 2026)",
    timelinePlaceholder: "Ex. Immédiat, T3 2026",
    notes: "Détails de la mission ou contraintes particulières",
    notesPlaceholder: "Décrivez le contexte, les rotations ou les exigences linguistiques…",
    submit: "Transmettre le brief de mission",
    sending: "Transmission sécurisée…",
    successTitle: "Brief de mission enregistré",
    successText: "Votre demande a bien été transmise à notre équipe exécutive. Votre référence de suivi :",
    successThanks: "Merci pour votre confiance.",
    successNext: "Notre équipe prend un premier contact avec vous sous 24 h ouvrées pour préciser le besoin, les délais et les prochaines étapes.",
    successPrivacy: "Votre brief est traité de manière confidentielle par notre cellule de recrutement.",
    backHome: "Retour à l’accueil",
    genericError: "La transmission a échoué. Vérifiez vos informations et réessayez.",
    rateLimited: "Trop de briefs ont été envoyés récemment. Patientez avant d’en soumettre un nouveau, ou écrivez-nous à {email}.",
    serviceUnavailable: "Le service est momentanément indisponible : votre brief n’a pas été transmis. Réessayez dans quelques minutes, ou écrivez-nous à {email}.",
    privacyNotice: "Les informations de ce brief servent uniquement à traiter votre demande de recrutement.",
    privacyLink: "Politique de confidentialité",
    b1Title: "Shortlist qualifiée par IA & Médecins",
    b1Desc: "Double validation clinique et technique pour chaque profil présenté.",
    b2Title: "Conformité & Habilitations",
    b2Desc: "Vérification rigoureuse des ordres professionnels et certifications de sécurité.",
    b3Title: "Discrétion & Réactivité",
    b3Desc: "Accompagnement sur-mesure pour les environnements les plus exigeants.",
    whyLink: "Pourquoi choisir Hippocampus Consulting : méthode et confidentialité",
    metaTitle: "Espace Employeurs & Recrutement Médical | Hippocampus Consulting",
    metaDescription: "Soumettez vos briefs de recrutement médical pour hôpitaux, cliniques, plateformes pétrolières, grands groupes industriels et missions VVIP offshore.",
  },
  en: {
    eyebrow: "Hippocampus Consulting · Employers & Partners",
    title: "Delegate the recruitment of your elite medical teams.",
    intro: "We source and qualify exceptional healthcare professionals for hospitals, clinics, oil rigs, industrial groups, and offshore missions across Europe, Canada, the Middle East, Africa, and remote sites.",
    formTitle: "Submit a Mission Brief",
    formIntro: "Specify your operational requirements. Our specialized unit will make a first contact with you within 24 business hours.",
    orgName: "Organization or Company",
    orgNamePlaceholder: "Hospital, group, company",
    contactName: "Contact Name",
    contactNamePlaceholder: "Dr / Mr / Ms",
    email: "Professional Email",
    phone: "Phone",
    targetEnvironment: "Mission Environment",
    env1: "Hospital / International Clinic",
    env2: "Oil Rig / Offshore Site",
    env3: "VVIP Offshore Mission / Industrial Group",
    env4: "Remote Mining or Industrial Site",
    specialtyNeeded: "Specialty / Profession Needed",
    specialtyPlaceholder: "e.g. Emergency physician, nurse anaesthetist",
    country: "Country / Region",
    countryPlaceholder: "e.g. Saudi Arabia, Canada, France",
    requiredCertifications: "Mandatory Certifications (e.g. ATLS, ACLS, HUET)",
    certificationsPlaceholder: "ATLS, ACLS, HUET, OGP, etc.",
    timeline: "Expected Timeline (e.g. Immediate, Q3 2026)",
    timelinePlaceholder: "e.g. Immediate, Q3 2026",
    notes: "Mission details or specific constraints",
    notesPlaceholder: "Briefly describe the context, rotations, or language requirements…",
    submit: "Submit Mission Brief",
    sending: "Secure transmission…",
    successTitle: "Mission Brief Registered",
    successText: "Your request has been forwarded to our executive team. Your tracking reference:",
    successThanks: "Thank you for your trust.",
    successNext: "Our team will make a first contact with you within 24 business hours to clarify the brief, timeline, and next steps.",
    successPrivacy: "Your brief is handled confidentially by our recruitment unit.",
    backHome: "Back to Home",
    genericError: "Transmission failed. Check your information and try again.",
    rateLimited: "Too many briefs have been sent recently. Please wait before submitting a new one, or write to us at {email}.",
    serviceUnavailable: "The service is temporarily unavailable: your brief has not been sent. Please try again in a few minutes, or write to us at {email}.",
    privacyNotice: "The information in this brief is used only to handle your recruitment request.",
    privacyLink: "Privacy policy",
    b1Title: "AI & Physician-Qualified Shortlist",
    b1Desc: "Double clinical and technical validation for every presented profile.",
    b2Title: "Compliance & Clearances",
    b2Desc: "Rigorous verification of medical board standing and safety certifications.",
    b3Title: "Discretion & Responsiveness",
    b3Desc: "Tailored support for the most demanding environments.",
    whyLink: "Why choose Hippocampus Consulting: method and confidentiality",
    metaTitle: "Employers & Medical Recruitment | Hippocampus Consulting",
    metaDescription: "Submit your medical recruitment briefs for hospitals, clinics, oil rigs, industrial groups, and VVIP offshore missions.",
  },
  de: {
    eyebrow: "Hippocampus Consulting · Arbeitgeber & Partner",
    title: "Rekrutieren Sie Ihre medizinischen Elite-Teams.",
    intro: "Wir rekrutieren und qualifizieren herausragende medizinische Fachkräfte für Krankenhäuser, Kliniken, Offshore-Plattformen, Industriegruppen und Offshore-Einsätze in Europa, Kanada, dem Nahen Osten, Afrika und an abgelegenen Standorten.",
    formTitle: "Einsatz-Brief einreichen",
    formIntro: "Geben Sie Ihre operativen Anforderungen an. Unser spezialisiertes Team nimmt innerhalb von 24 Arbeitsstunden einen ersten Kontakt mit Ihnen auf.",
    orgName: "Einrichtung oder Unternehmen",
    orgNamePlaceholder: "Krankenhaus, Gruppe, Unternehmen",
    contactName: "Name des Ansprechpartners",
    contactNamePlaceholder: "Dr. / Herr / Frau",
    email: "Berufliche E-Mail",
    phone: "Telefon",
    targetEnvironment: "Einsatzumgebung",
    env1: "Krankenhaus / Internationale Klinik",
    env2: "Bohrinsel / Offshore-Standort",
    env3: "VVIP-Offshore-Einsatz / Industriegruppe",
    env4: "Entlegener Industrie- oder Bergbaustandort",
    specialtyNeeded: "Gesuchtes medizinisches Fachgebiet",
    specialtyPlaceholder: "z. B. Notarzt, Fachpflege Anästhesie",
    country: "Land / Region",
    countryPlaceholder: "z. B. Saudi-Arabien, Kanada, Frankreich",
    requiredCertifications: "Erforderliche Zertifikate (z.B. ATLS, ACLS, HUET)",
    certificationsPlaceholder: "ATLS, ACLS, HUET, OGP usw.",
    timeline: "Zeitplan (z.B. Sofort, Q3 2026)",
    timelinePlaceholder: "z. B. Sofort, Q3 2026",
    notes: "Einsatzdetails oder besondere Anforderungen",
    notesPlaceholder: "Beschreiben Sie kurz Kontext, Rotationen oder Sprachanforderungen…",
    submit: "Einsatz-Brief absenden",
    sending: "Sichere Übertragung…",
    successTitle: "Einsatz-Brief registriert",
    successText: "Ihre Anfrage wurde an unser Executive-Team übermittelt. Tracking-Referenz:",
    successThanks: "Vielen Dank für Ihr Vertrauen.",
    successNext: "Unser Team nimmt innerhalb von 24 Arbeitsstunden einen ersten Kontakt mit Ihnen auf, um Bedarf, Zeitplan und nächste Schritte zu klären.",
    successPrivacy: "Ihr Brief wird vertraulich von unserem Recruiting-Team bearbeitet.",
    backHome: "Zur Startseite",
    genericError: "Übertragung fehlgeschlagen. Bitte überprüfen Sie Ihre Angaben.",
    rateLimited: "Es wurden kürzlich zu viele Briefs gesendet. Bitte warten Sie, bevor Sie einen neuen einreichen, oder schreiben Sie uns an {email}.",
    serviceUnavailable: "Der Dienst ist vorübergehend nicht verfügbar: Ihr Brief wurde nicht übermittelt. Bitte versuchen Sie es in einigen Minuten erneut oder schreiben Sie uns an {email}.",
    privacyNotice: "Die Angaben in diesem Brief dienen ausschließlich der Bearbeitung Ihrer Recruiting-Anfrage.",
    privacyLink: "Datenschutzerklärung",
    b1Title: "KI- & Arzt-qualifizierte Shortlist",
    b1Desc: "Klinische und technische Doppelvalidierung für jedes Profil.",
    b2Title: "Konformität & Freigaben",
    b2Desc: "Strikte Überprüfung berufsrechtlicher Zulassungen.",
    b3Title: "Diskretion & Reaktionsfähigkeit",
    b3Desc: "Maßgeschneiderte Unterstützung für anspruchsvollste Umgebungen.",
    whyLink: "Warum Hippocampus Consulting: Methode und Vertraulichkeit",
    metaTitle: "Arbeitgeber & Medizinisches Recruiting | Hippocampus Consulting",
    metaDescription: "Reichen Sie Ihre medizinischen Recruiting-Briefs für Kliniken und Offshore-Projekte ein.",
  },
  zh: {
    eyebrow: "Hippocampus Consulting · 雇主与合作伙伴专区",
    title: "委托我们为您招募精英医疗团队。",
    intro: "我们为欧洲、加拿大、中东、非洲及偏远站点的医院、诊所、石油钻井平台、工业集团和离岸任务甄选并认证顶尖医疗专业人员。",
    formTitle: "提交任务需求 (Brief)",
    formIntro: "请告知您的运营需求。我们的专业团队将在 24 个工作小时内与您进行首次联系。",
    orgName: "机构或公司名称",
    orgNamePlaceholder: "医院、集团、公司",
    contactName: "负责人姓名",
    contactNamePlaceholder: "医生 / 先生 / 女士",
    email: "职业邮箱",
    phone: "电话",
    targetEnvironment: "任务环境",
    env1: "医院 / 国际诊所",
    env2: "石油钻井平台 / 离岸工程",
    env3: "VVIP 离岸任务 / 工业集团",
    env4: "偏远矿山或工业驻地",
    specialtyNeeded: "急需医疗或医护专业",
    specialtyPlaceholder: "例如：急诊医师、麻醉专科护士",
    country: "国家 / 地区",
    countryPlaceholder: "例如：沙特阿拉伯、加拿大、法国",
    requiredCertifications: "强制认证（如 ATLS, ACLS, HUET）",
    certificationsPlaceholder: "ATLS、ACLS、HUET、OGP 等",
    timeline: "期望时间表（如：即刻、2026年第三季度）",
    timelinePlaceholder: "例如：即刻、2026年第三季度",
    notes: "任务详情或特殊约束",
    notesPlaceholder: "请简要说明任务背景、轮班或语言要求…",
    submit: "提交任务需求",
    sending: "安全传输中…",
    successTitle: "任务需求已登记",
    successText: "您的需求已转发至高管团队。追踪参考号：",
    successThanks: "感谢您的信任。",
    successNext: "我们的团队将在 24 个工作小时内与您进行首次联系，确认需求、时间表和后续步骤。",
    successPrivacy: "您的需求将由我们的招聘团队以保密方式处理。",
    backHome: "返回首页",
    genericError: "传输失败，请检查后重试。",
    rateLimited: "近期提交的需求过多。请稍候再提交新的需求，或发送邮件至 {email}。",
    serviceUnavailable: "服务暂时不可用，您的需求尚未提交。请几分钟后重试，或发送邮件至 {email}。",
    privacyNotice: "此需求中的信息仅用于处理您的招聘请求。",
    privacyLink: "隐私政策",
    b1Title: "AI 与医师双重背书 Shortlist",
    b1Desc: "对每个推荐档案进行严格的临床与技术双重把关。",
    b2Title: "合规与资质认证",
    b2Desc: "对医疗执业资格与安全证书进行核查。",
    b3Title: "绝对保密与高效响应",
    b3Desc: "为最具挑战性的环境提供定制化支持。",
    whyLink: "为什么选择 Hippocampus Consulting：方法与保密",
    metaTitle: "雇主专区与医疗招聘 | Hippocampus Consulting",
    metaDescription: "为医院、诊所、石油钻井平台、工业集团及 VVIP 离岸任务提交医疗招聘需求。",
  },
} as const;

type Language = keyof typeof employerCopy;
type BriefFormState = {
  organizationName: string;
  contactName: string;
  email: string;
  phone: string;
  targetEnvironment: string;
  specialtyNeeded: string;
  country: string;
  requiredCertifications: string;
  timeline: string;
  notes: string;
  website: string;
};

const initialBrief: BriefFormState = {
  organizationName: "",
  contactName: "",
  email: "",
  phone: "",
  // Value of the first option, the one the select shows (REC-12).
  targetEnvironment: "Hôpital / Clinique internationale",
  specialtyNeeded: "",
  country: "",
  requiredCertifications: "",
  timeline: "",
  notes: "",
  website: "",
};

/** Required fields of the brief, in the order they appear on the form. */
type EmployerField = "organizationName" | "contactName" | "email" | "specialtyNeeded" | "country";
const employerFieldId = (field: EmployerField) => `employer-${field}`;

/** Required fields left empty, and an email that is not an address, in the order of the form. */
export function employerInvalidFields(form: BriefFormState, submittedCountry: string): EmployerField[] {
  const invalid: EmployerField[] = [];
  if (!form.organizationName.trim()) invalid.push("organizationName");
  if (!form.contactName.trim()) invalid.push("contactName");
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) invalid.push("email");
  if (!form.specialtyNeeded.trim()) invalid.push("specialtyNeeded");
  if (!submittedCountry) invalid.push("country");
  return invalid;
}

/**
 * Message of a brief the server refused (REC-12): the limits reached or a
 * service unavailable, from their stable code, in the language of the page
 * and with the contact email, or a field refused for its characters
 * (INTL-05); any other failure keeps the generic message. The French text of
 * the server is never shown.
 */
function employerSubmissionError(code: unknown, language: Language): string {
  const t = employerCopy[language];
  if (code === "rate_limited") return t.rateLimited.replace("{email}", siteConfig.email);
  if (code === "service_unavailable") return t.serviceUnavailable.replace("{email}", siteConfig.email);
  if (code === INVALID_CHARACTERS_REASON) return getInvalidCharactersCopy(language);
  return t.genericError;
}

/** What the alert names for each refused field of the brief, and where focus goes (A11Y-03). */
export function employerFieldsToCorrect(invalidFields: readonly EmployerField[], language: Language): FieldToCorrect[] {
  const t = employerCopy[language];
  const names: Record<EmployerField, string> = { organizationName: t.orgName, contactName: t.contactName, email: t.email, specialtyNeeded: t.specialtyNeeded, country: t.country };
  return invalidFields.map(field => ({ label: names[field], focusId: employerFieldId(field) }));
}

export default function EmployersPage() {
  const { language } = useLanguage();
  const lang = (language in employerCopy ? language : "fr") as Language;
  const t = employerCopy[lang];
  const [form, setForm] = useState<BriefFormState>(initialBrief);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [invalidFields, setInvalidFields] = useState<ReadonlySet<string>>(() => new Set());
  const [briefId, setBriefId] = useState("");

  const update = <K extends keyof BriefFormState>(key: K, value: BriefFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setInvalidFields(previous => { const next = new Set(previous); next.delete(key); return next; });
  };
  const isInvalid = (field: EmployerField) => invalidFields.has(field);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    const submittedCountry = resolveCountryForSubmission(form.country, new FormData(event.currentTarget).get("country"));

    const invalid = employerInvalidFields(form, submittedCountry);
    setInvalidFields(new Set(invalid));
    if (invalid.length) {
      setStatus("error");
      setErrorMessage(reportFieldsToCorrect(employerFieldsToCorrect(invalid, lang), lang));
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch("/api/client-briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The language of the page is that of the acknowledgement sent to the employer.
        body: JSON.stringify({ ...form, country: submittedCountry, language: lang }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Employer brief refused:", res.status, payload.code);
        setStatus("error");
        setErrorMessage(employerSubmissionError(payload.code, lang));
        return;
      }
      setBriefId(payload.briefId || "BRIEF-OK");
      setStatus("success");
    } catch (err) {
      console.error("Employer brief submission error:", err);
      setStatus("error");
      setErrorMessage(t.genericError);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead title={t.metaTitle} description={t.metaDescription} ogUrl="https://drahmedbenlallahom.com/employers" />
      <Navigation />
      <main className="pt-32 md:pt-40 pb-24">
        <section className="container grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start max-w-6xl">
          {/*
            Colonne figée seulement à partir de 1440 px (.container s'élargit), où le formulaire remet
            ses champs deux par deux. Plus étroit, il les empile (A11Y-01) et dépasse de loin cette
            colonne, qui resterait figée assez longtemps pour que son dernier lien reçoive le focus
            clavier hors de l'écran ou sous le bandeau cookies (WCAG 2.4.11).
          */}
          <div className="min-[1440px]:sticky min-[1440px]:top-32 space-y-8">
            <div>
              <p className="section-kicker">{t.eyebrow}</p>
              <h1 className="mt-4 font-display text-4xl leading-tight text-foreground md:text-5xl">{t.title}</h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">{t.intro}</p>
            </div>

            <div className="grid gap-4">
              {[
                { icon: ShieldCheck, title: t.b1Title, desc: t.b1Desc },
                { icon: Building2, title: t.b2Title, desc: t.b2Desc },
                { icon: UsersRound, title: t.b3Title, desc: t.b3Desc },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="editorial-card flex items-start gap-4 p-5">
                    <div className="rounded-xl bg-primary/10 p-3 text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg text-foreground">{item.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <Link href="/why-hippocampus" className="inline-flex items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">
              {t.whyLink} <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="editorial-card p-6 md:p-8">
            {status === "success" ? (
              <div className="success-confirmation py-10 text-center" role="status" aria-live="polite">
                <div className="success-orbit mx-auto" aria-hidden="true">
                  <div className="success-orbit__ring" />
                  <div className="success-orbit__core">
                    <CheckCircle2 className="success-orbit__icon h-12 w-12" strokeWidth={1.6} />
                  </div>
                </div>
                <p className="mt-7 text-xs font-semibold uppercase tracking-[0.24em] text-primary">{t.successThanks}</p>
                <h2 className="mt-3 font-display text-3xl text-foreground md:text-4xl">{t.successTitle}</h2>
                <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-muted-foreground">{t.successText}</p>
                <p className="mx-auto mt-5 max-w-xs rounded-xl border border-primary/20 bg-primary/10 px-6 py-4 font-mono text-xl font-bold tracking-wide text-primary">{briefId}</p>
                <div className="mx-auto mt-6 max-w-md rounded-2xl border border-border/70 bg-background/40 p-5 text-left">
                  <p className="text-sm leading-6 text-foreground">{t.successNext}</p>
                  <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{t.successPrivacy}</span>
                  </p>
                </div>
                <Link href="/" className="cta-primary mt-8 inline-flex">{t.backHome}</Link>
              </div>
            ) : (
              <>
                <h2 className="font-display text-3xl text-foreground">{t.formTitle}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.formIntro}</p>

                <form onSubmit={handleSubmit} className="@container mt-8 space-y-6" noValidate>
                  <div className="grid gap-4 @xl:grid-cols-2">
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.orgName} *</span>
                      <input id={employerFieldId("organizationName")} required autoComplete="organization" value={form.organizationName} aria-invalid={isInvalid("organizationName")} onChange={(e) => update("organizationName", e.target.value)} className={`form-control block w-full ${isInvalid("organizationName") ? "form-field-invalid" : ""}`} placeholder={t.orgNamePlaceholder} />
                    </label>
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.contactName} *</span>
                      <input id={employerFieldId("contactName")} required autoComplete="name" value={form.contactName} aria-invalid={isInvalid("contactName")} onChange={(e) => update("contactName", e.target.value)} className={`form-control block w-full ${isInvalid("contactName") ? "form-field-invalid" : ""}`} placeholder={t.contactNamePlaceholder} />
                    </label>
                  </div>

                  <div className="grid gap-4 @xl:grid-cols-2">
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.email} *</span>
                      <input id={employerFieldId("email")} type="email" required value={form.email} aria-invalid={isInvalid("email")} onChange={(e) => update("email", cleanTextInput(e.target.value))} className={`form-control block w-full ${isInvalid("email") ? "form-field-invalid" : ""}`} autoComplete="email" />
                    </label>
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.phone}</span>
                      <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} className="form-control block w-full" autoComplete="tel" />
                    </label>
                  </div>

                  <div className="grid gap-4 @xl:grid-cols-2">
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.targetEnvironment} *</span>
                      <select value={form.targetEnvironment} onChange={(e) => update("targetEnvironment", e.target.value)} className="form-control block w-full">
                        <option value="Hôpital / Clinique internationale">{t.env1}</option>
                        <option value="Plateforme pétrolière / Site Offshore">{t.env2}</option>
                        <option value="Mission VVIP offshore / Groupe industriel">{t.env3}</option>
                        <option value="Site minier ou industriel isolé">{t.env4}</option>
                      </select>
                    </label>
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.specialtyNeeded} *</span>
                      <input id={employerFieldId("specialtyNeeded")} required value={form.specialtyNeeded} aria-invalid={isInvalid("specialtyNeeded")} onChange={(e) => update("specialtyNeeded", e.target.value)} className={`form-control block w-full ${isInvalid("specialtyNeeded") ? "form-field-invalid" : ""}`} placeholder={t.specialtyPlaceholder} />
                    </label>
                  </div>

                  <div className="grid gap-4 @xl:grid-cols-2">
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.country} *</span>
                      <input id={employerFieldId("country")} name="country" required value={form.country} aria-invalid={isInvalid("country")} onInput={(e) => update("country", e.currentTarget.value)} onChange={(e) => update("country", e.target.value)} autoComplete="off" className={`form-control block w-full ${isInvalid("country") ? "form-field-invalid" : ""}`} placeholder={t.countryPlaceholder} />
                    </label>
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.timeline}</span>
                      <input value={form.timeline} onChange={(e) => update("timeline", e.target.value)} className="form-control block w-full" placeholder={t.timelinePlaceholder} />
                    </label>
                  </div>

                  <label className="block w-full space-y-2 text-sm text-foreground">
                    <span className="block mb-1 font-medium">{t.requiredCertifications}</span>
                    <input value={form.requiredCertifications} onChange={(e) => update("requiredCertifications", e.target.value)} className="form-control block w-full" placeholder={t.certificationsPlaceholder} />
                  </label>

                  <label className="block w-full space-y-2 text-sm text-foreground">
                    <span className="block mb-1 font-medium">{t.notes}</span>
                    <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} className="form-control block min-h-24 w-full" maxLength={3000} placeholder={t.notesPlaceholder} />
                  </label>

                  <label className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
                    <span>Website</span>
                    <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update("website", e.target.value)} />
                  </label>

                  {status === "error" && (
                    <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{errorMessage}</p>
                  )}

                  <button type="submit" disabled={status === "sending"} className="cta-primary w-full justify-center">
                    {status === "sending" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.sending}</> : t.submit}
                  </button>
                  {/* Information at the point of collection, with the privacy policy (REC-12). */}
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t.privacyNotice}{" "}
                    <Link href="/legal?tab=privacy" className="text-primary underline underline-offset-2 hover:text-primary/80">{t.privacyLink}</Link>
                  </p>
                </form>
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

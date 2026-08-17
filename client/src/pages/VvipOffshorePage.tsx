import { FormEvent, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileUp, Globe2, Loader2, ShieldCheck, UserCheck, Zap } from "lucide-react";
import { Link } from "wouter";
import { SEOHead } from "@/components/SEOHead";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";

const specialtyOptions = [
  "Médecin urgentiste (ATLS / ACLS)",
  "Médecin de plateforme / Offshore",
  "Médecin de soins intensifs / Réanimateur",
  "Infirmier(ère) paramédical(e) Offshore / Rig Medic",
  "Infirmier(ère) anesthésiste (IADE) VVIP",
  "Médecin personnel / Concierge VIP",
  "Autre spécialité VVIP / Offshore",
] as const;

const copy = {
  fr: {
    eyebrow: "Hippocampus Consulting · Missions d’Élite VVIP & Offshore",
    title: "Médecine d’urgence et soins hautement spécialisés en environnements critiques.",
    intro: "Nous recrutons des médecins, urgentistes et personnels paramédicaux d’élite pour des missions exclusives au Moyen-Orient (résidences royales, délégations VVIP), sur les plateformes pétrolières et auprès des grandes sociétés industrielles offshore.",
    nav: "VVIP & Offshore",
    formTitle: "Candidature Missions VVIP & Offshore",
    formIntro: "Ces missions requièrent une excellence clinique irréprochable, une résistance au stress éprouvée et des certifications internationales à jour (ATLS, ACLS, HUET/BOSIET selon les sites).",
    firstName: "Prénom",
    lastName: "Nom",
    email: "Email professionnel",
    phone: "Téléphone",
    specialty: "Profil recherché / Spécialité",
    environment: "Environnement de prédilection",
    env1: "Moyen-Orient (Résidences / Gouvernement / VVIP)",
    env2: "Plateformes pétrolières & gazières (Onshore / Offshore)",
    env3: "Sociétés minières & industrielles isolées",
    env4: "Événements internationaux de prestige",
    experience: "Années d’expérience en zone critique",
    certifications: "Certifications détenues (ex. ATLS, ACLS, PHTLS, HUET)",
    cv: "CV détaillé (PDF, DOC ou DOCX — 5 Mo max)",
    chooseFile: "Choisir un fichier",
    gdpr: "J’accepte le traitement de mes données pour l’évaluation de mon profil dans le cadre des missions VVIP et offshore, avec analyse automatisée d’aide à la présélection et revue humaine obligatoire.",
    submit: "Soumettre ma candidature VVIP",
    sending: "Transmission sécurisée…",
    successTitle: "Candidature VVIP enregistrée",
    successText: "Votre dossier a été transmis à notre cellule de recrutement spécialisé. Votre code de suivi confidentiel :",
    backHome: "Retour à l’accueil",
    required: "Veuillez remplir les champs obligatoires et joindre votre CV.",
    fileError: "Veuillez joindre un CV valide au format PDF, DOC ou DOCX (max 5 Mo).",
    genericError: "Erreur lors de la transmission. Veuillez vérifier vos informations et réessayer.",
    p1Title: "Excellence & Discrétion",
    p1Desc: "Protocoles de confidentialité stricts, habilitations et discrétion absolue exigés pour chaque intervention.",
    p2Title: "Zones d’Intervention",
    p2Desc: "Golfe Persique, Moyen-Orient, plateformes en mer du Nord, Afrique de l’Ouest et chantiers isolés.",
    p3Title: "Standards Internationaux",
    p3Desc: "Accompagnement sur les normes médicales rigoureuses (OGP, Oil & Gas UK, AHA).",
    metaTitle: "Recrutement Médical VVIP & Offshore | Hippocampus Consulting",
    metaDescription: "Candidature pour missions médicales d’élite : Moyen-Orient VVIP, plateformes pétrolières, sites offshore et environnements industriels isolés.",
  },
  en: {
    eyebrow: "Hippocampus Consulting · Elite VVIP & Offshore Missions",
    title: "High-acuity emergency medicine in demanding environments.",
    intro: "We recruit elite physicians, emergency doctors, and healthcare professionals for exclusive assignments in the Middle East (royal residences, VVIP delegations), oil rigs, and major offshore industrial corporations.",
    nav: "VVIP & Offshore",
    formTitle: "VVIP & Offshore Application",
    formIntro: "These missions require flawless clinical excellence, proven stress resilience, and up-to-date international certifications (ATLS, ACLS, HUET/BOSIET).",
    firstName: "First name",
    lastName: "Last name",
    email: "Professional email",
    phone: "Phone",
    specialty: "Target Profile / Specialty",
    environment: "Preferred Environment",
    env1: "Middle East (Residences / Government / VVIP)",
    env2: "Oil & Gas Rigs (Onshore / Offshore)",
    env3: "Remote Mining & Industrial Sites",
    env4: "Prestigious International Events",
    experience: "Years of experience in critical zones",
    certifications: "Held certifications (e.g. ATLS, ACLS, PHTLS, HUET)",
    cv: "Detailed CV (PDF, DOC or DOCX — 5 MB max)",
    chooseFile: "Choose a file",
    gdpr: "I consent to the processing of my data for VVIP and offshore mission evaluation, including automated pre-screening assistance and mandatory human review.",
    submit: "Submit VVIP Application",
    sending: "Secure transmission…",
    successTitle: "VVIP Application Registered",
    successText: "Your file has been sent to our specialized recruitment unit. Your confidential tracking code:",
    backHome: "Back to Home",
    required: "Please fill in mandatory fields and attach your CV.",
    fileError: "Please attach a valid PDF, DOC or DOCX CV (max 5 MB).",
    genericError: "Transmission error. Please check your information and try again.",
    p1Title: "Excellence & Discretion",
    p1Desc: "Strict confidentiality protocols, clearances, and absolute discretion required for every deployment.",
    p2Title: "Deployment Zones",
    p2Desc: "Persian Gulf, Middle East, North Sea platforms, West Africa, and remote industrial sites.",
    p3Title: "International Standards",
    p3Desc: "Compliance with rigorous medical standards (OGP, Oil & Gas UK, AHA).",
    metaTitle: "VVIP & Offshore Medical Recruitment | Hippocampus Consulting",
    metaDescription: "Apply for elite medical missions: Middle East VVIP, oil rigs, offshore sites, and remote industrial environments.",
  },
  de: {
    eyebrow: "Hippocampus Consulting · Elite VVIP & Offshore Missionen",
    title: "Notfallmedizin und spezialisierte Versorgung in kritischen Umgebungen.",
    intro: "Wir rekrutieren Elite-Ärzte, Notärzte und medizinisches Fachpersonal für exklusive Einsätze im Nahen Osten (höchste Schutzstufen, VVIP), auf Bohrinseln und Offshore-Industriestandorten.",
    nav: "VVIP & Offshore",
    formTitle: "VVIP & Offshore Bewerbung",
    formIntro: "Diese Einsätze erfordern absolute klinische Exzellenz, Stressresistenz und aktuelle internationale Zertifizierungen (ATLS, ACLS, HUET/BOSIET).",
    firstName: "Vorname",
    lastName: "Nachname",
    email: "Berufliche E-Mail",
    phone: "Telefon",
    specialty: "Gesuchtes Profil / Fachgebiet",
    environment: "Bevorzugte Einsatzumgebung",
    env1: "Naher Osten (Residenzen / Regierung / VVIP)",
    env2: "Öl- & Gasplattformen (Onshore / Offshore)",
    env3: "Entlegene Bergbau- & Industriestandorte",
    env4: "Prestigeträchtige internationale Events",
    experience: "Jahre Berufserfahrung in Krisen- / Sonderzonen",
    certifications: "Zertifikate (z.B. ATLS, ACLS, PHTLS, HUET)",
    cv: "Detaillierter Lebenslauf (PDF, DOC oder DOCX — max. 5 MB)",
    chooseFile: "Datei auswählen",
    gdpr: "Ich stimme der Verarbeitung meiner Daten zur Eignungsprüfung für VVIP- und Offshore-Missionen zu, einschließlich automatisierter Vorauswahl und verpflichtender menschlicher Prüfung.",
    submit: "VVIP-Bewerbung absenden",
    sending: "Sichere Übertragung…",
    successTitle: "VVIP-Bewerbung registriert",
    successText: "Ihre Unterlagen wurden an unser spezialisiertes Recruiting-Team übermittelt. Ihr vertraulicher Tracking-Code:",
    backHome: "Zur Startseite",
    required: "Bitte füllen Sie alle Pflichtfelder aus und fügen Sie Ihren Lebenslauf bei.",
    fileError: "Bitte fügen Sie einen gültigen PDF-, DOC- oder DOCX-Lebenslauf bei (max. 5 MB).",
    genericError: "Übertragungsfehler. Bitte überprüfen Sie Ihre Angaben.",
    p1Title: "Exzellenz & Diskretion",
    p1Desc: "Strikte Vertraulichkeitsprotokolle und absolute Verschwiegenheit.",
    p2Title: "Einsatzregionen",
    p2Desc: "Persischer Golf, Naher Osten, Nordsee-Plattformen und Westafrika.",
    p3Title: "Internationale Standards",
    p3Desc: "Einhaltung strenger Medizinstandards (OGP, Oil & Gas UK, AHA).",
    metaTitle: "VVIP & Offshore Medizinisches Recruiting | Hippocampus Consulting",
    metaDescription: "Bewerbung für Elite-Medizineinsätze: Naher Osten VVIP, Bohrinseln, Offshore-Standorte.",
  },
  zh: {
    eyebrow: "Hippocampus Consulting · 精英 VVIP 与 离岸海洋工程医疗",
    title: "苛刻环境下的急救医学与高端医疗保障。",
    intro: "我们为中东地区（王室 residence、VVIP 代表团）、石油钻井平台及大型离岸海洋工程企业招募顶尖医师、急诊-重症 specialist 及专业医护人员。",
    nav: "VVIP & 离岸",
    formTitle: "VVIP 与离岸任务专属申请",
    formIntro: "此类任务要求卓越的临床能力、出色的抗压素质以及最新的国际权威认证（ATLS、ACLS、HUET/BOSIET）。",
    firstName: "名",
    lastName: "姓",
    email: "职业邮箱",
    phone: "电话",
    specialty: "目标岗位 / 专业方向",
    environment: "倾向工作环境",
    env1: "中东地区（王室 / 政府 / VVIP 宅邸）",
    env2: "油气钻井平台（陆上 / 海上 Offshore）",
    env3: "偏远矿业与工业驻地",
    env4: "高端国际峰会与活动",
    experience: "关键环境工作年限",
    certifications: "相关专业认证（如 ATLS, ACLS, PHTLS, HUET）",
    cv: "详细简历（PDF、DOC 或 DOCX，最大 5 MB）",
    chooseFile: "选择文件",
    gdpr: "我同意为评估 VVIP 及离岸任务处理我的个人数据，包括自动化筛选辅助与强制性人工审核。",
    submit: "提交 VVIP 申请",
    sending: "安全传输中…",
    successTitle: "VVIP 申请已登记",
    successText: "您的资料已提交至专项招聘组。保密追踪编号：",
    backHome: "返回首页",
    required: "请填写必填项并附加您的简历。",
    fileError: "请附加有效的 PDF、DOC 或 DOCX 格式简历（最大 5 MB）。",
    genericError: "传输错误，请检查信息后重试。",
    p1Title: "卓越与绝对保密",
    p1Desc: "严格的保密协议、安全许可与绝对隐 秘。",
    p2Title: "核心派驻区域",
    p2Desc: "波斯湾、中东、北海钻井平台及西非远洋项目。",
    p3Title: "严苛国际标准",
    p3Desc: "全面契合 OGP、Oil & Gas UK 及 AHA 医疗准则。",
    metaTitle: "VVIP 与离岸医疗人才招聘 | Hippocampus Consulting",
    metaDescription: "申请精英医疗任务：中东 VVIP、海上钻井平台、离岸工程与偏远工业驻地。",
  },
} as const;

type Language = keyof typeof copy;
type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialty: string;
  environment: string;
  yearsExperience: string;
  certifications: string;
  gdprConsent: boolean;
  website: string;
};

const initialForm: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  specialty: specialtyOptions[0],
  environment: "Moyen-Orient (Résidences / Gouvernement / VVIP)",
  yearsExperience: "",
  certifications: "",
  gdprConsent: false,
  website: "",
};

export default function VvipOffshorePage() {
  const { language } = useLanguage();
  const lang = (language in copy ? language : "fr") as Language;
  const t = copy[lang];
  const [form, setForm] = useState<FormState>(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!file || file.size > 5 * 1024 * 1024 || !["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type)) {
      setStatus("error");
      setErrorMessage(t.fileError);
      return;
    }
    if (!form.gdprConsent) {
      setStatus("error");
      setErrorMessage(t.required);
      return;
    }
    if (!form.firstName || !form.lastName || !form.email) {
      setStatus("error");
      setErrorMessage(t.required);
      return;
    }

    const body = new FormData();
    body.append("cv", file);
    body.append("firstName", form.firstName);
    body.append("lastName", form.lastName);
    body.append("email", form.email);
    body.append("phone", form.phone);
    body.append("specialty", `[VVIP/Offshore] ${form.specialty} (${form.environment})`);
    body.append("targetCountries", JSON.stringify([form.environment]));
    body.append("languages", JSON.stringify(["Français", "English"]));
    body.append("yearsExperience", form.yearsExperience);
    body.append("message", `Certifications: ${form.certifications || "Non spécifié"} | Secteur: VVIP & Offshore`);
    body.append("gdprConsent", form.gdprConsent ? "1" : "0");
    body.append("marketingConsent", "0");
    body.append("website", form.website);

    setStatus("sending");
    try {
      const res = await fetch("/api/recruitment/apply", { method: "POST", body });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || t.genericError);
      setTrackingId(payload.trackingId || "VVIP-OFFSHORE-OK");
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : t.genericError);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead title={t.metaTitle} description={t.metaDescription} ogUrl="https://drahmedbenlallahom.com/vvip-offshore" />
      <Navigation />
      <main className="pt-28 md:pt-36 pb-20">
        <section className="container grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div className="lg:sticky lg:top-32 space-y-8">
            <div>
              <p className="section-kicker">{t.eyebrow}</p>
              <h1 className="mt-4 font-display text-4xl leading-tight text-foreground md:text-5xl">{t.title}</h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">{t.intro}</p>
            </div>

            <div className="grid gap-4">
              {[
                { icon: ShieldCheck, title: t.p1Title, desc: t.p1Desc },
                { icon: Globe2, title: t.p2Title, desc: t.p2Desc },
                { icon: Zap, title: t.p3Title, desc: t.p3Desc },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="editorial-card flex items-start gap-4 p-5">
                    <div className="rounded-xl bg-primary/10 p-3 text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg text-foreground">{item.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="editorial-card p-6 md:p-8">
            {status === "success" ? (
              <div className="py-12 text-center" role="status">
                <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
                <h2 className="mt-6 font-display text-3xl text-foreground">{t.successTitle}</h2>
                <p className="mx-auto mt-4 max-w-md text-muted-foreground">{t.successText}</p>
                <p className="mt-4 rounded-xl bg-primary/10 px-6 py-4 font-mono text-xl font-bold text-primary">{trackingId}</p>
                <Link href="/" className="cta-primary mt-8 inline-flex">{t.backHome}</Link>
              </div>
            ) : (
              <>
                <h2 className="font-display text-3xl text-foreground">{t.formTitle}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.formIntro}</p>

                <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.firstName} *</span>
                      <input required value={form.firstName} onChange={(e) => update("firstName", e.target.value)} className="form-control block w-full" autoComplete="given-name" />
                    </label>
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.lastName} *</span>
                      <input required value={form.lastName} onChange={(e) => update("lastName", e.target.value)} className="form-control block w-full" autoComplete="family-name" />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.email} *</span>
                      <input type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} className="form-control block w-full" autoComplete="email" />
                    </label>
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.phone}</span>
                      <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} className="form-control block w-full" autoComplete="tel" />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.specialty} *</span>
                      <select value={form.specialty} onChange={(e) => update("specialty", e.target.value)} className="form-control block w-full">
                        {specialtyOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.environment} *</span>
                      <select value={form.environment} onChange={(e) => update("environment", e.target.value)} className="form-control block w-full">
                        <option value="Moyen-Orient (Résidences / Gouvernement / VVIP)">{t.env1}</option>
                        <option value="Plateformes pétrolières & gazières (Onshore / Offshore)">{t.env2}</option>
                        <option value="Sociétés minières & industrielles isolées">{t.env3}</option>
                        <option value="Événements internationaux de prestige">{t.env4}</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.experience}</span>
                      <input type="number" min="0" max="50" value={form.yearsExperience} onChange={(e) => update("yearsExperience", e.target.value)} className="form-control block w-full" placeholder="Ex. 8 ans" />
                    </label>
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.certifications}</span>
                      <input value={form.certifications} onChange={(e) => update("certifications", e.target.value)} className="form-control block w-full" placeholder="ATLS, ACLS, HUET, etc." />
                    </label>
                  </div>

                  <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
                    <label htmlFor="vvip-cv" className="flex cursor-pointer items-center gap-3 text-sm font-medium text-foreground">
                      <FileUp className="h-5 w-5 text-primary" />
                      <span>{file ? file.name : t.chooseFile}</span>
                      <input ref={fileInputRef} id="vvip-cv" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setFile(e.target.files?.[0] || null)} className="sr-only" required />
                    </label>
                    <p className="mt-2 text-xs text-muted-foreground">{file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : t.cv}</p>
                  </div>

                  <label className="flex items-start gap-3 text-sm text-muted-foreground">
                    <input type="checkbox" checked={form.gdprConsent} onChange={(e) => update("gdprConsent", e.target.checked)} className="mt-1 h-4 w-4 accent-primary" required />
                    <span>{t.gdpr}</span>
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

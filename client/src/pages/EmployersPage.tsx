import { FormEvent, useRef, useState } from "react";
import { CheckCircle2, FileUp, Globe2, Loader2, ShieldCheck, UsersRound, Building2 } from "lucide-react";
import { Link } from "wouter";
import { SEOHead } from "@/components/SEOHead";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";

const copy = {
  fr: {
    eyebrow: "Hippocampus Consulting · Espace Employeurs & Partenaires",
    title: "Déléguez le recrutement de vos équipes médicales d’élite.",
    intro: "Nous sélectionnons et qualifions pour les hôpitaux, cliniques, plateformes offshore et résidences VVIP des professionnels de santé d'exception, prêts à intervenir en Europe, au Canada, au Moyen-Orient et sur les sites isolés.",
    formTitle: "Soumettre un brief de mission",
    formIntro: "Précisez vos besoins opérationnels. Notre cellule spécialisée vous contactera sous 24h avec une shortlist qualifiée.",
    orgName: "Établissement ou entreprise",
    contactName: "Nom du responsable",
    email: "Email professionnel",
    phone: "Téléphone",
    targetEnvironment: "Environnement de la mission",
    env1: "Hôpital / Clinique internationale",
    env2: "Plateforme pétrolière / Site Offshore",
    env3: "Résidence VVIP / Délégation officielle",
    env4: "Site minier ou industriel isolé",
    specialtyNeeded: "Spécialité médicale ou paramédicale recherchée",
    country: "Pays / Zone géographique",
    requiredCertifications: "Certifications obligatoires (ex. ATLS, ACLS, HUET)",
    timeline: "Calendrier souhaité (ex. Immédiat, Q3 2026)",
    notes: "Détails de la mission ou contraintes particulières",
    submit: "Transmettre le brief de mission",
    sending: "Transmission sécurisée…",
    successTitle: "Brief de mission enregistré",
    successText: "Votre demande a bien été transmise à notre équipe exécutive. Votre référence de suivi :",
    successThanks: "Merci pour votre confiance.",
    successNext: "Notre équipe vous contactera sous 24 heures pour préciser le besoin, les délais et les prochaines étapes.",
    successPrivacy: "Votre brief est traité de manière confidentielle par notre cellule de recrutement.",
    backHome: "Retour à l’accueil",
    required: "Veuillez remplir les champs obligatoires.",
    genericError: "La transmission a échoué. Vérifiez vos informations et réessayez.",
    b1Title: "Shortlist qualifiée par IA & Médecins",
    b1Desc: "Double validation clinique et technique pour chaque profil présenté.",
    b2Title: "Conformité & Habilitations",
    b2Desc: "Vérification rigoureuse des ordres professionnels et certifications de sécurité.",
    b3Title: "Discrétion & Réactivité",
    b3Desc: "Accompagnement sur-mesure pour les environnements les plus exigeants.",
    metaTitle: "Espace Employeurs & Recrutement Médical | Hippocampus Consulting",
    metaDescription: "Soumettez vos briefs de recrutement médical pour hôpitaux, cliniques, plateformes offshore et missions VVIP.",
  },
  en: {
    eyebrow: "Hippocampus Consulting · Employers & Partners",
    title: "Delegate the recruitment of your elite medical teams.",
    intro: "We source and qualify exceptional healthcare professionals for hospitals, clinics, offshore rigs, and VVIP residences across Europe, Canada, the Middle East, and remote sites.",
    formTitle: "Submit a Mission Brief",
    formIntro: "Specify your operational requirements. Our specialized unit will contact you within 24 hours with a qualified shortlist.",
    orgName: "Organization or Company",
    contactName: "Contact Name",
    email: "Professional Email",
    phone: "Phone",
    targetEnvironment: "Mission Environment",
    env1: "Hospital / International Clinic",
    env2: "Oil Rig / Offshore Site",
    env3: "VVIP Residence / Official Delegation",
    env4: "Remote Mining or Industrial Site",
    specialtyNeeded: "Specialty / Profession Needed",
    country: "Country / Region",
    requiredCertifications: "Mandatory Certifications (e.g. ATLS, ACLS, HUET)",
    timeline: "Expected Timeline (e.g. Immediate, Q3 2026)",
    notes: "Mission details or specific constraints",
    submit: "Submit Mission Brief",
    sending: "Secure transmission…",
    successTitle: "Mission Brief Registered",
    successText: "Your request has been forwarded to our executive team. Your tracking reference:",
    successThanks: "Thank you for your trust.",
    successNext: "Our team will contact you within 24 hours to clarify the brief, timeline, and next steps.",
    successPrivacy: "Your brief is handled confidentially by our recruitment unit.",
    backHome: "Back to Home",
    required: "Please fill in mandatory fields.",
    genericError: "Transmission failed. Check your information and try again.",
    b1Title: "AI & Physician-Qualified Shortlist",
    b1Desc: "Double clinical and technical validation for every presented profile.",
    b2Title: "Compliance & Clearances",
    b2Desc: "Rigorous verification of medical board standing and safety certifications.",
    b3Title: "Discretion & Responsiveness",
    b3Desc: "Tailored support for the most demanding environments.",
    metaTitle: "Employers & Medical Recruitment | Hippocampus Consulting",
    metaDescription: "Submit your medical recruitment briefs for hospitals, clinics, offshore platforms, and VVIP missions.",
  },
  de: {
    eyebrow: "Hippocampus Consulting · Arbeitgeber & Partner",
    title: "Delegieren Sie die Rekrutierung Ihrer medizinischen Elite-Teams.",
    intro: "Wir rekrutieren und qualifizieren herausragende medizinische Fachkräfte für Krankenhäuser, Kliniken, Offshore-Plattformen und VVIP-Residenzen in Europa, Kanada und dem Nahen Osten.",
    formTitle: "Einsatz-Brief einreichen",
    formIntro: "Geben Sie Ihre operativen Anforderungen an. Unser spezialisiertes Team kontaktiert Sie innerhalb von 24 Stunden.",
    orgName: "Einrichtung oder Unternehmen",
    contactName: "Name des Ansprechpartners",
    email: "Berufliche E-Mail",
    phone: "Telefon",
    targetEnvironment: "Einsatzumgebung",
    env1: "Krankenhaus / Internationale Klinik",
    env2: "Bohrinsel / Offshore-Standort",
    env3: "VVIP-Residenz / Offizielle Delegation",
    env4: "Entlegener Industrie- oder Bergbaustandort",
    specialtyNeeded: "Gesuchtes medizinisches Fachgebiet",
    country: "Land / Region",
    requiredCertifications: "Erforderliche Zertifikate (z.B. ATLS, ACLS, HUET)",
    timeline: "Zeitplan (z.B. Sofort, Q3 2026)",
    notes: "Einsatzdetails oder besondere Anforderungen",
    submit: "Einsatz-Brief absenden",
    sending: "Sichere Übertragung…",
    successTitle: "Einsatz-Brief registriert",
    successText: "Ihre Anfrage wurde an unser Executive-Team übermittelt. Tracking-Referenz:",
    successThanks: "Vielen Dank für Ihr Vertrauen.",
    successNext: "Unser Team kontaktiert Sie innerhalb von 24 Stunden, um Bedarf, Zeitplan und nächste Schritte zu klären.",
    successPrivacy: "Ihr Brief wird vertraulich von unserem Recruiting-Team bearbeitet.",
    backHome: "Zur Startseite",
    required: "Bitte füllen Sie die Pflichtfelder aus.",
    genericError: "Übertragung fehlgeschlagen. Bitte überprüfen Sie Ihre Angaben.",
    b1Title: "KI- & Arzt-qualifizierte Shortlist",
    b1Desc: "Klinische und technische Doppelvalidierung für jedes Profil.",
    b2Title: "Konformität & Freigaben",
    b2Desc: "Strikte Überprüfung berufsrechtlicher Zulassungen.",
    b3Title: "Diskretion & Reaktionsfähigkeit",
    b3Desc: "Maßgeschneiderte Unterstützung für anspruchsvollste Umgebungen.",
    metaTitle: "Arbeitgeber & Medizinisches Recruiting | Hippocampus Consulting",
    metaDescription: "Reichen Sie Ihre medizinischen Recruiting-Briefs für Kliniken und Offshore-Projekte ein.",
  },
  zh: {
    eyebrow: "Hippocampus Consulting · 雇主与合作伙伴专区",
    title: "委托我们为您招募精英医疗团队。",
    intro: "我们为欧洲、加拿大、中东及偏远站点的医院、诊所、离岸钻井平台及 VVIP 宅邸甄选并认证顶尖医疗专业人员。",
    formTitle: "提交任务需求 (Brief)",
    formIntro: "请告知您的运营需求。我们的专业团队将在 24 小时内为您提供合格的候选人 shortlist。",
    orgName: "机构或公司名称",
    contactName: "负责人姓名",
    email: "职业邮箱",
    phone: "电话",
    targetEnvironment: "任务环境",
    env1: "医院 / 国际诊所",
    env2: "石油钻井平台 / 离岸工程",
    env3: "VVIP 宅邸 / 官方代表团",
    env4: "偏远矿山或工业驻地",
    specialtyNeeded: "急需医疗或医护专业",
    country: "国家 / 地区",
    requiredCertifications: "强制认证（如 ATLS, ACLS, HUET）",
    timeline: "期望时间表（如：即刻、2026年第三季度）",
    notes: "任务详情或特殊约束",
    submit: "提交任务需求",
    sending: "安全传输中…",
    successTitle: "任务需求已登记",
    successText: "您的需求已转发至高管团队。追踪参考号：",
    successThanks: "感谢您的信任。",
    successNext: "我们的团队将在 24 小时内联系您，确认需求、时间表和后续步骤。",
    successPrivacy: "您的需求将由我们的招聘团队以保密方式处理。",
    backHome: "返回首页",
    required: "请填写必填项。",
    genericError: "传输失败，请检查后重试。",
    b1Title: "AI 与医师双重背书 Shortlist",
    b1Desc: "对每个推荐档案进行严格的临床与技术双重把关。",
    b2Title: "合规与资质认证",
    b2Desc: "对医疗执业资格与安全证书进行核查。",
    b3Title: "绝对保密与高效响应",
    b3Desc: "为最具挑战性的环境提供定制化支持。",
    metaTitle: "雇主专区与医疗招聘 | Hippocampus Consulting",
    metaDescription: "为医院、诊所、离岸平台及 VVIP 任务提交医疗招聘需求。",
  },
} as const;

type Language = keyof typeof copy;
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
  targetEnvironment: "Hospital / International Clinic",
  specialtyNeeded: "",
  country: "",
  requiredCertifications: "",
  timeline: "",
  notes: "",
  website: "",
};

export default function EmployersPage() {
  const { language } = useLanguage();
  const lang = (language in copy ? language : "fr") as Language;
  const t = copy[lang];
  const [form, setForm] = useState<BriefFormState>(initialBrief);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [briefId, setBriefId] = useState("");

  const update = <K extends keyof BriefFormState>(key: K, value: BriefFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!form.organizationName || !form.contactName || !form.email || !form.specialtyNeeded || !form.country) {
      setStatus("error");
      setErrorMessage(t.required);
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch("/api/client-briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || t.genericError);
      setBriefId(payload.briefId || "BRIEF-OK");
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : t.genericError);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead title={t.metaTitle} description={t.metaDescription} ogUrl="https://drahmedbenlallahom.com/employers" />
      <Navigation />
      <main className="pt-32 md:pt-40 pb-24">
        <section className="container grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start max-w-6xl">
          <div className="lg:sticky lg:top-32 space-y-8">
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

                <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.orgName} *</span>
                      <input required value={form.organizationName} onChange={(e) => update("organizationName", e.target.value)} className="form-control block w-full" placeholder="Hôpital, Groupe, Société" />
                    </label>
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.contactName} *</span>
                      <input required value={form.contactName} onChange={(e) => update("contactName", e.target.value)} className="form-control block w-full" placeholder="Dr. / M. / Mme" />
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
                      <span className="block mb-1 font-medium">{t.targetEnvironment} *</span>
                      <select value={form.targetEnvironment} onChange={(e) => update("targetEnvironment", e.target.value)} className="form-control block w-full">
                        <option value="Hôpital / Clinique internationale">{t.env1}</option>
                        <option value="Plateforme pétrolière / Site Offshore">{t.env2}</option>
                        <option value="Résidence VVIP / Délégation officielle">{t.env3}</option>
                        <option value="Site minier ou industriel isolé">{t.env4}</option>
                      </select>
                    </label>
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.specialtyNeeded} *</span>
                      <input required value={form.specialtyNeeded} onChange={(e) => update("specialtyNeeded", e.target.value)} className="form-control block w-full" placeholder="Ex. Médecin Urgentiste, IADE, etc." />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.country} *</span>
                      <input required value={form.country} onChange={(e) => update("country", e.target.value)} className="form-control block w-full" placeholder="Ex. Arabie Saoudite, Canada, France" />
                    </label>
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-1 font-medium">{t.timeline}</span>
                      <input value={form.timeline} onChange={(e) => update("timeline", e.target.value)} className="form-control block w-full" placeholder="Ex. Immédiat, Q3 2026" />
                    </label>
                  </div>

                  <label className="block w-full space-y-2 text-sm text-foreground">
                    <span className="block mb-1 font-medium">{t.requiredCertifications}</span>
                    <input value={form.requiredCertifications} onChange={(e) => update("requiredCertifications", e.target.value)} className="form-control block w-full" placeholder="ATLS, ACLS, HUET, OGP, etc." />
                  </label>

                  <label className="block w-full space-y-2 text-sm text-foreground">
                    <span className="block mb-1 font-medium">{t.notes}</span>
                    <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} className="form-control block min-h-24 w-full" maxLength={3000} placeholder="Décrivez brièvement le contexte, les rotations ou les exigences linguistiques…" />
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

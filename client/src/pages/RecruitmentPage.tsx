import { FormEvent, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileUp, Globe2, Loader2, Search, ShieldCheck, UsersRound, X } from "lucide-react";
import { Link } from "wouter";
import { SEOHead } from "@/components/SEOHead";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";

const countryOptions = [
  { value: "France", labels: { fr: "France", en: "France", de: "Frankreich", zh: "法国" } },
  { value: "Allemagne", labels: { fr: "Allemagne", en: "Germany", de: "Deutschland", zh: "德国" } },
  { value: "Italie", labels: { fr: "Italie", en: "Italy", de: "Italien", zh: "意大利" } },
  { value: "Canada", labels: { fr: "Canada", en: "Canada", de: "Kanada", zh: "加拿大" } },
  { value: "Émirats arabes unis", labels: { fr: "Émirats arabes unis", en: "United Arab Emirates", de: "Vereinigte Arabische Emirate", zh: "阿联酋" } },
  { value: "Arabie saoudite", labels: { fr: "Arabie saoudite", en: "Saudi Arabia", de: "Saudi-Arabien", zh: "沙特阿拉伯" } },
  { value: "Qatar", labels: { fr: "Qatar", en: "Qatar", de: "Katar", zh: "卡塔尔" } },
  { value: "Autre pays du Moyen-Orient", labels: { fr: "Autre pays du Moyen-Orient", en: "Other Middle East country", de: "Anderes Land im Nahen Osten", zh: "其他中东国家" } },
] as const;

const specialtyCategories = [
  {
    category: { fr: "Médecine générale & Urgences", en: "General Practice & Emergency", de: "Allgemeinmedizin & Notfallmedizin", zh: "全科与急诊医学" },
    items: [
      "Médecine générale",
      "Médecine d’urgence",
      "Médecine intensive et réanimation",
      "Gériatrie",
      "Médecine du travail",
      "Médecine du sport",
      "Santé publique et médecine sociale",
    ],
  },
  {
    category: { fr: "Spécialités médicales", en: "Medical Specialties", de: "Medizinische Fachgebiete", zh: "内科专科" },
    items: [
      "Cardiologie",
      "Cardiologie interventionnelle",
      "Pneumologie",
      "Gastro-entérologie et hépatologie",
      "Néphrologie",
      "Neurologie",
      "Oncologie médicale",
      "Hématologie",
      "Endocrinologie, diabétologie et nutrition",
      "Rhumatologie",
      "Dermatologie et vénéréologie",
      "Pédiatrie",
      "Psychiatrie",
      "Psychiatrie de l’enfant et de l’adolescent",
      "Infectiologie et maladies tropicales",
      "Médecine physique et de réadaptation (MPR)",
    ],
  },
  {
    category: { fr: "Chirurgie & Spécialités chirurgicales", en: "Surgery & Surgical Specialties", de: "Chirurgie & Chirurgische Fachgebiete", zh: "外科与手术专科" },
    items: [
      "Chirurgie générale",
      "Chirurgie viscérale et digestive",
      "Chirurgie orthopédique et traumatologie",
      "Neurochirurgie",
      "Chirurgie cardiovasculaire et thoracique",
      "Chirurgie plastique, reconstructrice et esthétique",
      "Chirurgie pédiatrique",
      "Chirurgie maxillo-faciale",
      "Urologie",
      "Gynécologie et obstétrique",
      "Ophtalmologie",
      "Oto-rhino-laryngologie (ORL) et chirurgie cervico-faciale",
      "Stomatologie",
    ],
  },
  {
    category: { fr: "Anesthésie, Imagerie & Laboratoire", en: "Anesthesia, Imaging & Laboratory", de: "Anästhesie, Bildgebung & Labor", zh: "麻醉、影像与检验医学" },
    items: [
      "Anesthésie-réanimation",
      "Radiologie et imagerie médicale",
      "Médecine nucléaire",
      "Biologie médicale / Pathologie",
      "Anatomie et cytologie pathologiques",
      "Pharmacologie médicale",
      "Toxicologie",
    ],
  },
  {
    category: { fr: "Soins infirmiers & Paramédical", en: "Nursing & Allied Health", de: "Pflege & Paramedizinische Berufe", zh: "护理与专职医疗" },
    items: [
      "Soins infirmiers généraux",
      "Infirmier(ère) en soins généraux et spécialisés (IDE)",
      "Infirmier(ère) anesthésiste (IADE)",
      "Infirmier(ère) de bloc opératoire (IBODE)",
      "Infirmier(ère) puériculteur(trice)",
      "Infirmier(ère) en pratique avancée (IPA)",
      "Cadre de santé / Direction des soins",
      "Sage-femme",
      "Masseur-kinésithérapeute / Physiothérapeute",
      "Ergothérapeute",
      "Orthophoniste",
      "Orthoptiste",
      "Psychomotricien(ne)",
      "Manipulateur(trice) d’électroradiologie médicale (ERM)",
      "Technicien(ne) de laboratoire médical",
      "Préparateur(trice) en pharmacie",
      "Pharmacien(ne)",
      "Diététicien(ne) / Nutritionniste",
      "Psychologue clinicien(ne)",
      "Assistant(e) social(e) de santé",
    ],
  },
  {
    category: { fr: "Autre", en: "Other", de: "Sonstige", zh: "其他" },
    items: ["Autre spécialité ou profession"],
  },
] as const;

const copy = {
  fr: {
    eyebrow: "Hippocampus Consulting · Mobilité médicale",
    title: "Votre expertise peut franchir les frontières.",
    intro: "Nous constituons un réseau international de professionnels de santé pour des opportunités sélectionnées en Europe, au Canada et au Moyen-Orient.",
    nav: "Recrutement",
    formTitle: "Déposer votre candidature",
    formIntro: "Envoyez-nous votre profil. Une candidature complète nous permet de vous orienter vers les opportunités pertinentes.",
    firstName: "Prénom", lastName: "Nom", email: "Email professionnel", phone: "Téléphone", specialty: "Spécialité / profession", specialtySearch: "Rechercher une spécialité…", specialtyCustom: "Précisez votre spécialité ou profession", countries: "Pays ciblés", languages: "Langues professionnelles", experience: "Années d’expérience", message: "Message ou projet professionnel", cv: "CV (PDF, DOC ou DOCX — 5 Mo maximum)", chooseFile: "Choisir un fichier", noFile: "Aucun fichier sélectionné", gdpr: "J’accepte que mes données soient traitées pour l’examen de ma candidature, y compris par une analyse automatisée d’aide à la présélection, conformément à la politique de confidentialité. Une revue humaine est toujours requise et aucune décision n’est prise uniquement par l’IA.", marketing: "J’accepte de recevoir occasionnellement des informations sur des opportunités professionnelles.", submit: "Envoyer ma candidature", sending: "Envoi en cours…", successTitle: "Candidature reçue", successText: "Votre profil a bien été enregistré. Conservez votre numéro de suivi :", backHome: "Retour au site", required: "Champ obligatoire", consentError: "Votre consentement RGPD est requis.", fileError: "Veuillez joindre un CV au format PDF, DOC ou DOCX de 5 Mo maximum.", genericError: "La candidature n’a pas pu être envoyée. Vérifiez les informations et réessayez.", privacyNote: "Ne transmettez aucune donnée de patient, dossier médical ou information clinique dans ce formulaire.", confidentiality: "Données traitées de manière confidentielle", international: "Opportunités internationales sélectionnées", humanReview: "Examen humain de chaque profil", select: "Sélectionner dans la liste", otherSpecialty: "Autre spécialité ou profession", noMatch: "Aucune spécialité ne correspond à votre recherche.",
    metaTitle: "Recrutement international de professionnels de santé | Hippocampus Consulting", metaDescription: "Déposez votre CV pour être considéré pour des opportunités de recrutement médical en Europe, au Canada et au Moyen-Orient.",
  },
  en: {
    eyebrow: "Hippocampus Consulting · Medical mobility", title: "Your expertise can cross borders.", intro: "We are building an international network of healthcare professionals for selected opportunities in Europe, Canada and the Middle East.", nav: "Recruitment", formTitle: "Submit your application", formIntro: "Share your profile with us. A complete application helps us identify relevant opportunities.", firstName: "First name", lastName: "Last name", email: "Professional email", phone: "Phone", specialty: "Specialty / profession", specialtySearch: "Search a specialty…", specialtyCustom: "Specify your specialty or profession", countries: "Target countries", languages: "Professional languages", experience: "Years of experience", message: "Message or professional project", cv: "CV (PDF, DOC or DOCX — 5 MB maximum)", chooseFile: "Choose a file", noFile: "No file selected", gdpr: "I consent to my data being processed to review my application, including automated analysis to assist pre-screening, in accordance with the privacy policy. Human review is always required and no decision is made solely by AI.", marketing: "I agree to occasionally receive information about professional opportunities.", submit: "Submit my application", sending: "Sending…", successTitle: "Application received", successText: "Your profile has been registered. Keep your tracking number:", backHome: "Back to site", required: "Required field", consentError: "GDPR consent is required.", fileError: "Please attach a PDF, DOC or DOCX CV up to 5 MB.", genericError: "Your application could not be sent. Check the information and try again.", privacyNote: "Do not submit patient data, medical records or clinical information through this form.", confidentiality: "Confidential data handling", international: "Selected international opportunities", humanReview: "Human review of every profile", select: "Select from list", otherSpecialty: "Other specialty or profession", noMatch: "No specialty matches your search.",
    metaTitle: "International healthcare recruitment | Hippocampus Consulting", metaDescription: "Submit your CV to be considered for healthcare recruitment opportunities in Europe, Canada and the Middle East.",
  },
  de: {
    eyebrow: "Hippocampus Consulting · Medizinische Mobilität", title: "Ihre Expertise kennt keine Grenzen.", intro: "Wir bauen ein internationales Netzwerk von Gesundheitsfachkräften für ausgewählte Möglichkeiten in Europa, Kanada und dem Nahen Osten auf.", nav: "Recruiting", formTitle: "Bewerbung einreichen", formIntro: "Teilen Sie Ihr Profil mit uns. Eine vollständige Bewerbung erleichtert die Zuordnung zu passenden Möglichkeiten.", firstName: "Vorname", lastName: "Nachname", email: "Berufliche E-Mail", phone: "Telefon", specialty: "Fachgebiet / Beruf", specialtySearch: "Fachgebiet suchen…", specialtyCustom: "Geben Sie Ihr Fachgebiet an", countries: "Zielländer", languages: "Berufssprachen", experience: "Berufserfahrung in Jahren", message: "Nachricht oder berufliches Projekt", cv: "Lebenslauf (PDF, DOC oder DOCX — maximal 5 MB)", chooseFile: "Datei auswählen", noFile: "Keine Datei ausgewählt", gdpr: "Ich stimme der Verarbeitung meiner Daten zur Prüfung meiner Bewerbung einschließlich einer automatisierten Analyse zur Unterstützung der Vorauswahl gemäß der Datenschutzerklärung zu. Eine menschliche Prüfung ist immer erforderlich; keine Entscheidung wird ausschließlich durch KI getroffen.", marketing: "Ich möchte gelegentlich Informationen zu beruflichen Möglichkeiten erhalten.", submit: "Bewerbung senden", sending: "Wird gesendet…", successTitle: "Bewerbung erhalten", successText: "Ihr Profil wurde gespeichert. Bewahren Sie Ihre Referenznummer auf:", backHome: "Zur Website", required: "Pflichtfeld", consentError: "Die RGPD-Zustimmung ist erforderlich.", fileError: "Bitte fügen Sie einen PDF-, DOC- oder DOCX-Lebenslauf bis 5 MB bei.", genericError: "Die Bewerbung konnte nicht gesendet werden. Bitte prüfen Sie die Angaben und versuchen Sie es erneut.", privacyNote: "Übermitteln Sie keine Patientendaten, medizinischen Akten oder klinischen Informationen über dieses Formular.", confidentiality: "Vertrauliche Datenverarbeitung", international: "Ausgewählte internationale Möglichkeiten", humanReview: "Menschliche Prüfung jedes Profils", select: "Aus der Liste wählen", otherSpecialty: "Anderes Fachgebiet", noMatch: "Keine passende Fachgebiet gefunden.",
    metaTitle: "Internationales Recruiting von Gesundheitsfachkräften | Hippocampus Consulting", metaDescription: "Reichen Sie Ihren Lebenslauf für internationale Recruiting-Möglichkeiten in Europa, Kanada und dem Nahen Osten ein.",
  },
  zh: {
    eyebrow: "Hippocampus Consulting · 国际医疗人才流动", title: "让您的专业能力走向国际。", intro: "我们正在建立医疗专业人员国际网络，匹配欧洲、加拿大和中东地区经过筛选的职业机会。", nav: "招聘", formTitle: "提交申请", formIntro: "请分享您的职业资料。完整的申请有助于我们识别合适的机会。", firstName: "名", lastName: "姓", email: "职业邮箱", phone: "电话", specialty: "专业 / 职业", specialtySearch: "搜索专业…", specialtyCustom: "请输入您的专业或职业", countries: "目标国家", languages: "职业语言", experience: "工作年限", message: "留言或职业项目", cv: "简历（PDF、DOC 或 DOCX，最大 5 MB）", chooseFile: "选择文件", noFile: "未选择文件", gdpr: "我同意根据隐私政策处理我的个人数据以审核申请，包括使用自动化分析辅助初步筛选。始终需要人工审核，不会仅依据人工智能作出决定。", marketing: "我同意偶尔接收职业机会相关信息。", submit: "提交申请", sending: "正在发送…", successTitle: "已收到申请", successText: "您的资料已登记。请保存您的跟踪编号：", backHome: "返回网站", required: "必填项", consentError: "需要您的隐私同意。", fileError: "请附加不超过 5 MB 的 PDF、DOC 或 DOCX 简历。", genericError: "申请无法发送。请检查信息后重试。", privacyNote: "请勿在此表单中提交患者数据、病历或临床信息。", confidentiality: "机密数据处理", international: "精选国际机会", humanReview: "人工审核每份资料", select: "从列表中选择", otherSpecialty: "其他专业或职业", noMatch: "未找到符合条件的专业。",
    metaTitle: "International healthcare recruitment | Hippocampus Consulting", metaDescription: "Submit your CV to be considered for healthcare recruitment opportunities in Europe, Canada and the Middle East.",
  },
} as const;

type Language = keyof typeof copy;
type FormState = {
  firstName: string; lastName: string; email: string; phone: string; specialty: string; specialtyCustom: string; targetCountries: string[]; languages: string; yearsExperience: string; message: string; gdprConsent: boolean; marketingConsent: boolean; website: string;
};

const initialForm: FormState = { firstName: "", lastName: "", email: "", phone: "", specialty: "", specialtyCustom: "", targetCountries: [], languages: "", yearsExperience: "", message: "", gdprConsent: false, marketingConsent: false, website: "" };

export default function RecruitmentPage() {
  const { language } = useLanguage();
  const lang = (language in copy ? language : "fr") as Language;
  const t = copy[lang];
  const [form, setForm] = useState<FormState>(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [specialtyQuery, setSpecialtyQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedCountryLabels = useMemo(() => countryOptions.filter(country => form.targetCountries.includes(country.value)).map(country => country.labels[lang]).join(", "), [form.targetCountries, lang]);

  const filteredSpecialtyCategories = useMemo(() => {
    const q = specialtyQuery.trim().toLowerCase();
    if (!q) return specialtyCategories;
    return specialtyCategories.map(group => {
      const filteredItems = group.items.filter(item => item.toLowerCase().includes(q) || group.category.fr.toLowerCase().includes(q));
      return { ...group, items: filteredItems };
    }).filter(group => group.items.length > 0);
  }, [specialtyQuery]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(previous => ({ ...previous, [key]: value }));

  const toggleCountry = (country: string) => {
    update("targetCountries", form.targetCountries.includes(country) ? form.targetCountries.filter(item => item !== country) : [...form.targetCountries, country]);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    if (!file || file.size > 5 * 1024 * 1024 || !["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type)) {
      setStatus("error"); setErrorMessage(t.fileError); return;
    }
    if (!form.gdprConsent) { setStatus("error"); setErrorMessage(t.consentError); return; }
    
    const finalSpecialty = form.specialty === "Autre spécialité ou profession" ? form.specialtyCustom.trim() : form.specialty;
    if (!form.targetCountries.length || !finalSpecialty || !form.firstName || !form.lastName || !form.email) {
      setStatus("error"); setErrorMessage(`${t.required}.`); return;
    }

    const body = new FormData();
    body.append("cv", file);
    body.append("firstName", form.firstName);
    body.append("lastName", form.lastName);
    body.append("email", form.email);
    body.append("phone", form.phone);
    body.append("specialty", finalSpecialty);
    body.append("targetCountries", JSON.stringify(form.targetCountries));
    body.append("languages", JSON.stringify(form.languages.split(",").map(item => item.trim()).filter(Boolean)));
    body.append("yearsExperience", form.yearsExperience);
    body.append("message", form.message);
    body.append("gdprConsent", form.gdprConsent ? "1" : "0");
    body.append("marketingConsent", form.marketingConsent ? "1" : "0");
    body.append("website", form.website);

    setStatus("sending");
    try {
      const response = await fetch("/api/recruitment/apply", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t.genericError);
      setTrackingId(payload.trackingId || "");
      setStatus("success");
    } catch (submissionError) {
      setStatus("error"); setErrorMessage(submissionError instanceof Error ? submissionError.message : t.genericError);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead title={t.metaTitle} description={t.metaDescription} ogUrl="https://drahmedbenlallahom.com/recruitment" />
      <Navigation />
      <main className="recruitment-page pt-28 md:pt-36">
        <section className="container grid gap-12 pb-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="lg:sticky lg:top-32">
            <p className="section-kicker">{t.eyebrow}</p>
            <h1 className="mt-5 max-w-2xl font-display text-4xl leading-tight text-foreground md:text-6xl">{t.title}</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">{t.intro}</p>
            <div className="mt-10 grid gap-3">
              {[{ icon: Globe2, text: t.international }, { icon: ShieldCheck, text: t.confidentiality }, { icon: UsersRound, text: t.humanReview }].map(item => { const Icon = item.icon; return <div key={item.text} className="editorial-card flex items-center gap-3 p-4"><Icon className="h-5 w-5 shrink-0 text-primary" /><span className="text-sm text-foreground">{item.text}</span></div>; })}
            </div>
            <p className="mt-8 text-sm text-muted-foreground">{t.privacyNote}</p>
          </div>

          <div className="editorial-card p-5 md:p-8">
            {status === "success" ? (
              <div className="py-10 text-center" role="status">
                <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
                <h2 className="mt-5 font-display text-3xl text-foreground">{t.successTitle}</h2>
                <p className="mx-auto mt-3 max-w-md text-muted-foreground">{t.successText}</p>
                <p className="mt-4 rounded-lg bg-primary/10 px-4 py-3 font-mono text-lg font-semibold text-primary">{trackingId}</p>
                <Link href="/" className="cta-primary mt-8 inline-flex">{t.backHome}</Link>
              </div>
            ) : (
              <>
                <h2 className="font-display text-3xl text-foreground">{t.formTitle}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.formIntro}</p>
                <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[{ key: "firstName" as const, label: t.firstName }, { key: "lastName" as const, label: t.lastName }].map(field => <label key={field.key} className="space-y-2 text-sm text-foreground"><span>{field.label} *</span><input id={`recruitment-${field.key}`} required value={form[field.key]} onChange={event => update(field.key, event.target.value)} className="form-control" autoComplete={field.key === "firstName" ? "given-name" : "family-name"} /></label>)}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm text-foreground"><span>{t.email} *</span><input id="recruitment-email" type="email" required value={form.email} onChange={event => update("email", event.target.value)} className="form-control" autoComplete="email" /></label>
                    <label className="space-y-2 text-sm text-foreground"><span>{t.phone}</span><input id="recruitment-phone" type="tel" value={form.phone} onChange={event => update("phone", event.target.value)} className="form-control" autoComplete="tel" /></label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-2 font-medium">{t.specialty} *</span>
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <input
                          type="text"
                          value={specialtyQuery}
                          onChange={event => setSpecialtyQuery(event.target.value)}
                          placeholder={t.specialtySearch}
                          className="form-control block w-full pl-9 pr-8 text-sm"
                        />
                        {specialtyQuery && (
                          <button
                            type="button"
                            onClick={() => setSpecialtyQuery("")}
                            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <select id="recruitment-specialty" required value={form.specialty} onChange={event => update("specialty", event.target.value)} className="form-control block w-full mt-1">
                        <option value="">{t.select}</option>
                        {filteredSpecialtyCategories.length === 0 ? (
                          <option value="" disabled>{t.noMatch}</option>
                        ) : (
                          filteredSpecialtyCategories.map(group => (
                            <optgroup key={group.category.fr} label={group.category[lang] || group.category.fr}>
                              {group.items.map(item => <option key={item} value={item}>{item}</option>)}
                            </optgroup>
                          ))
                        )}
                      </select>
                      {form.specialty && form.specialty !== "Autre spécialité ou profession" && (
                        <p className="mt-1.5 text-xs text-primary font-medium">Sélectionné : {form.specialty}</p>
                      )}
                    </div>
                    
                    <label className="block w-full space-y-2 text-sm text-foreground">
                      <span className="block mb-2 font-medium">{t.experience}</span>
                      <input id="recruitment-experience" type="number" min="0" max="70" value={form.yearsExperience} onChange={event => update("yearsExperience", event.target.value)} className="form-control block w-full mt-1" />
                    </label>
                  </div>

                  {form.specialty === "Autre spécialité ou profession" && (
                    <label className="block w-full space-y-2 text-sm text-foreground animate-in fade-in duration-200">
                      <span className="block mb-2 font-medium">{t.specialtyCustom} *</span>
                      <input id="recruitment-specialty-custom" required value={form.specialtyCustom} onChange={event => update("specialtyCustom", event.target.value)} placeholder="Ex. Perfusionniste, Audioprothésiste, etc." className="form-control block w-full mt-1" />
                    </label>
                  )}

                  <fieldset><legend className="mb-3 text-sm font-medium text-foreground">{t.countries} *</legend><div className="grid gap-2 sm:grid-cols-2">{countryOptions.map(country => <label key={country.value} className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm text-foreground"><input type="checkbox" checked={form.targetCountries.includes(country.value)} onChange={() => toggleCountry(country.value)} className="h-4 w-4 accent-primary" />{country.labels[lang]}</label>)}</div><p className="sr-only">{selectedCountryLabels}</p></fieldset>
                  
                  <label className="block w-full space-y-2 text-sm text-foreground">
                    <span className="block mb-2 font-medium">{t.languages}</span>
                    <input id="recruitment-languages" value={form.languages} onChange={event => update("languages", event.target.value)} placeholder="Français, English, Deutsch" className="form-control block w-full mt-1" />
                  </label>
                  
                  <label className="block w-full space-y-2 text-sm text-foreground">
                    <span className="block mb-2 font-medium">{t.message}</span>
                    <textarea id="recruitment-message" value={form.message} onChange={event => update("message", event.target.value)} className="form-control block min-h-28 w-full mt-1" maxLength={5000} />
                  </label>
                  
                  <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4"><label htmlFor="recruitment-cv" className="flex cursor-pointer items-center gap-3 text-sm font-medium text-foreground"><FileUp className="h-5 w-5 text-primary" /><span>{file ? file.name : t.chooseFile}</span><input ref={fileInputRef} id="recruitment-cv" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => setFile(event.target.files?.[0] || null)} className="sr-only" required /></label><p className="mt-2 text-xs text-muted-foreground">{file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : t.cv}</p></div>
                  <label className="flex items-start gap-3 text-sm text-muted-foreground"><input type="checkbox" checked={form.gdprConsent} onChange={event => update("gdprConsent", event.target.checked)} className="mt-1 h-4 w-4 accent-primary" required /><span>{t.gdpr}</span></label>
                  <label className="flex items-start gap-3 text-sm text-muted-foreground"><input type="checkbox" checked={form.marketingConsent} onChange={event => update("marketingConsent", event.target.checked)} className="mt-1 h-4 w-4 accent-primary" /><span>{t.marketing}</span></label>
                  <label className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true"><span>Website</span><input tabIndex={-1} autoComplete="off" value={form.website} onChange={event => update("website", event.target.value)} /></label>
                  {status === "error" && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{errorMessage}</p>}
                  <button type="submit" disabled={status === "sending"} className="cta-primary w-full justify-center">{status === "sending" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.sending}</> : t.submit}</button>
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

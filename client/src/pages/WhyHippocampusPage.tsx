import { ArrowRight, Globe2, ShieldCheck, UsersRound } from "lucide-react";
import { Link } from "wouter";
import { SEOHead } from "@/components/SEOHead";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";

const content = {
  fr: {
    eyebrow: "Hippocampus Consulting · Méthode Employeurs",
    title: "Une shortlist médicale conçue pour vos environnements critiques.",
    intro: "Nous accompagnons hôpitaux, cliniques, groupes industriels et opérateurs offshore dans l’identification de professionnels médicaux et paramédicaux qualifiés, disponibles et mobiles à l’international.",
    action: "Soumettre un brief de mission",
    secondary: "Découvrir le recrutement",
    trust: "Confidentialité, consentement et validation humaine à chaque étape.",
    method: "Notre méthode en quatre étapes",
    steps: [
      ["1. Cadrage", "Besoin clinique, contraintes terrain, habilitations, langues et calendrier."],
      ["2. Qualification", "Spécialité, expérience, mobilité, disponibilités et certifications."],
      ["3. Revue humaine", "L’IA organise les informations ; toute sélection reste humaine."],
      ["4. Shortlist", "Une sélection confidentielle et explicable, adaptée à la mission."],
    ],
    zones: "Europe · Canada · Moyen-Orient · Afrique · Sites offshore et industriels isolés",
    guarantees: [
      ["Confidentialité", "Briefs, CV et documents restent dans des parcours privés et contrôlés."],
      ["Conformité", "Consentements, droits RGPD et validation documentaire sont intégrés."],
      ["Réactivité", "Un suivi administratif clair et une shortlist exploitable pour chaque mission."],
    ],
    metaTitle: "Pourquoi Hippocampus Consulting | Recrutement médical international",
    metaDescription: "La méthode Hippocampus Consulting pour des shortlists médicales et paramédicales internationales, confidentielles et validées humainement.",
  },
  en: {
    eyebrow: "Hippocampus Consulting · Employer Method",
    title: "A medical shortlist built for your critical environments.",
    intro: "We support hospitals, clinics, industrial groups and offshore operators in identifying qualified, available and internationally mobile medical and allied-health professionals.",
    action: "Submit a mission brief",
    secondary: "Explore recruitment",
    trust: "Confidentiality, consent and human validation at every stage.",
    method: "Our four-step method",
    steps: [["1. Scope", "Clinical needs, field constraints, clearances, languages and timeline."], ["2. Qualification", "Specialty, experience, mobility, availability and certifications."], ["3. Human review", "AI organizes information; every selection remains human."], ["4. Shortlist", "A confidential and explainable selection adapted to the mission."]],
    zones: "Europe · Canada · Middle East · Africa · Offshore and remote industrial sites",
    guarantees: [["Confidentiality", "Briefs, CVs and documents stay in private, controlled workflows."], ["Compliance", "Consent, data rights and documentary validation are integrated."], ["Responsiveness", "Clear administrative follow-up and a usable shortlist for each mission."]],
    metaTitle: "Why Hippocampus Consulting | International medical recruitment",
    metaDescription: "Hippocampus Consulting’s method for confidential, human-validated international medical and allied-health shortlists.",
  },
  de: {
    eyebrow: "Hippocampus Consulting · Methode für Arbeitgeber",
    title: "Eine medizinische Shortlist für Ihre kritischen Einsatzumgebungen.",
    intro: "Wir unterstützen Krankenhäuser, Kliniken, Industriegruppen und Offshore-Betreiber bei der Suche nach qualifizierten, verfügbaren und international mobilen medizinischen und paramedizinischen Fachkräften.",
    action: "Einsatz-Brief einreichen",
    secondary: "Rekrutierung entdecken",
    trust: "Vertraulichkeit, Einwilligung und menschliche Validierung in jeder Phase.",
    method: "Unsere Methode in vier Schritten",
    steps: [["1. Bedarfsklärung", "Klinischer Bedarf, Einsatzbedingungen, Freigaben, Sprachen und Zeitplan."], ["2. Qualifizierung", "Fachgebiet, Erfahrung, Mobilität, Verfügbarkeit und Zertifikate."], ["3. Menschliche Prüfung", "KI strukturiert Informationen; jede Auswahl bleibt menschlich."], ["4. Shortlist", "Eine vertrauliche und nachvollziehbare Auswahl für den Einsatz."]],
    zones: "Europa · Kanada · Naher Osten · Afrika · Offshore- und abgelegene Industriestandorte",
    guarantees: [["Vertraulichkeit", "Briefs, Lebensläufe und Dokumente bleiben in privaten, kontrollierten Prozessen."], ["Konformität", "Einwilligungen, Datenschutzrechte und Dokumentprüfung sind integriert."], ["Reaktionsfähigkeit", "Klares administratives Follow-up und eine nutzbare Shortlist für jede Mission."]],
    metaTitle: "Warum Hippocampus Consulting | Internationale medizinische Rekrutierung",
    metaDescription: "Die Methode von Hippocampus Consulting für vertrauliche und menschlich validierte internationale medizinische Shortlists.",
  },
  zh: {
    eyebrow: "Hippocampus Consulting · 雇主方法",
    title: "为关键环境打造的医疗人才短名单。",
    intro: "我们协助医院、诊所、工业集团和海上运营方寻找具备资质、可及时到岗并能国际流动的医疗及辅助医疗专业人士。",
    action: "提交任务需求",
    secondary: "了解招聘服务",
    trust: "每一步均遵循保密、同意和人工验证原则。",
    method: "我们的四步方法",
    steps: [["1. 需求界定", "明确临床需求、现场限制、资质要求、语言和时间表。"], ["2. 资格筛选", "按专业、经验、流动性、可用性和证书筛选候选人。"], ["3. 人工审核", "AI 用于整理信息；所有筛选始终由人工完成。"], ["4. 短名单", "为任务场景提供保密且可解释的候选人名单。"]],
    zones: "欧洲 · 加拿大 · 中东 · 非洲 · 海上及偏远工业场地",
    guarantees: [["保密", "任务需求、简历和文件均在私密、受控的流程中处理。"], ["合规", "同意、数据权利和文件验证均已纳入流程。"], ["响应速度", "每项任务都有清晰的行政跟进和可用短名单。"]],
    metaTitle: "为何选择 Hippocampus Consulting | 国际医疗招聘",
    metaDescription: "了解 Hippocampus Consulting 如何提供保密且经人工验证的国际医疗人才短名单。",
  },
} as const;

export default function WhyHippocampusPage() {
  const { language } = useLanguage();
  const t = content[language as keyof typeof content] ?? content.fr;
  const stepIcons = [UsersRound, Globe2, ShieldCheck, ArrowRight];
  const guaranteeIcons = [ShieldCheck, UsersRound, Globe2];

  return <div className="min-h-screen bg-[#050b14] text-slate-100">
    <SEOHead title={t.metaTitle} description={t.metaDescription} />
    <Navigation />
    <main>
      <section className="relative overflow-hidden border-b border-cyan-400/15 px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(10,182,206,0.2),transparent_32%),radial-gradient(circle_at_12%_72%,rgba(20,66,130,0.28),transparent_36%)]" />
        <div className="relative mx-auto max-w-6xl">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">{t.eyebrow}</p>
          <div className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div><h1 className="max-w-4xl font-serif text-4xl leading-tight text-white sm:text-5xl lg:text-6xl">{t.title}</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">{t.intro}</p><div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/employers" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-6 font-semibold text-slate-950 transition hover:bg-cyan-300">{t.action}<ArrowRight size={18} /></Link><Link href="/recruitment" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-500/60 px-6 font-semibold text-slate-100">{t.secondary}</Link></div></div>
            <div className="rounded-2xl border border-cyan-300/20 bg-slate-950/50 p-6 backdrop-blur"><Globe2 className="mb-4 text-cyan-300" size={36} /><p className="text-sm font-semibold leading-6 text-cyan-100">{t.zones}</p><p className="mt-4 border-t border-slate-700/70 pt-4 text-sm leading-6 text-slate-300">{t.trust}</p></div>
          </div>
        </div>
      </section>
      <section className="px-4 py-20 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><h2 className="font-serif text-3xl text-white sm:text-4xl">{t.method}</h2><div className="mt-10 grid gap-4 md:grid-cols-2">{t.steps.map(([title, description], index) => { const Icon = stepIcons[index]; return <article key={title} className="rounded-2xl border border-slate-700/70 bg-slate-900/55 p-6"><Icon className="mb-5 text-cyan-300" size={24} /><h3 className="text-xl font-semibold text-white">{title}</h3><p className="mt-3 leading-7 text-slate-300">{description}</p></article>; })}</div></div></section>
      <section className="border-y border-slate-800 bg-slate-950/70 px-4 py-20 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><div className="grid gap-4 md:grid-cols-3">{t.guarantees.map(([title, description], index) => { const Icon = guaranteeIcons[index]; return <article key={title} className="rounded-2xl border border-slate-800 bg-[#07111e] p-6"><Icon className="mb-4 text-[#c7a56a]" size={22} /><h3 className="font-semibold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-300">{description}</p></article>; })}</div></div></section>
    </main>
    <Footer />
  </div>;
}

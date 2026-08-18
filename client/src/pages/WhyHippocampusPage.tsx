import { ArrowRight, BadgeCheck, ClipboardCheck, Globe2, LockKeyhole, MapPin, ShieldCheck, UsersRound } from "lucide-react";
import { Link } from "wouter";
import { SEOHead } from "@/components/SEOHead";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import { useLanguage } from "@/contexts/LanguageContext";

const copy = {
  fr: {
    eyebrow: "Hippocampus Consulting · Partenaire recrutement",
    title: "La précision clinique au service de vos recrutements critiques.",
    intro: "Nous accompagnons hôpitaux, cliniques, groupes industriels et opérateurs offshore dans l’identification de professionnels médicaux et paramédicaux adaptés à leurs environnements, contraintes et délais.",
    primaryCta: "Soumettre un brief de mission",
    secondaryCta: "Découvrir notre méthode",
    promiseTitle: "Une approche conçue pour les environnements qui ne tolèrent pas l’approximation.",
    promiseDesc: "Notre sélection combine lecture clinique, qualification opérationnelle et validation humaine. L’IA organise l’information ; elle ne décide jamais à votre place.",
    principles: [
      ["Shortlists explicables", "Chaque profil est présenté avec une synthèse structurée : spécialité, certifications, langues, mobilité, disponibilité et éléments à confirmer."],
      ["Confidentialité par défaut", "Les briefs, les CV et les échanges sont traités de manière restreinte. Les candidats ne sont contactés que dans le respect de leur consentement."],
      ["Réactivité opérationnelle", "Un interlocuteur clarifie votre besoin, priorise les critères essentiels et pilote la recherche selon vos délais."],
    ],
    methodKicker: "Notre méthode",
    methodTitle: "Du besoin à la shortlist, un parcours clair en quatre temps.",
    steps: [
      ["01", "Cadrage du brief", "Nous clarifions le périmètre, les exigences réglementaires, les langues, la disponibilité et les contraintes du terrain."],
      ["02", "Sourcing & qualification", "Nous interrogeons le vivier consentant et qualifions les profils sur les critères réellement utiles à votre mission."],
      ["03", "Shortlist argumentée", "Vous recevez une sélection resserrée, lisible et justifiée, soumise à une validation humaine avant toute présentation."],
      ["04", "Coordination du recrutement", "Nous facilitons les échanges, les compléments documentaires et les étapes suivantes avec les parties concernées."],
    ],
    territoriesKicker: "Zones couvertes",
    territoriesTitle: "Une présence internationale, avec une lecture locale des missions.",
    territoriesDesc: "Les recherches sont adaptées aux règles d’exercice, aux exigences de mobilité et aux réalités de chaque environnement d’intervention.",
    territories: ["Europe", "Canada", "Moyen-Orient", "Afrique", "Sites offshore et isolés"],
    guaranteeKicker: "Garanties de collaboration",
    guaranteeTitle: "Un recrutement exigeant, traçable et toujours sous contrôle humain.",
    guarantees: [
      ["Décision humaine", "Aucune décision d’embauche n’est automatisée. Les outils d’analyse servent uniquement à préparer la revue par nos équipes et la vôtre."],
      ["Consentement et discrétion", "Les campagnes et prises de contact respectent les choix des candidats ; chaque action administrative sensible est journalisée."],
      ["Qualifications vérifiables", "Les certifications, langues, expériences et disponibilités sont structurées afin de faciliter les vérifications nécessaires."],
    ],
    finalTitle: "Prêt à constituer votre prochaine équipe ?",
    finalDesc: "Partagez votre besoin. Nous revenons vers vous pour confirmer le périmètre de mission, le calendrier et les critères de votre shortlist.",
    finalCta: "Démarrer avec un brief de mission",
    metaTitle: "Pourquoi Hippocampus Consulting | Recrutement médical",
    metaDescription: "Découvrez la méthode Hippocampus Consulting : recrutement médical et paramédical international, confidentialité, shortlist humaine et zones couvertes.",
  },
  en: {
    eyebrow: "Hippocampus Consulting · Recruitment partner",
    title: "Clinical precision for your critical recruitment needs.",
    intro: "We support hospitals, clinics, industrial groups and offshore operators in identifying healthcare and allied health professionals suited to their environments, constraints and timelines.",
    primaryCta: "Submit a mission brief",
    secondaryCta: "Explore our method",
    promiseTitle: "An approach designed for environments where approximation is not an option.",
    promiseDesc: "Our selection combines clinical understanding, operational qualification and human review. AI organizes information; it never makes the decision for you.",
    principles: [["Explainable shortlists", "Each profile comes with a structured summary: specialty, certifications, languages, mobility, availability and points to confirm."], ["Confidential by design", "Briefs, CVs and communications are handled on a restricted basis. Candidates are contacted only in line with their consent."], ["Operational responsiveness", "A dedicated contact clarifies your need, prioritizes essential criteria and steers the search to your timeline."]],
    methodKicker: "Our method", methodTitle: "From requirements to shortlist: four clear stages.",
    steps: [["01", "Brief calibration", "We clarify scope, regulatory expectations, languages, availability and field constraints."], ["02", "Sourcing & qualification", "We engage the consented talent pool and qualify profiles against the criteria that matter to your mission."], ["03", "Reasoned shortlist", "You receive a focused, readable and justified selection, subject to human review before any presentation."], ["04", "Recruitment coordination", "We facilitate exchanges, document follow-ups and the next steps with all relevant parties."]],
    territoriesKicker: "Covered regions", territoriesTitle: "International reach, with a local understanding of each assignment.", territoriesDesc: "Every search is adapted to practice requirements, mobility constraints and local operational realities.", territories: ["Europe", "Canada", "Middle East", "Africa", "Offshore and remote sites"],
    guaranteeKicker: "Collaboration guarantees", guaranteeTitle: "Demanding, traceable recruitment under human control.",
    guarantees: [["Human decision-making", "No hiring decision is automated. Analysis tools only prepare review by our teams and yours."], ["Consent & discretion", "Campaigns and contacts respect candidate choices; sensitive administrative actions are logged."], ["Verifiable qualifications", "Certifications, languages, experience and availability are structured to support the necessary checks."]],
    finalTitle: "Ready to build your next team?", finalDesc: "Share your requirements. We will return to confirm the mission scope, timeline and shortlist criteria.", finalCta: "Start with a mission brief",
    metaTitle: "Why Hippocampus Consulting | Healthcare Recruitment", metaDescription: "Discover Hippocampus Consulting’s approach to international healthcare recruitment, confidentiality, human shortlists and covered regions.",
  },
  de: {
    eyebrow: "Hippocampus Consulting · Recruiting-Partner", title: "Klinische Präzision für Ihre kritischen Personalbedarfe.", intro: "Wir unterstützen Krankenhäuser, Kliniken, Industriegruppen und Offshore-Betreiber bei der Identifikation medizinischer und paramedizinischer Fachkräfte für ihre Anforderungen, Rahmenbedingungen und Zeitpläne.", primaryCta: "Einsatz-Brief einreichen", secondaryCta: "Unsere Methode entdecken",
    promiseTitle: "Ein Ansatz für Umgebungen, in denen Präzision entscheidend ist.", promiseDesc: "Unsere Auswahl verbindet klinisches Verständnis, operative Qualifizierung und menschliche Prüfung. KI strukturiert Informationen; sie trifft niemals die Entscheidung für Sie.",
    principles: [["Nachvollziehbare Shortlists", "Jedes Profil enthält eine strukturierte Übersicht: Fachgebiet, Zertifikate, Sprachen, Mobilität, Verfügbarkeit und offene Punkte."], ["Vertraulichkeit als Standard", "Briefings, Lebensläufe und Kommunikation werden restriktiv behandelt. Kandidaten werden nur entsprechend ihrer Einwilligung kontaktiert."], ["Operative Reaktionsfähigkeit", "Ein fester Ansprechpartner klärt den Bedarf, priorisiert Kernkriterien und steuert die Suche gemäß Ihrem Zeitplan."]],
    methodKicker: "Unsere Methode", methodTitle: "Vom Bedarf zur Shortlist in vier klaren Schritten.",
    steps: [["01", "Briefing", "Wir klären Umfang, regulatorische Anforderungen, Sprachen, Verfügbarkeit und Einsatzbedingungen."], ["02", "Sourcing & Qualifizierung", "Wir nutzen den einwilligungsbasierten Talentpool und qualifizieren Profile anhand der missionsrelevanten Kriterien."], ["03", "Begründete Shortlist", "Sie erhalten eine fokussierte, nachvollziehbare Auswahl, die vor jeder Präsentation menschlich geprüft wird."], ["04", "Recruiting-Koordination", "Wir erleichtern Austausch, Dokumentennachforderungen und die nächsten Schritte mit allen Beteiligten."]],
    territoriesKicker: "Abgedeckte Regionen", territoriesTitle: "Internationale Reichweite mit lokalem Verständnis jeder Mission.", territoriesDesc: "Jede Suche wird an Berufsausübungsregeln, Mobilitätsanforderungen und operative Gegebenheiten angepasst.", territories: ["Europa", "Kanada", "Naher Osten", "Afrika", "Offshore- und abgelegene Standorte"],
    guaranteeKicker: "Zusagen der Zusammenarbeit", guaranteeTitle: "Anspruchsvolles, nachvollziehbares Recruiting unter menschlicher Kontrolle.",
    guarantees: [["Menschliche Entscheidung", "Keine Einstellungsentscheidung wird automatisiert. Analysetools bereiten lediglich die Prüfung durch unsere und Ihre Teams vor."], ["Einwilligung & Diskretion", "Kampagnen und Kontakte respektieren die Entscheidungen der Kandidaten; sensible administrative Handlungen werden protokolliert."], ["Überprüfbare Qualifikationen", "Zertifikate, Sprachen, Erfahrungen und Verfügbarkeiten werden strukturiert, um die notwendigen Prüfungen zu erleichtern."]],
    finalTitle: "Bereit für Ihr nächstes Team?", finalDesc: "Teilen Sie Ihren Bedarf. Wir bestätigen mit Ihnen Umfang, Zeitplan und Kriterien Ihrer Shortlist.", finalCta: "Mit einem Einsatz-Brief beginnen", metaTitle: "Warum Hippocampus Consulting | Medizinisches Recruiting", metaDescription: "Entdecken Sie die Methode von Hippocampus Consulting: internationales medizinisches Recruiting, Vertraulichkeit, menschliche Shortlists und Regionen.",
  },
  zh: {
    eyebrow: "Hippocampus Consulting · 招聘合作伙伴", title: "以临床专业能力服务关键医疗招聘。", intro: "我们协助医院、诊所、工业集团及离岸运营方，为其运营环境、约束条件和时间要求甄选适合的医疗及辅助医疗专业人员。", primaryCta: "提交任务需求", secondaryCta: "了解我们的方法",
    promiseTitle: "为不容模糊处理的关键环境而设计的方法。", promiseDesc: "我们的筛选结合临床理解、运营资格评估和人工审核。人工智能只负责整理信息，绝不代替您作出决定。", principles: [["可解释的候选名单", "每位候选人均附有结构化摘要：专业、认证、语言、流动性、可用性及待确认事项。"], ["默认严格保密", "需求、简历与沟通均受到严格限制。仅在候选人同意的情况下与其联系。"], ["运营响应能力", "专属联系人将澄清需求、优先考虑关键条件，并按照您的时间表推进搜索。"]],
    methodKicker: "我们的方法", methodTitle: "从需求到候选名单，四个清晰阶段。", steps: [["01", "需求校准", "明确范围、监管要求、语言、到岗时间和现场约束。"], ["02", "寻访与资格评估", "从已同意联系的人才库中筛选，并根据任务真正需要的条件评估候选人。"], ["03", "有理有据的候选名单", "您将收到精简、清晰且有依据的名单，任何推荐前均经过人工审核。"], ["04", "招聘协调", "我们协助沟通、补充文件以及相关各方的后续步骤。"]],
    territoriesKicker: "覆盖区域", territoriesTitle: "国际覆盖，并理解每项任务的本地实际情况。", territoriesDesc: "每次寻访均结合执业要求、流动限制及当地运营实际进行调整。", territories: ["欧洲", "加拿大", "中东", "非洲", "离岸及偏远站点"],
    guaranteeKicker: "合作保障", guaranteeTitle: "严格、可追溯，并始终在人为控制下完成招聘。", guarantees: [["人工决策", "任何聘用决定都不会自动化。分析工具仅辅助我们与您团队的审核。"], ["同意与保密", "营销及联系均尊重候选人的选择；敏感行政操作均有记录。"], ["可核验的资质", "认证、语言、经验和可用性均被结构化，便于进行必要核验。"]],
    finalTitle: "准备组建您的下一支团队吗？", finalDesc: "请分享您的需求。我们将与您确认任务范围、时间表和候选名单标准。", finalCta: "从提交任务需求开始", metaTitle: "为何选择 Hippocampus Consulting | 医疗招聘", metaDescription: "了解 Hippocampus Consulting 的国际医疗招聘方法、保密保障、人工审核候选名单及覆盖区域。",
  },
} as const;

type Language = keyof typeof copy;

export default function WhyHippocampusPage() {
  const { language } = useLanguage();
  const lang = (language in copy ? language : "fr") as Language;
  const t = copy[lang];
  const principleIcons = [BadgeCheck, LockKeyhole, UsersRound] as const;
  const guaranteeIcons = [ShieldCheck, LockKeyhole, ClipboardCheck] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead title={t.metaTitle} description={t.metaDescription} ogUrl="https://drahmedbenlallahom.com/why-hippocampus" />
      <Navigation />
      <main className="overflow-hidden pt-28 md:pt-36">
        <section className="relative border-b border-border/70 pb-20 pt-12 md:pb-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_14%,hsl(var(--primary)/0.18),transparent_28%),radial-gradient(circle_at_8%_82%,hsl(var(--primary)/0.09),transparent_25%)]" />
          <div className="container relative max-w-6xl">
            <div className="max-w-4xl">
              <p className="section-kicker">{t.eyebrow}</p>
              <h1 className="mt-5 max-w-4xl font-display text-5xl leading-[0.98] text-foreground md:text-7xl">{t.title}</h1>
              <p className="mt-7 max-w-3xl text-lg leading-8 text-muted-foreground md:text-xl">{t.intro}</p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link href="/employers" className="cta-primary inline-flex justify-center">{t.primaryCta}<ArrowRight className="ml-2 h-4 w-4" /></Link>
                <a href="#method" className="inline-flex items-center justify-center rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5">{t.secondaryCta}</a>
              </div>
            </div>
          </div>
        </section>

        <section className="container max-w-6xl py-20 md:py-28">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.25fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <p className="section-kicker">Hippocampus Consulting</p>
              <h2 className="mt-4 font-display text-4xl leading-tight text-foreground md:text-5xl">{t.promiseTitle}</h2>
              <p className="mt-6 text-base leading-7 text-muted-foreground">{t.promiseDesc}</p>
            </div>
            <div className="grid gap-4">
              {t.principles.map(([title, desc], index) => {
                const Icon = principleIcons[index];
                return <article key={title} className="editorial-card flex gap-5 p-6 md:p-7"><div className="h-fit rounded-2xl bg-primary/10 p-3 text-primary"><Icon className="h-6 w-6" /></div><div><h3 className="font-display text-2xl text-foreground">{title}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{desc}</p></div></article>;
              })}
            </div>
          </div>
        </section>

        <section id="method" className="border-y border-border/70 bg-card/35 py-20 md:py-28">
          <div className="container max-w-6xl">
            <p className="section-kicker">{t.methodKicker}</p>
            <h2 className="mt-4 max-w-3xl font-display text-4xl leading-tight text-foreground md:text-5xl">{t.methodTitle}</h2>
            <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-2">
              {t.steps.map(([number, title, desc]) => <article key={number} className="bg-background p-6 md:p-8"><span className="font-mono text-xs font-semibold tracking-[0.22em] text-primary">{number}</span><h3 className="mt-5 font-display text-2xl text-foreground">{title}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{desc}</p></article>)}
            </div>
          </div>
        </section>

        <section className="container max-w-6xl py-20 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div><p className="section-kicker">{t.territoriesKicker}</p><h2 className="mt-4 font-display text-4xl leading-tight text-foreground md:text-5xl">{t.territoriesTitle}</h2><p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">{t.territoriesDesc}</p></div>
            <div className="rounded-3xl border border-primary/20 bg-primary/[0.06] p-6 md:p-8"><Globe2 className="h-8 w-8 text-primary" /><div className="mt-8 grid gap-3 sm:grid-cols-2">{t.territories.map((territory) => <div key={territory} className="flex items-center gap-3 rounded-xl border border-primary/15 bg-background/60 px-4 py-4 text-sm font-semibold text-foreground"><MapPin className="h-4 w-4 text-primary" />{territory}</div>)}</div></div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-card/35 py-20 md:py-28">
          <div className="container max-w-6xl"><p className="section-kicker">{t.guaranteeKicker}</p><h2 className="mt-4 max-w-3xl font-display text-4xl leading-tight text-foreground md:text-5xl">{t.guaranteeTitle}</h2><div className="mt-12 grid gap-5 md:grid-cols-3">{t.guarantees.map(([title, desc], index) => { const Icon = guaranteeIcons[index]; return <article key={title} className="editorial-card p-6"><Icon className="h-7 w-7 text-primary" /><h3 className="mt-6 font-display text-2xl text-foreground">{title}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{desc}</p></article>; })}</div></div>
        </section>

        <section className="container max-w-6xl py-20 md:py-28"><div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-primary/[0.08] px-7 py-12 md:px-12 md:py-16"><div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl" /><div className="relative max-w-3xl"><p className="section-kicker">Hippocampus Consulting</p><h2 className="mt-4 font-display text-4xl text-foreground md:text-5xl">{t.finalTitle}</h2><p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">{t.finalDesc}</p><Link href="/employers" className="cta-primary mt-8 inline-flex">{t.finalCta}<ArrowRight className="ml-2 h-4 w-4" /></Link></div></div></section>
      </main>
      <Footer />
    </div>
  );
}

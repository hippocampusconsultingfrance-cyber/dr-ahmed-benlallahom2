import { ShieldCheck, ArrowRight, Stethoscope } from "lucide-react";
import { Link } from "wouter";
import { SEOHead } from "@/components/SEOHead";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";

const copy = {
  fr: {
    eyebrow: "Hippocampus Consulting · Carrières Médicales & Paramédicales",
    title: "Choisissez votre parcours de recrutement d’excellence.",
    intro: "Nous accompagnons les professionnels médicaux et paramédicaux vers deux types d'opportunités de premier plan : la mobilité hospitalière internationale et les missions d’élite en environnements critiques ou VVIP.",
    nav: "Recrutement",
    p1Title: "Mobilité Médicale & Paramédicale Internationale",
    p1Desc: "Opportunités sélectionnées pour médecins, spécialistes, personnels soignants et professionnels paramédicaux dans les meilleurs établissements en Europe, au Canada, au Moyen-Orient et en Afrique.",
    p1Cta: "Accéder au recrutement international",
    p2Title: "Missions VVIP & Offshore",
    p2Desc: "Interventions d’urgence et de soutien médical hautement spécialisé pour plateformes pétrolières et grands groupes industriels au Moyen-Orient et à l’international.",
    p2Cta: "Accéder au parcours VVIP & Offshore",
    badge1: "Réseau mondial certifié",
    badge2: "Revue humaine & IA éthique",
    badge3: "Conformité RGPD stricte",
    privacyTitle: "Vos données, sous contrôle",
    privacyDescription: "Votre CV reste dans un espace privé. L’IA assiste uniquement la lecture du profil ; aucune décision de recrutement n’est automatisée. Les opportunités de recrutement ne sont envoyées qu’avec votre consentement explicite.",
    candidateSpaceCta: "Accéder à mon espace candidat sécurisé",
    metaTitle: "Espace Recrutement & Carrières | Hippocampus Consulting",
    metaDescription: "Choisissez entre la mobilité médicale et paramédicale internationale et les missions VVIP / Offshore avec Hippocampus Consulting.",
  },
  en: {
    eyebrow: "Hippocampus Consulting · Medical & Allied Health Careers",
    title: "Choose your pathway of professional excellence.",
    intro: "We guide medical and allied health professionals toward two premier career pathways: international hospital mobility and elite assignments in critical or VVIP environments.",
    nav: "Recruitment",
    p1Title: "International Medical & Allied Health Mobility",
    p1Desc: "Selected opportunities for physicians, specialists, nursing staff, and allied health professionals across top institutions in Europe, Canada, the Middle East and Africa.",
    p1Cta: "Access International Recruitment",
    p2Title: "VVIP & Offshore Missions",
    p2Desc: "High-acuity emergency and medical support assignments for oil rigs and major industrial corporations.",
    p2Cta: "Access VVIP & Offshore Pathway",
    badge1: "Certified Global Network",
    badge2: "Human Review & Ethical AI",
    badge3: "Strict GDPR Compliance",
    privacyTitle: "Your data, under control",
    privacyDescription: "Your CV remains in a private space. AI only assists profile review; no recruitment decision is automated. Recruitment opportunities are sent only with your explicit consent.",
    candidateSpaceCta: "Access my secure candidate space",
    metaTitle: "Recruitment & Careers Hub | Hippocampus Consulting",
    metaDescription: "Choose between international medical and allied health mobility and VVIP / Offshore missions with Hippocampus Consulting.",
  },
  de: {
    eyebrow: "Hippocampus Consulting · Medizinische & Paramedizinische Karrieren",
    title: "Wählen Sie Ihren Weg beruflicher Exzellenz.",
    intro: "Wir begleiten medizinische und paramedizinische Fachkräfte zu zwei erstklassigen Karrieremöglichkeiten: internationale Mobilität in Kliniken und Elite-Missionen in kritischen oder VVIP-Umgebungen.",
    nav: "Recruiting",
    p1Title: "Internationale Medizinische & Paramedizinische Mobilität",
    p1Desc: "Ausgewählte Möglichkeiten für Ärzte, Fachärzte, Pflegepersonal und paramedizinische Fachkräfte in führenden Einrichtungen in Europa, Kanada, dem Nahen Osten und Afrika.",
    p1Cta: "Zum internationalen Recruiting",
    p2Title: "VVIP- & Offshore-Missionen",
    p2Desc: "Spezialisierte Notfall- und medizinische Betreuung für Bohrinseln und große Industriekonzerne.",
    p2Cta: "Zum VVIP- & Offshore-Pfad",
    badge1: "Zertifiziertes globales Netzwerk",
    badge2: "Menschliche Prüfung & ethische KI",
    badge3: "Strikte DSGVO-Konformität",
    privacyTitle: "Ihre Daten unter Kontrolle",
    privacyDescription: "Ihr Lebenslauf bleibt in einem privaten Bereich. KI unterstützt nur die Profilprüfung; keine Rekrutierungsentscheidung ist automatisiert. Recruiting-Angebote werden nur mit Ihrer ausdrücklichen Einwilligung versandt.",
    candidateSpaceCta: "Meinen sicheren Bewerberbereich öffnen",
    metaTitle: "Recruitment & Karrieren Hub | Hippocampus Consulting",
    metaDescription: "Wählen Sie zwischen internationaler medizinischer und paramedizinischer Mobilität sowie VVIP- / Offshore-Missionen.",
  },
  zh: {
    eyebrow: "Hippocampus Consulting · 医疗与辅助医疗职业发展",
    title: "选择您的卓越职业发展路径。",
    intro: "我们为医疗及辅助医疗专业人员提供两大核心职业通道：国际医院人才流动项目，以及高风险、高规格的 VVIP 与离岸任务派驻。",
    nav: "招聘",
    p1Title: "国际医疗与辅助医疗人才流动",
    p1Desc: "面向欧洲、加拿大、中东和非洲顶级医疗机构的医师、专科医生、护理及辅助医疗专业人员精选机遇。",
    p1Cta: "进入国际招聘通道",
    p2Title: "VVIP 与离岸任务派驻",
    p2Desc: "面向中东海上钻井平台及大型工业企业的急救与专项医疗保障任务。",
    p2Cta: "进入 VVIP 与离岸通道",
    badge1: "认证全球网络",
    badge2: "人工审核与伦理AI",
    badge3: "严格合规保障",
    privacyTitle: "您的数据由您掌控",
    privacyDescription: "您的简历保存在私有空间。AI 仅辅助档案审阅，不作任何自动招聘决定。只有在您明确同意后，才会向您发送招聘机会。",
    candidateSpaceCta: "进入我的安全候选人空间",
    metaTitle: "招聘与职业中心 | Hippocampus Consulting",
    metaDescription: "在 Hippocampus Consulting 选择国际医疗与辅助医疗人才流动或 VVIP 与离岸任务。",
  },
} as const;

type Language = keyof typeof copy;

function InternationalEarth() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-0 hidden h-[40rem] overflow-hidden md:block" aria-hidden="true">
      <img
        src="/manus-storage/recruitment-earth-international_610a1f2e.png"
        alt=""
        className="absolute right-0 top-0 h-[40rem] w-auto max-w-none object-contain object-right opacity-85"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/75 to-transparent" />
    </div>
  );
}

export default function RecruitmentHubPage() {
  const { language } = useLanguage();
  const lang = (language in copy ? language : "fr") as Language;
  const t = copy[lang];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead title={t.metaTitle} description={t.metaDescription} ogUrl="https://drahmedbenlallahom.com/recruitment" />
      <Navigation />
      <main className="relative isolate overflow-hidden pt-32 pb-24 md:pt-40">
        <InternationalEarth />
        <section className="container relative z-10 max-w-5xl">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <p className="section-kicker">{t.eyebrow}</p>
            <h1 className="mt-4 font-display text-4xl leading-tight md:text-6xl text-foreground">{t.title}</h1>
            <p className="mt-6 text-lg text-muted-foreground leading-8">{t.intro}</p>
            
            <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs font-mono tracking-wider uppercase text-muted-foreground">
              <span className="px-3 py-1.5 rounded-full border border-border/60 bg-card/40">{t.badge1}</span>
              <span className="px-3 py-1.5 rounded-full border border-border/60 bg-card/40">{t.badge2}</span>
              <span className="px-3 py-1.5 rounded-full border border-border/60 bg-card/40">{t.badge3}</span>
            </div>
            <div className="mx-auto mt-7 max-w-2xl rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left">
              <p className="text-sm font-semibold text-foreground">{t.privacyTitle}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t.privacyDescription}</p>
              <Link href="/candidate/access" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                {t.candidateSpaceCta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Standard Pathway */}
            <div className="editorial-card p-8 flex flex-col justify-between border border-border/80 hover:border-primary/50 transition-all group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center mb-6">
                  <Stethoscope className="w-6 h-6 mx-auto" />
                </div>
                <h2 className="font-display text-2xl text-foreground group-hover:text-primary transition-colors">{t.p1Title}</h2>
                <p className="mt-4 text-muted-foreground leading-relaxed">{t.p1Desc}</p>
              </div>
              <div className="mt-8 pt-6 border-t border-border/40">
                <a href="/recruitment/standard" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                  <span>{t.p1Cta}</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
            </div>

            {/* VVIP & Offshore Pathway */}
            <div className="editorial-card p-8 flex flex-col justify-between border border-border/80 hover:border-primary/50 transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary/10 text-primary px-4 py-1.5 text-[10px] font-mono tracking-widest uppercase rounded-bl-xl font-bold">
                Élite & Sécurisé
              </div>
              <div>
                <div className="w-12 h-12 rounded-xl bg-primary/15 text-primary flex items-center mb-6">
                  <ShieldCheck className="w-6 h-6 mx-auto" />
                </div>
                <h2 className="font-display text-2xl text-foreground group-hover:text-primary transition-colors">{t.p2Title}</h2>
                <p className="mt-4 text-muted-foreground leading-relaxed">{t.p2Desc}</p>
              </div>
              <div className="mt-8 pt-6 border-t border-border/40">
                <a href="/recruitment/vvip-offshore" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                  <span>{t.p2Cta}</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

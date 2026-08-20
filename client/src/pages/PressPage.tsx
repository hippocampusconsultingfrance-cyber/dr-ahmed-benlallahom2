import { BookOpenText, CheckCircle2, ExternalLink, FileCheck2, Mail, Newspaper, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { useLanguage } from "@/contexts/LanguageContext";

type PressLanguage = "fr" | "en" | "de" | "zh";

const pressCopy: Record<PressLanguage, {
  eyebrow: string; title: string; intro: string; verifiedTitle: string; verifiedDescription: string; profileTitle: string; profile: string; scopeTitle: string; scope: string; publicTitle: string; publicDescription: string; noPublication: string; contactTitle: string; contact: string; contactCta: string; sourceTitle: string; source: string; note: string;
}> = {
  fr: { eyebrow: "Dossier institutionnel", title: "Presse & publications", intro: "Informations publiques destinées aux journalistes, partenaires éditoriaux et organisateurs. Cette page ne présente que les éléments déjà publiés et vérifiables sur ce site.", verifiedTitle: "Contenu vérifiable", verifiedDescription: "Aucune citation externe, distinction, logo de tiers ou publication n’est ajoutée sans une source stable et vérifiable.", profileTitle: "Profil public", profile: "Dr. Ahmed Ben Lallahom est présenté sur ce site comme anesthésiste-réanimateur, entrepreneur en santé et consultant médical basé en France.", scopeTitle: "Thématiques publiées", scope: "Le site présente son parcours clinique, ses formations, ses activités de conseil médical, l’innovation en santé ainsi que les parcours de recrutement international de Hippocampus Consulting.", publicTitle: "Publications référencées", publicDescription: "Cette section est volontairement limitée aux publications disposant d’un lien source permanent.", noPublication: "Aucune publication tierce n’est actuellement référencée sur cette page.", contactTitle: "Demande presse", contact: "Pour une demande d’information ou de prise de contact, utilisez le formulaire public. Toute information complémentaire doit être confirmée avant diffusion.", contactCta: "Contacter l’équipe", sourceTitle: "Sources internes", source: "Les informations ci-dessus renvoient aux pages publiques Profil, Formation, Services, Recrutement et Pourquoi Hippocampus du site.", note: "Cette page est informative et ne constitue ni un avis médical personnalisé ni une garantie de service." },
  en: { eyebrow: "Institutional dossier", title: "Press & publications", intro: "Public information for journalists, editorial partners and event organisers. This page only presents information already published and verifiable on this website.", verifiedTitle: "Verifiable content", verifiedDescription: "No external quote, distinction, third-party logo or publication is added without a stable, verifiable source.", profileTitle: "Public profile", profile: "This website presents Dr Ahmed Ben Lallahom as an anaesthesiologist-intensivist, health entrepreneur and medical consultant based in France.", scopeTitle: "Published topics", scope: "The website presents his clinical background, training, medical consulting activity, health innovation and Hippocampus Consulting’s international recruitment pathways.", publicTitle: "Referenced publications", publicDescription: "This section is intentionally limited to publications with a permanent source link.", noPublication: "No third-party publication is currently listed on this page.", contactTitle: "Press enquiry", contact: "For an information request or contact, use the public form. Any additional information must be confirmed before publication.", contactCta: "Contact the team", sourceTitle: "Internal sources", source: "The information above refers to the public Profile, Education, Services, Recruitment and Why Hippocampus pages of this website.", note: "This page is informational and does not provide personalised medical advice or a service guarantee." },
  de: { eyebrow: "Institutionelles Dossier", title: "Presse & Publikationen", intro: "Öffentliche Informationen für Journalistinnen, Redaktionspartner und Veranstalter. Diese Seite enthält nur Angaben, die bereits auf dieser Website veröffentlicht und überprüfbar sind.", verifiedTitle: "Überprüfbare Inhalte", verifiedDescription: "Es werden keine externen Zitate, Auszeichnungen, Drittlogos oder Publikationen ohne stabile, überprüfbare Quelle ergänzt.", profileTitle: "Öffentliches Profil", profile: "Diese Website stellt Dr. Ahmed Ben Lallahom als Anästhesisten und Intensivmediziner, Gesundheitsunternehmer und medizinischen Berater mit Sitz in Frankreich vor.", scopeTitle: "Veröffentlichte Themen", scope: "Die Website beschreibt seinen klinischen Werdegang, seine Ausbildung, medizinische Beratung, Gesundheitsinnovation und die internationalen Rekrutierungswege von Hippocampus Consulting.", publicTitle: "Referenzierte Publikationen", publicDescription: "Dieser Bereich bleibt bewusst auf Publikationen mit dauerhaftem Quellenlink beschränkt.", noPublication: "Derzeit ist auf dieser Seite keine Drittveröffentlichung aufgeführt.", contactTitle: "Presseanfrage", contact: "Für eine Informations- oder Kontaktanfrage nutzen Sie bitte das öffentliche Formular. Zusätzliche Angaben müssen vor einer Veröffentlichung bestätigt werden.", contactCta: "Team kontaktieren", sourceTitle: "Interne Quellen", source: "Die obigen Informationen beziehen sich auf die öffentlichen Seiten Profil, Ausbildung, Dienstleistungen, Rekrutierung und Warum Hippocampus dieser Website.", note: "Diese Seite dient nur der Information und bietet keine individuelle medizinische Beratung oder Leistungsgarantie." },
  zh: { eyebrow: "机构资料", title: "媒体与出版物", intro: "面向记者、编辑合作伙伴和活动组织者的公开信息。本页面仅展示已在本网站发布且可核验的内容。", verifiedTitle: "可核验内容", verifiedDescription: "没有稳定且可核验的来源，不会添加外部引述、荣誉、第三方标识或出版物。", profileTitle: "公开简介", profile: "本网站将 Ahmed Ben Lallahom 医生介绍为常驻法国的麻醉与重症医学医生、健康创业者和医疗顾问。", scopeTitle: "已发布主题", scope: "网站介绍其临床经历、培训、医疗咨询工作、健康创新，以及 Hippocampus Consulting 的国际招聘路径。", publicTitle: "已引用出版物", publicDescription: "本板块仅收录具有长期有效来源链接的出版物。", noPublication: "本页面目前未列出任何第三方出版物。", contactTitle: "媒体咨询", contact: "如需信息或联系，请使用公开表单。任何补充信息均须在发布前确认。", contactCta: "联系团队", sourceTitle: "内部来源", source: "以上信息引用本网站的公开简介、培训、服务、招聘和“为什么选择 Hippocampus”页面。", note: "本页面仅供参考，不提供个性化医疗建议或服务保证。" },
};

export default function PressPage() {
  const { language } = useLanguage();
  const locale = (language in pressCopy ? language : "fr") as PressLanguage;
  const copy = pressCopy[locale];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead title={`${copy.title} | Dr. Ahmed Ben Lallahom`} description={copy.intro} ogUrl="https://drahmedbenlallahom.com/press" />
      <Navigation />
      <main id="main-content" tabIndex={-1} className="relative overflow-hidden pb-20 pt-28 sm:pt-32">
        <div className="diagnostic-grid absolute inset-0 opacity-20" aria-hidden="true" />
        <div className="container relative max-w-6xl">
          <header className="rounded-3xl border border-primary/25 bg-card/80 px-6 py-10 shadow-2xl backdrop-blur sm:px-10 sm:py-12">
            <div className="flex items-center gap-3 text-primary"><Newspaper className="h-6 w-6" aria-hidden="true" /><p className="text-xs font-semibold uppercase tracking-[0.18em]">{copy.eyebrow}</p></div>
            <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">{copy.title}</h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">{copy.intro}</p>
            <div className="mt-7 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><div><p className="font-semibold text-foreground">{copy.verifiedTitle}</p><p className="mt-1">{copy.verifiedDescription}</p></div></div>
          </header>

          <section className="mt-6 grid gap-4 md:grid-cols-2" aria-label={copy.title}>
            <article className="rounded-2xl border border-border bg-card/80 p-6 shadow-lg shadow-black/5"><FileCheck2 className="h-6 w-6 text-primary" aria-hidden="true" /><h2 className="mt-5 font-display text-2xl font-semibold">{copy.profileTitle}</h2><p className="mt-3 leading-7 text-muted-foreground">{copy.profile}</p></article>
            <article className="rounded-2xl border border-border bg-card/80 p-6 shadow-lg shadow-black/5"><BookOpenText className="h-6 w-6 text-primary" aria-hidden="true" /><h2 className="mt-5 font-display text-2xl font-semibold">{copy.scopeTitle}</h2><p className="mt-3 leading-7 text-muted-foreground">{copy.scope}</p></article>
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-card/80 p-6 shadow-lg shadow-black/5"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" /><div><h2 className="font-display text-2xl font-semibold">{copy.publicTitle}</h2><p className="mt-2 text-muted-foreground">{copy.publicDescription}</p><p className="mt-5 rounded-xl border border-dashed border-border bg-background/70 p-4 text-sm leading-6 text-muted-foreground">{copy.noPublication}</p></div></div></section>

          <section className="mt-6 grid gap-4 md:grid-cols-[1.25fr_0.75fr]"><article className="rounded-2xl border border-border bg-card/80 p-6 shadow-lg shadow-black/5"><Mail className="h-6 w-6 text-primary" aria-hidden="true" /><h2 className="mt-5 font-display text-2xl font-semibold">{copy.contactTitle}</h2><p className="mt-3 leading-7 text-muted-foreground">{copy.contact}</p><Link href="/#contact" className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Mail className="h-4 w-4" aria-hidden="true" />{copy.contactCta}<ExternalLink className="h-4 w-4" aria-hidden="true" /></Link></article><aside className="rounded-2xl border border-primary/20 bg-primary/5 p-6"><h2 className="font-display text-xl font-semibold">{copy.sourceTitle}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{copy.source}</p></aside></section>

          <p className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm leading-6 text-muted-foreground">{copy.note}</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

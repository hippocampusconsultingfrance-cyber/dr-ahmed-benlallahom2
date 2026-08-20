import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import { SEOHead } from "@/components/SEOHead";
import { siteConfig } from "@/data/site-config";
import { useLanguage } from "@/contexts/LanguageContext";
import { BadgeCheck, FileText, Mail, ShieldCheck } from "lucide-react";

type PressLanguage = "fr" | "en" | "de" | "zh";

const copy = {
  fr: { eyebrow: "Presse & publications", title: "Informations institutionnelles, sans contenu non vérifié.", description: "Cet espace regroupe uniquement des informations vérifiables sur le parcours professionnel et les activités présentées sur ce site. Aucune citation de presse, partenariat ou publication tierce n’est affichée sans source et autorisation.", profile: "Profil professionnel", profileText: "Présentation institutionnelle, formation, expérience et domaines d’intervention décrits sur le site.", activities: "Activités présentées", activitiesText: "Informations sur l’accompagnement médical, le conseil et Hippocampus Consulting, à lire dans leur contexte public.", contact: "Demandes éditoriales", contactText: "Pour une demande d’information ou de vérification, contactez directement l’équipe via l’adresse professionnelle du site.", email: "Contacter l’équipe", empty: "Aucun communiqué de presse, article tiers ou logo partenaire n’est publié à ce jour sans validation documentaire préalable.", note: "Toute information médicale reste générale : elle ne remplace pas un avis clinique individuel ni une prise en charge d’urgence.", seo: "Presse et publications" },
  en: { eyebrow: "Press & publications", title: "Institutional information, without unverified content.", description: "This space contains only verifiable information about the professional background and activities presented on this website. No press quote, partnership or third-party publication is displayed without a source and authorisation.", profile: "Professional profile", profileText: "Institutional presentation, education, experience and fields of practice described on this website.", activities: "Activities presented", activitiesText: "Information on medical support, consulting and Hippocampus Consulting, to be read in its public context.", contact: "Editorial requests", contactText: "For an information or verification request, contact the team directly through the professional address on this website.", email: "Contact the team", empty: "No press release, third-party article or partner logo is currently published without prior documentary validation.", note: "All medical information remains general: it does not replace individual clinical advice or emergency care.", seo: "Press and publications" },
  de: { eyebrow: "Presse & Veröffentlichungen", title: "Institutionelle Informationen ohne ungeprüfte Inhalte.", description: "Dieser Bereich enthält nur überprüfbare Informationen über den beruflichen Werdegang und die auf dieser Website dargestellten Aktivitäten. Ohne Quelle und Genehmigung werden keine Pressezitate, Partnerschaften oder Veröffentlichungen Dritter angezeigt.", profile: "Berufliches Profil", profileText: "Institutionelle Vorstellung, Ausbildung, Erfahrung und auf dieser Website beschriebene Tätigkeitsfelder.", activities: "Dargestellte Aktivitäten", activitiesText: "Informationen zu medizinischer Begleitung, Beratung und Hippocampus Consulting im öffentlichen Kontext.", contact: "Redaktionelle Anfragen", contactText: "Für Informations- oder Prüfungsanfragen kontaktieren Sie das Team direkt über die berufliche Adresse dieser Website.", email: "Team kontaktieren", empty: "Derzeit werden keine Pressemitteilung, kein Drittartikel und kein Partnerlogo ohne vorherige Dokumentenprüfung veröffentlicht.", note: "Alle medizinischen Informationen bleiben allgemein und ersetzen weder eine individuelle klinische Beratung noch eine Notfallversorgung.", seo: "Presse und Veröffentlichungen" },
  zh: { eyebrow: "媒体与出版", title: "提供机构信息，不展示未经核实的内容。", description: "此页面仅提供有关本网站所述职业经历和活动的可核实信息。没有来源和授权，不会展示媒体引述、合作伙伴关系或第三方出版物。", profile: "职业简介", profileText: "本网站所述的机构介绍、培训、经验和执业领域。", activities: "所呈现的活动", activitiesText: "有关医疗支持、咨询和 Hippocampus Consulting 的信息，应在其公开语境中阅读。", contact: "编辑咨询", contactText: "如需信息或核实，请通过本网站的专业邮箱直接联系团队。", email: "联系团队", empty: "目前未在缺少事先文件验证的情况下发布新闻稿、第三方文章或合作伙伴标识。", note: "所有医疗信息均为一般性内容，不能替代个体临床建议或紧急救治。", seo: "媒体与出版" },
} as const;

export default function PressPage() {
  const { language } = useLanguage();
  const locale = (language in copy ? language : "fr") as PressLanguage;
  const text = copy[locale];
  const entries = [
    [BadgeCheck, text.profile, text.profileText],
    [FileText, text.activities, text.activitiesText],
    [Mail, text.contact, text.contactText],
  ] as const;

  return <div className="min-h-screen bg-background text-foreground">
    <SEOHead title={`${text.seo} | Dr. Ahmed Ben Lallahom`} description={text.description} ogUrl="https://drahmedbenlallahom.com/press" />
    <Navigation />
    <main id="main-content" tabIndex={-1} className="relative overflow-hidden pb-20 pt-28 sm:pt-32">
      <div className="diagnostic-grid absolute inset-0 opacity-20" aria-hidden="true" />
      <div className="container relative max-w-5xl">
        <header className="rounded-3xl border border-primary/25 bg-card/80 px-6 py-10 shadow-2xl backdrop-blur sm:px-10 sm:py-12">
          <div className="flex items-center gap-3 text-primary"><FileText className="h-6 w-6" aria-hidden="true" /><p className="text-xs font-semibold uppercase tracking-[0.18em]">{text.eyebrow}</p></div>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">{text.title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">{text.description}</p>
        </header>
        <section className="mt-6 grid gap-5 md:grid-cols-3" aria-label={text.eyebrow}>{entries.map(([Icon, title, description]) => <article key={title} className="rounded-2xl border border-border bg-card/75 p-6 shadow-lg"><Icon className="h-6 w-6 text-primary" aria-hidden="true" /><h2 className="mt-5 text-xl font-semibold text-foreground">{title}</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>{title === text.contact && <a href={`mailto:${siteConfig.email}`} className="mt-5 inline-flex min-h-10 items-center rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-primary-foreground">{text.email}</a>}</article>)}</section>
        <section className="mt-6 rounded-2xl border border-border bg-card/70 p-6"><h2 className="text-lg font-semibold text-foreground">{text.eyebrow}</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text.empty}</p></section>
        <aside className="mt-6 flex gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" /><p>{text.note}</p></aside>
      </div>
    </main>
    <Footer />
  </div>;
}

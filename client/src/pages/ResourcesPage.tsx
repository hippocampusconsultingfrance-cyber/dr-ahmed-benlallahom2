import { useMemo, useState } from "react";
import { AlertTriangle, BookOpenText, ExternalLink, FileText, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedCopy } from "@/lib/getLocalizedCopy";

type ResourceLanguage = "fr" | "en" | "de" | "zh";
type ResourceCategory = "safety" | "guidance";

type Resource = {
  category: ResourceCategory;
  format: "web" | "pdf";
  url: string;
  title: Record<ResourceLanguage, string>;
  description: Record<ResourceLanguage, string>;
  publisher: Record<ResourceLanguage, string>;
};

const resources: Resource[] = [
  {
    category: "safety",
    format: "web",
    url: "https://www.who.int/news-room/fact-sheets/detail/patient-safety",
    title: { fr: "Sécurité des patients", en: "Patient safety", de: "Patientensicherheit", zh: "患者安全" },
    description: { fr: "Repère international sur la réduction des préjudices évitables et l’amélioration de la sécurité des soins.", en: "International reference on reducing preventable harm and improving the safety of care.", de: "Internationale Referenz zur Verringerung vermeidbarer Schäden und zur Verbesserung der Versorgungssicherheit.", zh: "关于减少可预防伤害和提升医疗安全的国际参考资料。" },
    publisher: { fr: "Organisation mondiale de la Santé", en: "World Health Organization", de: "Weltgesundheitsorganisation", zh: "世界卫生组织" },
  },
  {
    category: "safety",
    format: "web",
    url: "https://www.has-sante.fr/jcms/c_2042652/en/patient-safety",
    title: { fr: "Sécurité des soins", en: "Patient safety", de: "Versorgungssicherheit", zh: "医疗安全" },
    description: { fr: "Page institutionnelle sur la culture de sécurité, la gestion des risques et la communication avec les patients.", en: "Institutional page on safety culture, risk management and communication with patients.", de: "Institutionelle Seite zu Sicherheitskultur, Risikomanagement und Kommunikation mit Patientinnen und Patienten.", zh: "关于安全文化、风险管理和患者沟通的官方页面。" },
    publisher: { fr: "Haute Autorité de Santé", en: "French National Authority for Health", de: "Französische Nationale Gesundheitsbehörde", zh: "法国国家卫生管理局" },
  },
  {
    category: "safety",
    format: "pdf",
    url: "https://www.has-sante.fr/jcms/c_2042652/en/upload/docs/application/pdf/2024-01/has-oms_global_patient_safety_action_plan.pdf",
    title: { fr: "Plan d’action mondial pour la sécurité des patients", en: "Global Patient Safety Action Plan", de: "Globaler Aktionsplan für Patientensicherheit", zh: "全球患者安全行动计划" },
    description: { fr: "Synthèse officielle HAS–OMS des actions et objectifs de sécurité des patients.", en: "Official HAS–WHO summary of patient-safety actions and objectives.", de: "Offizielle HAS–WHO-Zusammenfassung der Maßnahmen und Ziele zur Patientensicherheit.", zh: "HAS 与世卫组织关于患者安全行动与目标的官方摘要。" },
    publisher: { fr: "HAS / OMS", en: "HAS / WHO", de: "HAS / WHO", zh: "HAS / 世卫组织" },
  },
  {
    category: "guidance",
    format: "web",
    url: "https://www.has-sante.fr/jcms/p_3135026/en/search-for-a-guideline-an-assesment",
    title: { fr: "Rechercher une recommandation ou un avis", en: "Search for a guideline or assessment", de: "Leitlinie oder Bewertung suchen", zh: "检索指南或评估" },
    description: { fr: "Point d’entrée officiel vers les recommandations HAS, notamment en anesthésie, sédation, analgésie, qualité et sécurité.", en: "Official entry point to HAS guidance, including anaesthesia, sedation, analgesia, quality and safety.", de: "Offizieller Einstieg zu HAS-Leitlinien, einschließlich Anästhesie, Sedierung, Analgesie, Qualität und Sicherheit.", zh: "HAS 指南的官方入口，涵盖麻醉、镇静、镇痛、质量与安全。" },
    publisher: { fr: "Haute Autorité de Santé", en: "French National Authority for Health", de: "Französische Nationale Gesundheitsbehörde", zh: "法国国家卫生管理局" },
  },
];

export const resourcesCopy: Record<ResourceLanguage, {
  eyebrow: string; title: string; description: string; search: string; placeholder: string; all: string; safety: string; guidance: string; results: string; empty: string; external: string; pdf: string; web: string; controlled: string; note: string; updated: string;
}> = {
  fr: { eyebrow: "Informations vérifiables", title: "Ressources médicales", description: "Une sélection de sources institutionnelles à consulter directement auprès de leur éditeur. Ces ressources sont générales et ne remplacent pas un avis médical personnalisé.", search: "Rechercher une ressource", placeholder: "Ex. sécurité, anesthésie, recommandations…", all: "Toutes", safety: "Sécurité des soins", guidance: "Recommandations", results: "ressource(s) disponible(s)", empty: "Aucune ressource ne correspond à ce filtre.", external: "Ouvrir la source institutionnelle", pdf: "Document PDF officiel", web: "Page institutionnelle", controlled: "Les documents s’ouvrent sur le site de leur organisme éditeur. Aucun téléchargement n’est déclenché automatiquement.", note: "En cas d’urgence médicale ou de danger immédiat, appelez le 112 ou les services d’urgence locaux. Cette page n’est pas un service d’urgence.", updated: "Sources vérifiées le 20 août 2026." },
  en: { eyebrow: "Verified information", title: "Medical resources", description: "A selection of institutional sources to consult directly with their publisher. These general resources do not replace personalised medical advice.", search: "Search resources", placeholder: "E.g. safety, anaesthesia, guidance…", all: "All", safety: "Patient safety", guidance: "Guidance", results: "resource(s) available", empty: "No resource matches this filter.", external: "Open institutional source", pdf: "Official PDF document", web: "Institutional page", controlled: "Documents open on the publisher’s website. No download is triggered automatically.", note: "In a medical emergency or immediate danger, call 112 or your local emergency services. This page is not an emergency service.", updated: "Sources checked on 20 August 2026." },
  de: { eyebrow: "Geprüfte Informationen", title: "Medizinische Ressourcen", description: "Eine Auswahl institutioneller Quellen, die direkt beim Herausgeber eingesehen werden können. Diese allgemeinen Informationen ersetzen keine persönliche medizinische Beratung.", search: "Ressourcen durchsuchen", placeholder: "Z. B. Sicherheit, Anästhesie, Leitlinien…", all: "Alle", safety: "Versorgungssicherheit", guidance: "Leitlinien", results: "Ressource(n) verfügbar", empty: "Keine Ressource entspricht diesem Filter.", external: "Institutionelle Quelle öffnen", pdf: "Offizielles PDF-Dokument", web: "Institutionelle Seite", controlled: "Dokumente werden auf der Website des Herausgebers geöffnet. Es wird kein Download automatisch ausgelöst.", note: "Bei einem medizinischen Notfall oder einer unmittelbaren Gefahr rufen Sie 112 oder den örtlichen Rettungsdienst an. Diese Seite ist kein Notfalldienst.", updated: "Quellen geprüft am 20. August 2026." },
  zh: { eyebrow: "可验证信息", title: "医疗资源", description: "精选机构来源，可直接在发布机构的网站上查阅。这些一般性资源不能替代个体化医疗建议。", search: "搜索资源", placeholder: "例如：安全、麻醉、指南…", all: "全部", safety: "医疗安全", guidance: "指南", results: "项可用资源", empty: "没有资源符合此筛选条件。", external: "打开机构来源", pdf: "官方 PDF 文件", web: "机构页面", controlled: "文件会在发布机构的网站上打开，不会自动触发下载。", note: "如遇医疗紧急情况或即时危险，请拨打 112 或当地急救电话。本页面不是急救服务。", updated: "来源核验日期：2026 年 8 月 20 日。" },
};

export default function ResourcesPage() {
  const { language } = useLanguage();
  const locale = (language in resourcesCopy ? language : "fr") as ResourceLanguage;
  const strings = getLocalizedCopy(resourcesCopy, language, "fr");
  const [category, setCategory] = useState<"all" | ResourceCategory>("all");
  const [query, setQuery] = useState("");
  const visibleResources = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return resources.filter((resource) => {
      const matchesCategory = category === "all" || resource.category === category;
      const searchable = `${resource.title[locale]} ${resource.description[locale]} ${resource.publisher[locale]}`.toLocaleLowerCase();
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [category, locale, query]);

  const filters: Array<{ value: "all" | ResourceCategory; label: string }> = [
    { value: "all", label: strings.all },
    { value: "safety", label: strings.safety },
    { value: "guidance", label: strings.guidance },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead title={`${strings.title} | Dr. Ahmed Ben Lallahom`} description={strings.description} ogUrl="https://drahmedbenlallahom.com/resources" />
      <Navigation />
      <main id="main-content" tabIndex={-1} className="relative overflow-hidden pb-20 pt-28 sm:pt-32">
        <div className="diagnostic-grid absolute inset-0 opacity-20" aria-hidden="true" />
        <div className="container relative max-w-6xl">
          <header className="rounded-3xl border border-primary/25 bg-card/80 px-6 py-10 shadow-2xl backdrop-blur sm:px-10 sm:py-12">
            <div className="flex items-center gap-3 text-primary"><BookOpenText className="h-6 w-6" aria-hidden="true" /><p className="text-xs font-semibold uppercase tracking-[0.18em]">{strings.eyebrow}</p></div>
            <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">{strings.title}</h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">{strings.description}</p>
            <div className="mt-7 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><p>{strings.controlled}</p></div>
          </header>

          <section className="mt-6 rounded-2xl border border-border bg-card/70 p-5 sm:p-6" aria-label={strings.search}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <label htmlFor="resources-search" className="relative block min-w-0 flex-1"><span className="sr-only">{strings.search}</span><Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" aria-hidden="true" /><input id="resources-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={strings.placeholder} className="h-12 w-full rounded-xl border border-border bg-background pl-12 pr-4 text-foreground outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40" /></label>
              <div className="flex flex-wrap items-center gap-2" aria-label={strings.search}><SlidersHorizontal className="mr-1 h-4 w-4 text-primary" aria-hidden="true" />{filters.map((filter) => <button key={filter.value} type="button" onClick={() => setCategory(filter.value)} aria-pressed={category === filter.value} className={`min-h-10 rounded-full border px-4 text-sm font-medium transition ${category === filter.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>{filter.label}</button>)}</div>
            </div>
          </section>

          <p className="mt-5 text-sm font-medium text-muted-foreground" aria-live="polite">{visibleResources.length} {strings.results}</p>
          {visibleResources.length ? <section className="mt-4 grid gap-4 md:grid-cols-2" aria-label={strings.title}>{visibleResources.map((resource) => <article key={resource.url} className="flex min-h-full flex-col rounded-2xl border border-border bg-card/80 p-6 shadow-lg shadow-black/5"><div className="flex items-center justify-between gap-3"><span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{resource.format === "pdf" ? strings.pdf : strings.web}</span><span className="text-xs font-medium text-muted-foreground">{resource.publisher[locale]}</span></div><h2 className="mt-5 font-display text-2xl font-semibold">{resource.title[locale]}</h2><p className="mt-3 flex-1 leading-7 text-muted-foreground">{resource.description[locale]}</p><a href={resource.url} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/40 px-4 text-sm font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><FileText className="h-4 w-4" aria-hidden="true" />{strings.external}<ExternalLink className="h-4 w-4" aria-hidden="true" /></a></article>)}</section> : <section className="mt-4 rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center text-muted-foreground">{strings.empty}</section>}

          <aside className="mt-6 flex gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm leading-relaxed text-muted-foreground"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" /><div><p>{strings.note}</p><p className="mt-2 text-xs text-muted-foreground/80">{strings.updated}</p></div></aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}

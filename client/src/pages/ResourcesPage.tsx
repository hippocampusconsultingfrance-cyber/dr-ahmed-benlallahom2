import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import { SEOHead } from "@/components/SEOHead";
import { useLanguage } from "@/contexts/LanguageContext";
import { BookOpen, ExternalLink, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

type ResourceLanguage = "fr" | "en" | "de" | "zh";

const resources = [
  { id: "who", category: "global", url: "https://www.who.int/health-topics", source: "OMS / WHO", title: { fr: "Thèmes de santé", en: "Health topics", de: "Gesundheitsthemen", zh: "健康主题" }, description: { fr: "Portail institutionnel mondial de thèmes de santé, interventions et systèmes de santé.", en: "Global institutional portal for health topics, interventions and health systems.", de: "Weltweites institutionelles Portal zu Gesundheitsthemen, Interventionen und Gesundheitssystemen.", zh: "涵盖健康主题、干预措施和卫生系统的全球机构门户。" } },
  { id: "has", category: "france", url: "https://www.has-sante.fr/jcms/fc_2875208/fr/rechercher-une-recommandation-un-avis", source: "Haute Autorité de Santé", title: { fr: "Recommandations et avis", en: "Guidelines and opinions", de: "Empfehlungen und Stellungnahmen", zh: "建议与意见" }, description: { fr: "Moteur de recherche institutionnel des recommandations, avis et publications de la HAS.", en: "Institutional search portal for HAS guidelines, opinions and publications.", de: "Institutionelles Rechercheportal für HAS-Empfehlungen, Stellungnahmen und Veröffentlichungen.", zh: "HAS 建议、意见和出版物的机构检索门户。" } },
  { id: "ecdc", category: "europe", url: "https://www.ecdc.europa.eu/en", source: "ECDC", title: { fr: "Prévention et contrôle des maladies", en: "Disease prevention and control", de: "Prävention und Kontrolle von Krankheiten", zh: "疾病预防与控制" }, description: { fr: "Publications et informations européennes sur la surveillance, la prévention et les menaces transmissibles.", en: "European publications and information on surveillance, prevention and communicable threats.", de: "Europäische Veröffentlichungen und Informationen zu Überwachung, Prävention und übertragbaren Gesundheitsgefahren.", zh: "关于监测、预防和传染病威胁的欧洲出版物与信息。" } },
] as const;

const copy = {
  fr: { eyebrow: "Ressources institutionnelles", title: "S’informer auprès de sources médicales fiables.", description: "Une sélection de portails institutionnels pour prolonger votre information. Ces liens ne remplacent ni un avis médical personnalisé ni une prise en charge d’urgence.", search: "Rechercher une ressource", all: "Toutes", global: "International", france: "France", europe: "Europe", open: "Consulter la source", note: "En cas d’urgence ou de symptôme préoccupant, contactez les services d’urgence ou un professionnel de santé.", noResult: "Aucune ressource ne correspond à cette recherche.", seo: "Ressources médicales institutionnelles" },
  en: { eyebrow: "Institutional resources", title: "Access reliable medical information.", description: "A selection of institutional portals to extend your information. These links do not replace personalised medical advice or emergency care.", search: "Search a resource", all: "All", global: "International", france: "France", europe: "Europe", open: "Open source", note: "In an emergency or if you have concerning symptoms, contact emergency services or a healthcare professional.", noResult: "No resource matches your search.", seo: "Institutional medical resources" },
  de: { eyebrow: "Institutionelle Ressourcen", title: "Zuverlässige medizinische Informationen finden.", description: "Eine Auswahl institutioneller Portale zur Vertiefung Ihrer Information. Diese Links ersetzen weder eine individuelle medizinische Beratung noch eine Notfallversorgung.", search: "Ressource suchen", all: "Alle", global: "International", france: "Frankreich", europe: "Europa", open: "Quelle öffnen", note: "Wenden Sie sich bei einem Notfall oder besorgniserregenden Symptomen an den Notdienst oder medizinisches Fachpersonal.", noResult: "Keine Ressource entspricht Ihrer Suche.", seo: "Institutionelle medizinische Ressourcen" },
  zh: { eyebrow: "机构资源", title: "获取可靠的医疗信息。", description: "精选机构门户，帮助您进一步了解健康信息。这些链接不能替代个性化医疗建议或紧急救治。", search: "搜索资源", all: "全部", global: "国际", france: "法国", europe: "欧洲", open: "查看来源", note: "如遇紧急情况或出现令人担忧的症状，请联系急救服务或医疗专业人员。", noResult: "没有符合搜索条件的资源。", seo: "机构医疗资源" },
} as const;

export default function ResourcesPage() {
  const { language } = useLanguage();
  const locale = (language in copy ? language : "fr") as ResourceLanguage;
  const text = copy[locale];
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | "global" | "france" | "europe">("all");
  const filtered = useMemo(() => resources.filter(resource => {
    const haystack = `${resource.source} ${resource.title[locale]} ${resource.description[locale]}`.toLocaleLowerCase(locale);
    return (category === "all" || resource.category === category) && haystack.includes(query.toLocaleLowerCase(locale).trim());
  }), [category, locale, query]);

  const filters = [
    ["all", text.all], ["global", text.global], ["france", text.france], ["europe", text.europe],
  ] as const;

  return <div className="min-h-screen bg-background text-foreground">
    <SEOHead title={`${text.seo} | Dr. Ahmed Ben Lallahom`} description={text.description} ogUrl="https://drahmedbenlallahom.com/resources" />
    <Navigation />
    <main id="main-content" tabIndex={-1} className="relative overflow-hidden pb-20 pt-28 sm:pt-32">
      <div className="diagnostic-grid absolute inset-0 opacity-20" aria-hidden="true" />
      <div className="container relative max-w-6xl">
        <header className="rounded-3xl border border-primary/25 bg-card/80 px-6 py-10 shadow-2xl backdrop-blur sm:px-10 sm:py-12">
          <div className="flex items-center gap-3 text-primary"><BookOpen className="h-6 w-6" aria-hidden="true" /><p className="text-xs font-semibold uppercase tracking-[0.18em]">{text.eyebrow}</p></div>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">{text.title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">{text.description}</p>
        </header>

        <section className="mt-6 rounded-2xl border border-border bg-card/70 p-5 sm:p-6" aria-label={text.search}>
          <label className="sr-only" htmlFor="resource-search">{text.search}</label>
          <div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input id="resource-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={text.search} className="h-11 w-full rounded-xl border border-border bg-background py-2 pl-11 pr-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary" /></div>
          <div className="mt-4 flex flex-wrap gap-2">{filters.map(([id, label]) => <button key={id} type="button" onClick={() => setCategory(id)} className={`min-h-10 rounded-lg px-4 text-sm font-medium transition-colors ${category === id ? "bg-primary text-primary-foreground" : "border border-border bg-background text-muted-foreground hover:text-foreground"}`}>{label}</button>)}</div>
        </section>

        <section className="mt-6 grid gap-5 md:grid-cols-3" aria-live="polite">
          {filtered.map(resource => <article key={resource.id} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card/75 p-6 shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{resource.source}</p>
            <h2 className="mt-3 break-words text-xl font-semibold text-foreground">{resource.title[locale]}</h2>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{resource.description[locale]}</p>
            <a className="mt-6 inline-flex min-h-10 items-center gap-2 self-start rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground" href={resource.url} target="_blank" rel="noopener noreferrer">{text.open}<ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
          </article>)}
          {filtered.length === 0 && <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground md:col-span-3">{text.noResult}</p>}
        </section>

        <aside className="mt-6 flex gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm leading-relaxed text-muted-foreground"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" /><p>{text.note}</p></aside>
      </div>
    </main>
    <Footer />
  </div>;
}

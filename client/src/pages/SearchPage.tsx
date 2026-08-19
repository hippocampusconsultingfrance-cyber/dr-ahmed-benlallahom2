import { useMemo, useState } from "react";
import { Search, ArrowRight, Compass } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { useLanguage } from "@/contexts/LanguageContext";
import { searchPublicPages } from "@/lib/publicSearchIndex";

const copy = {
  fr: { title: "Rechercher sur le site", intro: "Retrouvez rapidement une consultation, un parcours candidat ou une information pratique.", placeholder: "Ex. consultation, candidature, RGPD…", search: "Rechercher", idle: "Saisissez un mot-clé pour explorer les pages publiques.", results: "résultat(s)", none: "Aucun résultat ne correspond à cette recherche.", visit: "Consulter" },
  en: { title: "Search the website", intro: "Quickly find a consultation, candidate journey or practical information.", placeholder: "E.g. consultation, application, GDPR…", search: "Search", idle: "Enter a keyword to explore public pages.", results: "result(s)", none: "No results match this search.", visit: "Open" },
  de: { title: "Website durchsuchen", intro: "Finden Sie schnell eine Beratung, einen Kandidatenweg oder praktische Informationen.", placeholder: "Z. B. Beratung, Bewerbung, DSGVO…", search: "Suchen", idle: "Geben Sie ein Stichwort ein, um öffentliche Seiten zu durchsuchen.", results: "Ergebnis(se)", none: "Für diese Suche wurden keine Ergebnisse gefunden.", visit: "Öffnen" },
  zh: { title: "搜索网站", intro: "快速查找咨询、候选人流程或实用信息。", placeholder: "例如：咨询、申请、GDPR…", search: "搜索", idle: "输入关键词以浏览公开页面。", results: "条结果", none: "没有与此搜索匹配的结果。", visit: "查看" },
} as const;

export default function SearchPage() {
  const { language } = useLanguage();
  const strings = copy[language];
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const results = useMemo(() => searchPublicPages(query, language), [query, language]);
  const hasQuery = query.trim().length > 0;

  return <div className="min-h-screen bg-background text-foreground"><SEOHead title="Recherche | Dr. Ahmed Ben Lallahom" description="Recherchez les parcours publics du site." noIndex /><Navigation /><main id="main-content" tabIndex={-1} className="container pt-32 pb-20 md:pt-40"><div className="mx-auto max-w-3xl"><div className="mb-10"><p className="abl-signature text-xs font-bold uppercase tracking-[0.24em] text-primary">ABL / HIPPOCAMPUS</p><h1 className="mt-3 font-display text-4xl font-bold md:text-5xl">{strings.title}</h1><p className="mt-4 max-w-2xl text-muted-foreground">{strings.intro}</p></div><form role="search" onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-3 sm:flex-row"><label htmlFor="site-search" className="sr-only">{strings.search}</label><div className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" aria-hidden="true" /><input id="site-search" type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={strings.placeholder} className="h-14 w-full rounded-xl border border-border bg-card pl-12 pr-4 text-foreground shadow-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40" /></div><button className="cta-primary h-14 rounded-xl px-6" type="submit">{strings.search}</button></form><section className="mt-10" aria-live="polite">{!hasQuery ? <div className="rounded-2xl border border-border bg-card/60 p-8 text-center text-muted-foreground"><Compass className="mx-auto mb-3 h-7 w-7 text-primary" aria-hidden="true" />{strings.idle}</div> : results.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center text-muted-foreground">{strings.none}</div> : <><p className="mb-4 text-sm font-medium text-muted-foreground">{results.length} {strings.results}</p><div className="space-y-3">{results.map(({ entry }) => <a key={entry.href} href={entry.href} className="group block rounded-2xl border border-border bg-card p-5 transition hover:border-primary/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-xl font-bold group-hover:text-primary">{entry.title[language]}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.description[language]}</p></div><ArrowRight className="mt-1 h-5 w-5 shrink-0 text-primary transition group-hover:translate-x-1" aria-hidden="true" /></div><span className="mt-4 inline-block text-sm font-semibold text-primary">{strings.visit}</span></a>)}</div></>}</section></div></main><Footer /></div>;
}

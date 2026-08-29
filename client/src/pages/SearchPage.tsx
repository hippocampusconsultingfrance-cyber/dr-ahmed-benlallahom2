import { useMemo, useState } from "react";
import { Search, ArrowRight, Compass } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { useLanguage } from "@/contexts/LanguageContext";
import { searchPublicPages } from "@/lib/publicSearchIndex";

const copy = {
  fr: { title: "Rechercher sur le site", placeholder: "Rechercher une information publique…", search: "Rechercher", idle: "Saisissez un mot-clé pour explorer les informations publiques visibles sur le site.", results: "résultat(s)", none: "Aucune information publique ne correspond à cette recherche.", visit: "Consulter" },
  en: { title: "Search the website", placeholder: "Search public information…", search: "Search", idle: "Enter a keyword to explore the public information visible on this website.", results: "result(s)", none: "No public information matches this search.", visit: "Open" },
  de: { title: "Website durchsuchen", placeholder: "Öffentliche Informationen suchen…", search: "Suchen", idle: "Geben Sie ein Stichwort ein, um die sichtbaren öffentlichen Informationen dieser Website zu durchsuchen.", results: "Ergebnis(se)", none: "Keine öffentlichen Informationen entsprechen dieser Suche.", visit: "Öffnen" },
  zh: { title: "搜索网站", placeholder: "搜索公开信息…", search: "搜索", idle: "输入关键词以浏览网站上可见的公开信息。", results: "条结果", none: "没有与此搜索匹配的公开信息。", visit: "查看" },
} as const;

export default function SearchPage() {
  const { language } = useLanguage();
  const strings = copy[language];
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const results = useMemo(() => searchPublicPages(query, language), [query, language]);
  const hasQuery = query.trim().length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead title="Recherche | Dr. Ahmed Ben Lallahom" description="Recherchez les informations publiques visibles sur le site." noIndex />
      <Navigation />
      <main id="main-content" tabIndex={-1} className="container pt-32 pb-20 md:pt-40">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-8 font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">{strings.title}</h1>
          <form role="search" onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="site-search" className="sr-only">{strings.search}</label>
            <div className="site-search-shell flex-1">
              <Search className="site-search-icon h-5 w-5 text-primary" aria-hidden="true" />
              <input id="site-search" type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={strings.placeholder} className="site-search-input h-14 w-full rounded-xl border border-border bg-card text-foreground shadow-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40" />
            </div>
            <button className="cta-primary h-14 rounded-xl px-6" type="submit">{strings.search}</button>
          </form>
          <section className="mt-10" aria-live="polite">
            {!hasQuery ? (
              <div className="rounded-2xl border border-border bg-card/60 p-8 text-center text-muted-foreground"><Compass className="mx-auto mb-3 h-7 w-7 text-primary" aria-hidden="true" />{strings.idle}</div>
            ) : results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center text-muted-foreground">{strings.none}</div>
            ) : (
              <>
                <p className="mb-4 text-sm font-medium text-muted-foreground">{results.length} {strings.results}</p>
                <div className="space-y-3">{results.map(({ entry }) => <a key={entry.href} href={entry.href} className="group block rounded-2xl border border-border bg-card p-5 transition hover:border-primary/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-xl font-bold group-hover:text-primary">{entry.title[language]}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.description[language]}</p></div><ArrowRight className="mt-1 h-5 w-5 shrink-0 text-primary transition group-hover:translate-x-1" aria-hidden="true" /></div><span className="mt-4 inline-block text-sm font-semibold text-primary">{strings.visit}</span></a>)}</div>
              </>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { venturesFr } from "@/data/ventures-fr";
import { venturesEn } from "@/data/ventures-en";
import {
  ventureNarrativesDe,
  ventureNarrativesZh,
} from "@/data/ventureNarratives";
import { useParams, Link } from "wouter";
import { ArrowLeft, ArrowUpRight, ExternalLink, Linkedin, User } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import Breadcrumb from "@/components/Breadcrumb";

export const venturePageCopy = {
  fr: {
    notFound: "Page non trouvée",
    home: "Accueil",
    homeBack: "Retour à l'accueil",
    visit: "Visiter le site web",
    leadership: "Direction",
    services: "Services & Expertises",
    highlights: "Informations clés",
    back: "Retour aux entreprises",
    others: "Autres entreprises",
  },
  en: {
    notFound: "Page not found",
    home: "Home",
    homeBack: "Back to home",
    visit: "Visit website",
    leadership: "Leadership team",
    services: "Services & expertise",
    highlights: "Key information",
    back: "Back to ventures",
    others: "Other ventures",
  },
  de: {
    notFound: "Seite nicht gefunden",
    home: "Startseite",
    homeBack: "Zur Startseite",
    visit: "Website besuchen",
    leadership: "Leitungsteam",
    services: "Leistungen & Expertise",
    highlights: "Wichtige Informationen",
    back: "Zurück zu den Unternehmen",
    others: "Weitere Unternehmen",
  },
  zh: {
    notFound: "页面未找到",
    home: "首页",
    homeBack: "返回首页",
    visit: "访问网站",
    leadership: "管理团队",
    services: "服务与专长",
    highlights: "关键信息",
    back: "返回企业列表",
    others: "其他企业",
  },
} as const;

export function ventureMetaDescription(description: string[]) {
  const text = description[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length <= 160) return text;

  const excerpt = text.slice(0, 159);
  const lastWordBoundary = excerpt.lastIndexOf(" ");
  const end = lastWordBoundary >= 120 ? lastWordBoundary : 159;
  return `${excerpt.slice(0, end).trimEnd()}…`;
}

/** Seule la page de la pratique clinique mène à la consultation payante (PUB-02). */
export const CONSULTATION_VENTURE_SLUG = "pratique-clinique";

export const VENTURE_LOGO_PLACEHOLDER = "/assets/venture-placeholder.svg";
export const TEAM_PHOTO_PLACEHOLDER = "/assets/team-placeholder.svg";

/**
 * Source à mémoriser comme « en échec » après un onError, ou null quand le
 * visuel affiché est déjà le visuel générique local : on ne rebascule jamais,
 * ce qui empêche toute boucle onError si le visuel de secours échoue aussi.
 */
export function failedSourceAfterError(
  src: string,
  shownSrc: string,
  fallbackSrc: string
): string | null {
  return shownSrc === fallbackSrc ? null : src;
}

/**
 * Logos et portraits sont servis depuis client/public/assets ; une image encore
 * référencée sous /manus-storage/… (proxy Manus indisponible sur Vercel) ou
 * introuvable affiche le visuel générique local plutôt qu'une image cassée.
 */
function ImageWithFallback({
  src,
  fallbackSrc,
  className,
  loading,
}: {
  src: string;
  fallbackSrc: string;
  className: string;
  loading?: "lazy" | "eager";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shownSrc = failedSrc === src ? fallbackSrc : src;

  return (
    <img
      src={shownSrc}
      alt=""
      aria-hidden="true"
      loading={loading}
      decoding="async"
      className={className}
      onError={() => {
        const failed = failedSourceAfterError(src, shownSrc, fallbackSrc);
        if (failed) setFailedSrc(failed);
      }}
    />
  );
}

export default function VenturePage() {
  const { language, content } = useLanguage();
  const copy =
    venturePageCopy[
      (language in venturePageCopy
        ? language
        : "fr") as keyof typeof venturePageCopy
    ];
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const baseVentures = language === "fr" ? venturesFr : venturesEn;
  const narratives =
    language === "de"
      ? ventureNarrativesDe
      : language === "zh"
        ? ventureNarrativesZh
        : undefined;
  const ventures = narratives
    ? baseVentures.map(venture => ({
        ...venture,
        ...(narratives[venture.slug] ?? {}),
      }))
    : baseVentures;
  const venture = ventures.find(v => v.slug === slug);

  if (!venture) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-3xl text-foreground mb-4">
            {copy.notFound}
          </h1>
          <Link href="/" className="text-primary hover:underline">
            {copy.homeBack}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={`${venture.company} — ${venture.role} | Dr. Ahmed Ben Lallahom`}
        description={ventureMetaDescription(venture.description)}
        ogUrl={`https://drahmedbenlallahom.com/venture/${venture.slug}`}
      />
      <Navigation />
      <main id="main-content" tabIndex={-1} className="pt-24 pb-20">
        {/* Breadcrumb */}
        <div className="container mb-8">
          <Breadcrumb
            items={[
              { label: content.experiences.title, href: "/#experience" },
              { label: venture.company },
            ]}
          />
        </div>

        {/* Hero */}
        <div className="container mb-16">
          <div className="max-w-4xl">
            {venture.logo && (
              <div className="mb-6">
                <ImageWithFallback
                  src={venture.logo}
                  fallbackSrc={VENTURE_LOGO_PLACEHOLDER}
                  className="h-16 sm:h-20 w-auto max-w-full rounded-lg object-contain"
                />
              </div>
            )}
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full bg-primary/10 text-primary border border-primary/20">
                {venture.role}
              </span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-4">
              {venture.company}
            </h1>
            <p className="text-xl sm:text-2xl text-primary font-medium mb-6">
              {venture.tagline}
            </p>
            {venture.website && (
              <a
                href={venture.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-all text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
                {copy.visit}
              </a>
            )}
            {venture.slug === CONSULTATION_VENTURE_SLUG && (
              <a href="/booking" className="cta-primary">
                {content.hero.bookConsultation}
                <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>

        {/* Content Grid */}
        <div className="container">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16">
            {/* Main content — 8 cols */}
            <div className="lg:col-span-8">
              {/* Description */}
              <div className="space-y-5 mb-12">
                {venture.description.map(paragraph => (
                  <p
                    key={paragraph}
                    className="text-muted-foreground text-lg leading-relaxed"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>

              {/* Team Section */}
              {venture.team && venture.team.length > 0 && (
                <section
                  className="mb-12"
                  aria-labelledby="venture-leadership-title"
                >
                  <h2
                    id="venture-leadership-title"
                    className="font-display text-2xl font-bold text-foreground mb-8"
                  >
                    {copy.leadership}
                  </h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {venture.team.map(member => (
                      <div
                        key={member.name}
                        className="group relative p-6 rounded-2xl bg-card/50 border border-border/30 hover:border-primary/40 transition-all duration-300 text-center"
                      >
                        {/* Photo / Silhouette */}
                        <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden border-2 border-border/40 group-hover:border-primary/50 transition-colors">
                          {member.photo ? (
                            <ImageWithFallback
                              src={member.photo}
                              fallbackSrc={TEAM_PHOTO_PLACEHOLDER}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                              <User
                                className="w-10 h-10 text-slate-400"
                                aria-hidden="true"
                              />
                            </div>
                          )}
                        </div>

                        {/* Name */}
                        <h3 className="font-semibold text-foreground text-sm mb-1">
                          {member.name}
                        </h3>

                        {/* Role */}
                        <p className="text-xs text-primary font-medium mb-3">
                          {member.role}
                        </p>

                        {/* LinkedIn link */}
                        {member.linkedin && (
                          <a
                            href={member.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                          >
                            <Linkedin
                              className="w-3.5 h-3.5"
                              aria-hidden="true"
                            />
                            LinkedIn
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Services */}
              <section
                className="p-8 rounded-2xl bg-card/50 border border-border/30"
                aria-labelledby="venture-services-title"
              >
                <h2
                  id="venture-services-title"
                  className="font-display text-xl font-bold text-foreground mb-6"
                >
                  {copy.services}
                </h2>
                <ul className="space-y-3">
                  {venture.services.map(service => (
                    <li key={service} className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 shrink-0" />
                      <span className="text-muted-foreground">{service}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {/* Sidebar — 4 cols */}
            <div className="lg:col-span-4">
              {/* Highlights card */}
              <section
                className="p-6 rounded-2xl bg-card/60 border border-border/30 mb-6 sticky top-28"
                aria-labelledby="venture-highlights-title"
              >
                <h2
                  id="venture-highlights-title"
                  className="font-semibold text-foreground mb-5 text-sm uppercase tracking-wide"
                >
                  {copy.highlights}
                </h2>
                <div className="space-y-4">
                  {venture.highlights.map(h => (
                    <div
                      key={h.label}
                      className="flex justify-between items-center py-2 border-b border-border/20 last:border-0"
                    >
                      <span className="text-sm text-muted-foreground">
                        {h.label}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {h.value}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Tags */}
                <div className="mt-6 pt-4 border-t border-border/20">
                  <div className="flex flex-wrap gap-2">
                    {venture.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 text-xs rounded-md bg-primary/10 text-primary border border-primary/20"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </section>

              {/* Back link */}
              <Link
                href="/#experience"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
              >
                <ArrowLeft
                  className="w-4 h-4 group-hover:-translate-x-1 transition-transform"
                  aria-hidden="true"
                />
                {copy.back}
              </Link>
            </div>
          </div>
        </div>

        {/* Other ventures */}
        <div className="container mt-20">
          <div className="ecg-divider mb-12" />
          <h2 className="font-display text-2xl font-bold text-foreground mb-8">
            {copy.others}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ventures
              .filter(v => v.slug !== slug)
              .map(v => (
                <Link
                  key={v.slug}
                  href={`/venture/${v.slug}`}
                  className="group p-5 rounded-xl bg-card/40 border border-border/20 hover:border-primary/30 transition-all"
                >
                  <p className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1">
                    {v.company}
                  </p>
                  <p className="text-xs text-muted-foreground">{v.role}</p>
                </Link>
              ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

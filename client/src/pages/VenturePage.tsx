import { useLanguage } from "@/contexts/LanguageContext";
import { venturesFr } from "@/data/ventures-fr";
import { venturesEn } from "@/data/ventures-en";
import { useParams, Link } from "wouter";
import { ArrowLeft, ExternalLink, ChevronRight } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

export default function VenturePage() {
  const { language, content } = useLanguage();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const ventures = language === "fr" ? venturesFr : venturesEn;
  const venture = ventures.find((v) => v.slug === slug);

  if (!venture) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-3xl text-foreground mb-4">
            {language === "fr" ? "Page non trouvée" : "Page not found"}
          </h1>
          <Link href="/" className="text-primary hover:underline">
            {language === "fr" ? "Retour à l'accueil" : "Back to home"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-20">
        {/* Breadcrumb */}
        <div className="container mb-8">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-primary transition-colors">
              {language === "fr" ? "Accueil" : "Home"}
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/#experience" className="hover:text-primary transition-colors">
              {content.experiences.title}
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground">{venture.company}</span>
          </nav>
        </div>

        {/* Hero */}
        <div className="container mb-16">
          <div className="max-w-4xl">
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
          </div>
        </div>

        {/* Content Grid */}
        <div className="container">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16">
            {/* Main content — 8 cols */}
            <div className="lg:col-span-8">
              {/* Description */}
              <div className="space-y-5 mb-12">
                {venture.description.map((paragraph, i) => (
                  <p key={i} className="text-muted-foreground text-lg leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>

              {/* Services */}
              <div className="p-8 rounded-2xl bg-card/50 border border-border/30">
                <h3 className="font-display text-xl font-bold text-foreground mb-6">
                  {language === "fr" ? "Services & Expertises" : "Services & Expertise"}
                </h3>
                <ul className="space-y-3">
                  {venture.services.map((service, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 shrink-0" />
                      <span className="text-muted-foreground">{service}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Sidebar — 4 cols */}
            <div className="lg:col-span-4">
              {/* Highlights card */}
              <div className="p-6 rounded-2xl bg-card/60 border border-border/30 mb-6 sticky top-28">
                <h4 className="font-semibold text-foreground mb-5 text-sm uppercase tracking-wide">
                  {language === "fr" ? "Informations Clés" : "Key Information"}
                </h4>
                <div className="space-y-4">
                  {venture.highlights.map((h, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-border/20 last:border-0">
                      <span className="text-sm text-muted-foreground">{h.label}</span>
                      <span className="text-sm font-medium text-foreground">{h.value}</span>
                    </div>
                  ))}
                </div>

                {/* Tags */}
                <div className="mt-6 pt-4 border-t border-border/20">
                  <div className="flex flex-wrap gap-2">
                    {venture.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 text-xs rounded-md bg-primary/10 text-primary border border-primary/20"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Back link */}
              <Link
                href="/#experience"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                {language === "fr" ? "Retour aux entreprises" : "Back to ventures"}
              </Link>
            </div>
          </div>
        </div>

        {/* Other ventures */}
        <div className="container mt-20">
          <div className="ecg-divider mb-12" />
          <h3 className="font-display text-2xl font-bold text-foreground mb-8">
            {language === "fr" ? "Autres Entreprises" : "Other Ventures"}
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ventures
              .filter((v) => v.slug !== slug)
              .map((v) => (
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

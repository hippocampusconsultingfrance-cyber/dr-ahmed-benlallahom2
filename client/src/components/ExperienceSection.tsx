import { useLanguage } from "@/contexts/LanguageContext";
import { venturesFr } from "@/data/ventures-fr";
import { venturesEn } from "@/data/ventures-en";
import { Briefcase, Stethoscope, Building2, Globe, Brain, HeartPulse, ArrowRight } from "lucide-react";
import { Link } from "wouter";

const experienceIcons = [Building2, HeartPulse, Globe, Brain, Briefcase, Stethoscope];

export default function ExperienceSection() {
  const { content, language } = useLanguage();
  const ventures = language === "fr" ? venturesFr : venturesEn;

  return (
    <section id="experience" className="experience-section py-28 sm:py-36 relative">
      <div className="container">
        {/* Header — right-aligned for asymmetry */}
        <div className="section-heading max-w-2xl ml-auto text-right mb-16">
          <span className="eyebrow-label justify-end mb-5">Medical ventures</span>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            {content.experiences.title}
          </h2>
          <p className="text-muted-foreground text-lg">
            {content.experiences.subtitle}
          </p>
          <div className="w-16 h-0.5 bg-primary/50 ml-auto mt-4" />
        </div>

        {/* Staggered grid */}
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
          {content.experiences.items.map((exp, i) => {
            const Icon = experienceIcons[i] || Briefcase;
            const venture = ventures[i];
            const slug = venture?.slug;

            return (
              <Link
                key={i}
                href={slug ? `/venture/${slug}` : "#"}
                className={`venture-card card-glow group p-7 sm:p-8 rounded-xl bg-card border border-border/30 cursor-pointer hover:border-primary/40 transition-all duration-300 ${
                  i % 2 === 0 ? "md:translate-y-0" : "md:translate-y-6"
                }`}
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors border border-primary/20">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-foreground leading-tight group-hover:text-primary transition-colors">{exp.company}</h3>
                      <p className="text-sm font-semibold mt-0.5" style={{ color: "oklch(0.72 0.1 75)" }}>{exp.role}</p>
                    </div>
                  </div>
                                      <ArrowRight aria-hidden="true" className="venture-arrow w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200 shrink-0 mt-2" />

                </div>
                <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                  {exp.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {exp.tags.map((tag, tagIndex) => (
                    <span
                      key={`${tag}-${tagIndex}`}
                      className="px-2.5 py-1 rounded-md text-xs font-medium bg-primary/8 text-primary/80 border border-primary/15"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

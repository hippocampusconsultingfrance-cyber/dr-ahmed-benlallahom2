import { useLanguage } from "@/contexts/LanguageContext";
import { Briefcase, Stethoscope, Building2, Globe, Brain, HeartPulse } from "lucide-react";

const experienceIcons = [Building2, HeartPulse, Globe, Brain, Briefcase, Stethoscope];

export default function ExperienceSection() {
  const { content } = useLanguage();

  return (
    <section id="experience" className="py-28 sm:py-36 relative">
      <div className="container">
        {/* Header — right-aligned for asymmetry */}
        <div className="max-w-2xl ml-auto text-right mb-16">
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
            return (
              <div
                key={i}
                className={`card-glow group p-7 sm:p-8 rounded-xl bg-card border border-border/30 ${
                  i % 2 === 0 ? "md:translate-y-0" : "md:translate-y-6"
                }`}
              >
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors border border-primary/20">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-foreground leading-tight">{exp.company}</h3>
                    <p className="text-sm font-semibold mt-0.5" style={{ color: "oklch(0.72 0.1 75)" }}>{exp.role}</p>
                  </div>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                  {exp.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {exp.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-md text-xs font-medium bg-primary/8 text-primary/80 border border-primary/15"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import { useEffect, useState } from "react";
import { siteConfig } from "@/data/site-config";
import { useLanguage } from "@/contexts/LanguageContext";
import { scrollToSectionTop } from "@/lib/scrollToSection";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { ArrowUpRight, BadgeCheck, Clock3, Languages } from "lucide-react";

/** Time each role of the hero stays on screen. */
export const HERO_ROLE_INTERVAL_MS = 3000;

/**
 * Index of the hero role shown: each role once, then back to the first, where the title stays;
 * none changes when the visitor asks for reduced motion (A11Y-07). The title still updates by
 * itself, with no pause: only the three roles shown at once would meet WCAG 2.2.2 strictly.
 */
export function useHeroRoleIndex(count: number) {
  const [roleIndex, setRoleIndex] = useState(0);

  useEffect(() => {
    if (
      count < 2 ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    let shown = 0;
    const interval = window.setInterval(() => {
      shown += 1;
      setRoleIndex(shown % count);
      if (shown >= count) window.clearInterval(interval);
    }, HERO_ROLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [count]);

  return roleIndex;
}

export default function HeroSection() {
  const { content, language } = useLanguage();
  const roleIndex = useHeroRoleIndex(content.hero.roles.length);

  const trustCopy = {
    fr: [
      "Expertise clinique certifiée",
      "Consultation de 30 minutes",
      "Accompagnement international",
    ],
    en: [
      "Certified clinical expertise",
      "30-minute consultation",
      "International support",
    ],
    de: [
      "Zertifizierte klinische Expertise",
      "30-minütige Beratung",
      "Internationale Begleitung",
    ],
    zh: ["专业临床经验", "30分钟咨询", "国际化支持"],
  }[language] ?? [
    "Certified clinical expertise",
    "30-minute consultation",
    "International support",
  ];

  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center overflow-hidden bg-background"
    >
      {/* Background Image: decorative, the h1 already names the doctor (A11Y-14). */}
      <div className="absolute inset-0">
        <img
          src="/assets/medical-hero.svg"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover sm:object-right"
          loading="eager"
          fetchPriority="high"
          style={{
            objectPosition:
              window.innerWidth < 640 ? "center 20%" : "right center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/40 sm:to-background/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/20" />
        {/* Diagnostic grid overlay */}
        <div className="absolute inset-0 diagnostic-grid opacity-40" />
      </div>

      {/* ECG line at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-px">
        <svg
          className="w-full h-12 absolute bottom-0"
          viewBox="0 0 1280 48"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M0 24 L400 24 L440 24 L460 6 L480 42 L500 12 L520 30 L540 24 L600 24 L1280 24"
            stroke="oklch(0.75 0.15 220 / 0.4)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* Content — deliberately left-aligned, asymmetric */}
      <div className="container relative z-10 pt-28 pb-16 sm:pt-32 sm:pb-24">
        <div className="hero-panel max-w-3xl p-6 sm:p-8 lg:p-12">
          <div className="max-w-2xl">
            {/* Kicker on its own line above the badge (PUB-18); balanced lines when it wraps on a phone, spaced by .hero-panel .eyebrow-label in index.css. */}
            <div className="flex flex-col items-start">
              <span className="eyebrow-label mb-6 text-balance">
                Hippocampus Consulting · France
              </span>

              {/* Credentials badge with gold */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gold/30 bg-gold/5 mb-8">
                <span
                  className="w-2 h-2 rounded-full bg-gold"
                  style={{ backgroundColor: "oklch(0.72 0.1 75)" }}
                />
                <span className="text-xs font-semibold tracking-widest uppercase text-gold-gradient">
                  {siteConfig.credentials} — France
                </span>
              </div>
            </div>

            {/* Name — oversized, editorial */}
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-foreground leading-[1.05] mb-6 tracking-tight">
              {content.hero.greeting}
            </h1>

            {/* Animated role with cyan accent (A11Y-07): the roles share one grid cell, so that the block keeps
              the height of the longest one, wrapped on a phone rather than cut, and the page does not move
              when the role changes. Screen readers read the three roles at once, separated by commas, which
              they pause on (a « · » can be read out as « middle dot »). */}
            <div className="min-h-10 sm:min-h-12 mb-8">
              <p className="sr-only">{content.hero.roles.join(", ")}</p>
              <div className="grid" aria-hidden="true">
                {content.hero.roles.map((role, index) => (
                  <p
                    key={index}
                    className={cn(
                      "col-start-1 row-start-1 text-xl sm:text-2xl lg:text-3xl font-medium text-primary",
                      index === roleIndex
                        ? "animate-in fade-in slide-in-from-bottom-2 duration-500"
                        : "invisible"
                    )}
                  >
                    {role}
                  </p>
                ))}
              </div>
            </div>

            {/* Description */}
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-lg mb-12">
              {content.hero.description}
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Link href="/booking" className="cta-primary">
                {content.hero.bookConsultation}
                <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <button
                onClick={() =>
                  scrollToSectionTop(document.getElementById("contact"))
                }
                className="cta-secondary"
              >
                {content.nav.getInTouch}
              </button>
            </div>

            {/* No aria-label: on a div without a role, it is not allowed (axe aria-prohibited-attr), and was in English on every page. */}
            <div className="trust-strip">
              <div className="trust-strip-item">
                <BadgeCheck aria-hidden="true" className="h-4 w-4" />
                <span>{trustCopy[0]}</span>
              </div>
              <div className="trust-strip-item">
                <Clock3 aria-hidden="true" className="h-4 w-4" />
                <span>{trustCopy[1]}</span>
              </div>
              <div className="trust-strip-item">
                <Languages aria-hidden="true" className="h-4 w-4" />
                <span>{trustCopy[2]}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

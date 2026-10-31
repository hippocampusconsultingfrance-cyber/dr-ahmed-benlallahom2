import { useEffect, useState } from "react";
import { siteConfig } from "@/data/site-config";
import { useLanguage } from "@/contexts/LanguageContext";
import { scrollToSectionTop } from "@/lib/scrollToSection";
import { Link } from "wouter";
import { ArrowUpRight, BadgeCheck, Clock3, Languages } from "lucide-react";

export default function HeroSection() {
  const { content, language } = useLanguage();
  const [roleIndex, setRoleIndex] = useState(0);

  const trustCopy = {
    fr: ["Expertise clinique certifiée", "Consultation de 30 minutes", "Accompagnement international"],
    en: ["Certified clinical expertise", "30-minute consultation", "International support"],
    de: ["Zertifizierte klinische Expertise", "30-minütige Beratung", "Internationale Begleitung"],
    zh: ["专业临床经验", "30分钟咨询", "国际化支持"],
  }[language] ?? ["Certified clinical expertise", "30-minute consultation", "International support"];

  useEffect(() => {
    const interval = setInterval(() => {
      setRoleIndex((prev) => (prev + 1) % content.hero.roles.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [content.hero.roles.length]);

  return (
    <section id="hero" className="relative min-h-screen flex items-center overflow-hidden bg-background">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src="/assets/medical-hero.svg"
          alt="Dr. Ahmed Ben Lallahom - Anesthésiste-Réanimateur et Entrepreneur en Santé"
          className="w-full h-full object-cover sm:object-right"
          loading="eager"
          fetchPriority="high"
          style={{
            objectPosition: window.innerWidth < 640 ? 'center 20%' : 'right center'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/40 sm:to-background/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/20" />
        {/* Diagnostic grid overlay */}
        <div className="absolute inset-0 diagnostic-grid opacity-40" />
      </div>

      {/* ECG line at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-px">
        <svg className="w-full h-12 absolute bottom-0" viewBox="0 0 1280 48" preserveAspectRatio="none" fill="none">
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
            <span className="eyebrow-label mb-6">Hippocampus Consulting · France</span>

          {/* Credentials badge with gold */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gold/30 bg-gold/5 mb-8">
            <span className="w-2 h-2 rounded-full bg-gold" style={{ backgroundColor: "oklch(0.72 0.1 75)" }} />
            <span className="text-xs font-semibold tracking-widest uppercase text-gold-gradient">
              {siteConfig.credentials} — France
            </span>
          </div>

          {/* Name — oversized, editorial */}
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-foreground leading-[1.05] mb-6 tracking-tight">
            {content.hero.greeting}
          </h1>

          {/* Animated role with cyan accent */}
          <div className="h-10 sm:h-12 mb-8 overflow-hidden">
            <p
              key={roleIndex}
              className="text-xl sm:text-2xl lg:text-3xl font-medium text-primary animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              {content.hero.roles[roleIndex]}
            </p>
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
              onClick={() => scrollToSectionTop(document.getElementById("contact"))}
              className="cta-secondary"
            >
              {content.nav.getInTouch}
            </button>
          </div>

          <div className="trust-strip" aria-label="Professional assurances">
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

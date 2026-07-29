import { useEffect, useState } from "react";
import { siteConfig } from "@/data/site-config";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";

export default function HeroSection() {
  const { content } = useLanguage();
  const [roleIndex, setRoleIndex] = useState(0);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const interval = setInterval(() => {
      setRoleIndex((prev) => (prev + 1) % content.hero.roles.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [content.hero.roles.length]);

  return (
    <section id="hero" className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src="/manus-storage/hero-bg-ahmed_156f3568.png"
          alt="Dr. Ahmed Ben Lallahom - Anesthésiste-Réanimateur et Entrepreneur en Santé"
          className="w-full h-full object-cover sm:object-right"
          loading="lazy"
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
      <div className="container relative z-10 pt-32 pb-24">
        <div className="max-w-2xl">
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
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => setLocation("/booking")}
              className="px-8 py-4 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all duration-200 active:scale-[0.97] shadow-lg shadow-primary/25"
            >
              Réserver une Consultation
            </button>
            <button
              onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })}
              className="px-8 py-4 rounded-full border border-border/60 text-foreground font-semibold hover:border-primary/50 hover:text-primary transition-all duration-200"
            >
              {content.nav.getInTouch}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

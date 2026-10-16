import { useLanguage } from "@/contexts/LanguageContext";
import { siteConfig } from "@/data/site-config";
import { useEffect, useRef, useState } from "react";

/** Portrait officiel du Dr Ben Lallahom (même fichier que les pages /venture/*). */
const ABOUT_PORTRAIT_SRC = "/assets/team/ahmed-ben-lallahom.webp";

function AnimatedCounter({ target }: { target: string }) {
  const numericTarget = parseInt(target.replace(/\D/g, "")) || 0;
  const suffix = target.includes("+") ? "+" : "";
  const [count, setCount] = useState(numericTarget);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const duration = 1500;
          const startTime = performance.now();

          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 4);
            setCount(Math.floor(eased * numericTarget));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [numericTarget]);

  return (
    <span ref={ref} className="stat-monumental">
      {count}{suffix}
    </span>
  );
}

export default function AboutSection() {
  const { content } = useLanguage();
  const { stats } = siteConfig;

  return (
    <section id="about" className="about-section py-28 sm:py-36 relative">
      {/* ECG divider at top */}
      <div className="ecg-divider absolute top-0 left-0 right-0" />

      <div className="container">
        {/* Asymmetric layout: image offset left, content right */}
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-start">
          {/* Image — spans 5 cols, offset */}
          <div className="lg:col-span-5 lg:-mt-12 relative">
            {/*
              Portrait officiel (source 320x320). Le cadre 3:4 est limité à 18rem de large
              pour que le navigateur n'agrandisse la photo que d'environ 1,2x (pas d'upscaling
              artificiel d'un fichier dérivé).
            */}
            <div className="about-visual relative rounded-2xl overflow-hidden aspect-[3/4] w-full max-w-[18rem] mx-auto lg:mx-0 shadow-2xl shadow-primary/10">
              <img
                src={ABOUT_PORTRAIT_SRC}
                width={320}
                height={320}
                loading="lazy"
                decoding="async"
                alt={content.about.portraitAlt}
                className="w-full h-full object-cover object-[50%_35%]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-transparent" aria-hidden="true" />
              {/* Gold corner accent */}
              <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 rounded-tr-lg" style={{ borderColor: "oklch(0.72 0.1 75 / 0.5)" }} />
              <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 rounded-bl-lg" style={{ borderColor: "oklch(0.72 0.1 75 / 0.5)" }} />
            </div>
          </div>

          {/* Content — spans 7 cols */}
          <div className="lg:col-span-7 lg:pl-8 section-heading">
            <span className="eyebrow-label mb-5">Clinical leadership</span>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-8">
              {content.about.title}
            </h2>
            <p className="text-muted-foreground leading-relaxed text-base sm:text-lg mb-14 max-w-xl">
              {content.about.text}
            </p>

            {/* Monumental Stats — 2x2 grid with strong visual weight */}
            <div className="stat-grid grid grid-cols-2 gap-x-4 sm:gap-x-12 gap-y-4 sm:gap-y-10">
              {[
                { value: stats.yearsClinical, label: content.about.statsLabels.yearsClinical },
                { value: stats.ventures, label: content.about.statsLabels.ventures },
                { value: stats.certifications, label: content.about.statsLabels.certifications },
                { value: stats.languages, label: content.about.statsLabels.languages },
              ].map((stat) => (
                <div key={stat.label} className="stat-card">
                  <AnimatedCounter target={stat.value} />
                  <p className="text-sm text-muted-foreground mt-2 font-medium">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

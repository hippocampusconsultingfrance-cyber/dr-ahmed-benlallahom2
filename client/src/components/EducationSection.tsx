import { useLanguage } from "@/contexts/LanguageContext";

export default function EducationSection() {
  const { content } = useLanguage();

  return (
    <section id="education" className="py-28 sm:py-36 relative">
      <div className="container">
        {/* Header — asymmetric with large year accent */}
        <div className="grid lg:grid-cols-12 gap-8 mb-16">
          <div className="lg:col-span-4 hidden lg:flex items-end justify-end">
            <span className="font-display text-7xl font-bold text-gold-gradient opacity-30">2006–2026</span>
          </div>
          <div className="lg:col-span-8">
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
              {content.education.title}
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl">
              {content.education.subtitle}
            </p>
            <div className="w-16 h-0.5 mt-4" style={{ background: "oklch(0.72 0.1 75 / 0.5)" }} />
          </div>
        </div>

        {/* Timeline with ECG-style rail */}
        <div className="relative max-w-3xl mx-auto lg:mx-0 lg:ml-[33.33%] lg:pl-8">
          {/* Vertical ECG rail */}
          <div className="absolute left-4 sm:left-6 top-0 bottom-0 w-px bg-gradient-to-b from-primary/60 via-primary/30 to-primary/10" />

          <div className="space-y-10">
            {content.education.diplomas.map((diploma, i) => (
              <div key={i} className="relative pl-14 sm:pl-18 group">
                {/* Pulse dot on the rail */}
                <div className="absolute left-2.5 sm:left-4.5 top-2 w-3 h-3 rounded-full bg-primary pulse-dot" />

                {/* Content */}
                <div>
                  <span
                    className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-2 tracking-wide"
                    style={{
                      background: "oklch(0.72 0.1 75 / 0.1)",
                      color: "oklch(0.72 0.1 75)",
                      border: "1px solid oklch(0.72 0.1 75 / 0.2)",
                    }}
                  >
                    {diploma.year}
                  </span>
                  <h3 className="font-semibold text-foreground text-base sm:text-lg mb-1 leading-tight">
                    {diploma.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {diploma.institution}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

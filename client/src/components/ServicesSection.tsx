import { useLanguage } from "@/contexts/LanguageContext";

export default function ServicesSection() {
  const { content } = useLanguage();

  return (
    <section id="services" className="services-section py-28 sm:py-36 relative">
      {/* Background with diagnostic grid */}
      <div className="absolute inset-0 opacity-20">
        <img
          src="/manus-storage/services-bg_a14b9c28.png"
          loading="lazy"
          alt="Réseau de soins et expertise médicale internationale"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="absolute inset-0 bg-background/85 diagnostic-grid" />

      {/* ECG divider top */}
      <div className="ecg-divider absolute top-0 left-0 right-0 z-10" />

      <div className="container relative z-10">
        {/* Header — left-aligned with oversized number accent */}
        <div className="section-heading flex items-end gap-6 mb-16">
          <span className="font-display text-8xl sm:text-9xl font-bold text-primary/10 leading-none hidden lg:block">06</span>
          <div className="max-w-xl">
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
              {content.services.title}
            </h2>
            <p className="text-muted-foreground text-lg">
              {content.services.subtitle}
            </p>
          </div>
        </div>

        {/* Services Grid — 3 cols with stagger */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {content.services.items.map((service, i) => (
            <div
              key={i}
              className={`service-card card-glow group p-7 rounded-xl bg-card/70 backdrop-blur-sm border border-border/30 ${
                i === 1 || i === 4 ? "lg:translate-y-4" : ""
              }`}
            >
              {/* Number — monumental, faded */}
              <span className="service-number font-display text-4xl font-bold text-primary/20 group-hover:text-primary/40 transition-colors">
                {service.number}
              </span>

              {/* Title */}
              <h3 className="font-semibold text-lg text-foreground mt-4 mb-3">
                {service.title}
              </h3>

              {/* Description */}
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                {service.description}
              </p>

              {/* Tags as inline text */}
              <div className="pt-4 border-t border-border/20">
                <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider">
                  {service.tags.join(" • ")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ECG divider bottom */}
      <div className="ecg-divider absolute bottom-0 left-0 right-0 z-10" />
    </section>
  );
}

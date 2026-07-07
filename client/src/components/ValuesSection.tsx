import { useLanguage } from "@/contexts/LanguageContext";
import { Shield, Award, BookOpen, Users } from "lucide-react";

const icons = [Shield, Award, BookOpen, Users];

export default function ValuesSection() {
  const { content } = useLanguage();

  return (
    <section className="py-24 sm:py-32 relative diagnostic-grid">
      {/* ECG divider top */}
      <div className="ecg-divider absolute top-0 left-0 right-0" />

      <div className="container">
        {/* Offset header — left aligned */}
        <div className="mb-16 max-w-md">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">
            {content.values.title}
          </h2>
          <div className="w-16 h-0.5 bg-primary/50" />
        </div>

        {/* Staggered grid — not perfectly centered */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {content.values.items.map((item, i) => {
            const Icon = icons[i];
            return (
              <div
                key={i}
                className={`card-glow group p-7 rounded-xl bg-card/80 backdrop-blur-sm border border-border/30 ${
                  i % 2 === 1 ? "sm:translate-y-4" : ""
                }`}
              >
                <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors border border-primary/20">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2 text-lg">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ECG divider bottom */}
      <div className="ecg-divider absolute bottom-0 left-0 right-0" />
    </section>
  );
}

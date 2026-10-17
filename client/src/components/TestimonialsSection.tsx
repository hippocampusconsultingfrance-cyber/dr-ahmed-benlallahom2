import { useLanguage } from "@/contexts/LanguageContext";
import { Star, ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useCallback } from "react";
import PublicContentSkeleton from "./PublicContentSkeleton";

export function getTestimonialsCarouselIndex({
  key,
  currentIndex,
  length,
}: {
  key: "ArrowLeft" | "ArrowRight" | "Home" | "End";
  currentIndex: number;
  length: number;
}) {
  if (length <= 1) return 0;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowLeft") return (currentIndex - 1 + length) % length;
  return (currentIndex + 1) % length;
}

export function getTestimonialEmptyHeading(language: string) {
  return ({ fr: "Les retours seront publiés ici", en: "Partner feedback will appear here", de: "Partnerfeedback wird hier angezeigt", zh: "合作伙伴反馈将在此显示" } as const)[language as "fr" | "en" | "de" | "zh"] ?? "Les retours seront publiés ici";
}

export default function TestimonialsSection() {
  const { language } = useLanguage();
  const { data: testimonials = [], isLoading: loading, error } = trpc.testimonials.list.useQuery(
    {
      language,
      featured: 1,
    },
    {
      staleTime: 1000 * 60 * 60,
    }
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const content: Record<string, any> = {
    fr: {
      title: "Témoignages des Partenaires",
      subtitle: "Ce que disent nos partenaires",
      viewAll: "Voir tous les témoignages",
      error: "Impossible de charger les témoignages.",
      empty: "Aucun témoignage disponible pour le moment.",
      previous: "Témoignage précédent",
      next: "Témoignage suivant",
      goTo: "Aller au témoignage",
      keyboardHelp: "Utilisez les flèches gauche et droite pour parcourir les témoignages, Début pour le premier et Fin pour le dernier.",
    },
    en: {
      title: "Partner Testimonials",
      subtitle: "What our partners say",
      viewAll: "View all testimonials",
      error: "Testimonials could not be loaded.",
      empty: "No testimonials are available at the moment.",
      previous: "Previous testimonial",
      next: "Next testimonial",
      goTo: "Go to testimonial",
      keyboardHelp: "Use the left and right arrow keys to browse testimonials, Home for the first and End for the last.",
    },
    de: {
      title: "Partnerbewertungen",
      subtitle: "Was unsere Partner sagen",
      viewAll: "Alle Bewertungen anzeigen",
      error: "Die Bewertungen konnten nicht geladen werden.",
      empty: "Derzeit sind keine Bewertungen verfügbar.",
      previous: "Vorherige Bewertung",
      next: "Nächste Bewertung",
      goTo: "Zur Bewertung",
      keyboardHelp: "Verwenden Sie die linke und rechte Pfeiltaste zum Durchsuchen, Pos1 für die erste und Ende für die letzte Bewertung.",
    },
    zh: {
      title: "合作伙伴评价",
      subtitle: "我们的合作伙伴怎么说",
      viewAll: "查看所有评价",
      error: "暂时无法加载评价。",
      empty: "目前暂无评价。",
      previous: "上一条评价",
      next: "下一条评价",
      goTo: "前往评价",
      keyboardHelp: "使用左右箭头浏览评价，按 Home 键跳至第一条，按 End 键跳至最后一条。",
    },
  };

  const currentContent = content[language] || content.en;

  const featuredTestimonials = testimonials.filter((t) => t.featured === 1);

  const nextSlide = useCallback(() => {
    if (featuredTestimonials.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % featuredTestimonials.length);
  }, [featuredTestimonials.length]);

  const prevSlide = useCallback(() => {
    if (featuredTestimonials.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + featuredTestimonials.length) % featuredTestimonials.length);
  }, [featuredTestimonials.length]);

  // Auto-play
  useEffect(() => {
    if (!isAutoPlaying || featuredTestimonials.length <= 1) return;
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, nextSlide, featuredTestimonials.length]);

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={18}
            aria-hidden="true"
            className={i < rating ? "fill-primary text-primary" : "text-muted-foreground/40"}
          />
        ))}
      </div>
    );
  };

  if (error) {
    return (
      <section className="testimonials-section py-20 sm:py-28 px-4 bg-gradient-to-b from-background to-card/40">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">
            {currentContent.title}
          </h2>
          <p className="text-destructive">{currentContent.error}</p>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="testimonials-section py-20 sm:py-28 px-4 bg-gradient-to-b from-background to-card/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">
              {currentContent.title}
            </h2>
            <p className="text-muted-foreground text-lg">{currentContent.subtitle}</p>
          </div>
          <PublicContentSkeleton label={language === "fr" ? "Chargement des témoignages" : language === "en" ? "Loading testimonials" : language === "de" ? "Bewertungen werden geladen" : "正在加载评价"} />
        </div>
      </section>
    );
  }

  if (featuredTestimonials.length === 0) {
    return (
      <section className="testimonials-section py-20 sm:py-28 px-4 bg-gradient-to-b from-background to-card/40">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">
            {currentContent.title}
          </h2>
          <div className="mx-auto mt-6 flex max-w-md flex-col items-center rounded-3xl border border-primary/15 bg-card/60 px-6 py-8 shadow-[0_18px_46px_-34px_hsl(var(--primary)/0.65)]">
            <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary" aria-hidden="true"><Quote className="h-7 w-7" /></span>
            <h3 className="font-display text-xl font-semibold text-foreground">{getTestimonialEmptyHeading(language)}</h3>
            <p className="mt-2 text-muted-foreground">{currentContent.empty}</p>
          </div>
        </div>
      </section>
    );
  }

  // Show up to 3 visible cards at a time
  const visibleCount = Math.min(3, featuredTestimonials.length);
  const getVisibleTestimonials = () => {
    const result = [];
    for (let i = 0; i < visibleCount; i++) {
      const idx = (currentIndex + i) % featuredTestimonials.length;
      result.push(featuredTestimonials[idx]);
    }
    return result;
  };

  return (
          <section className="testimonials-section py-20 sm:py-28 px-4 bg-gradient-to-b from-background to-card/40">
        <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="section-heading text-center mb-12 mx-auto">
          <span className="eyebrow-label mb-5">Partner perspective</span>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">
            {currentContent.title}
          </h2>
          <p className="text-muted-foreground text-lg">{currentContent.subtitle}</p>
        </div>

        {/* Carousel */}
        <div
          className="relative"
          onMouseEnter={() => setIsAutoPlaying(false)}
          onMouseLeave={() => setIsAutoPlaying(true)}
          onFocus={() => setIsAutoPlaying(false)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsAutoPlaying(true);
          }}
          onKeyDown={(event) => {
            if (featuredTestimonials.length <= 1) return;
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            setIsAutoPlaying(false);
            setCurrentIndex(getTestimonialsCarouselIndex({
              key: event.key as "ArrowLeft" | "ArrowRight" | "Home" | "End",
              currentIndex,
              length: featuredTestimonials.length,
            }));
          }}
          tabIndex={0}
          role="region"
          aria-roledescription="carousel"
          aria-label={currentContent.title}
          aria-describedby="testimonials-keyboard-help"
        >
          <p id="testimonials-keyboard-help" className="sr-only">{currentContent.keyboardHelp}</p>
          {/* Navigation Arrows */}
          {featuredTestimonials.length > 3 && (
            <>
              <button
                onClick={prevSlide}
                className="carousel-control absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-foreground hover:border-primary/50 transition-all"
                aria-label={currentContent.previous}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={nextSlide}
                className="carousel-control absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-foreground hover:border-primary/50 transition-all"
                aria-label={currentContent.next}
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          {/* Cards Grid */}
          <div className="grid md:grid-cols-3 gap-6">
            {getVisibleTestimonials().map((testimonial, idx) => (
              <div
                key={`${testimonial.id}-${idx}`}
                className="testimonial-card card-glow bg-card/80 border border-border/50 rounded-2xl p-6 hover:border-primary/50 transition-all duration-300"
              >
                {/* Rating */}
                <div className="mb-4">{renderStars(testimonial.rating)}</div>

                {/* Title */}
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                  {testimonial.title}
                </h3>

                {/* Content */}
                <p className="text-muted-foreground text-sm mb-4 line-clamp-4 leading-relaxed">
                  {testimonial.content}
                </p>

                {/* Author Info */}
                <div className="flex items-center justify-between pt-4 border-t border-border/50">
                  <div>
                    <p className="text-foreground font-medium">{testimonial.authorName}</p>
                    {testimonial.specialty && (
                      <p className="text-muted-foreground text-xs">{testimonial.specialty}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Dots Indicator */}
          {featuredTestimonials.length > 3 && (
            <div className="flex justify-center gap-2 mt-8">
              {featuredTestimonials.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentIndex
                      ? "bg-primary w-6"
                      : "bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  }`}
                  aria-label={`${currentContent.goTo} ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* View All Button */}
        <div className="text-center mt-10">
          <a
            href="/testimonials"
            className="cta-secondary"
          >
            {currentContent.viewAll}
          </a>
        </div>
      </div>
    </section>
  );
}

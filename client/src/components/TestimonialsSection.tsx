import { useLanguage } from "@/contexts/LanguageContext";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useCallback } from "react";

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
      verified: "✓ Vérifié",
    },
    en: {
      title: "Partner Testimonials",
      subtitle: "What our partners say",
      viewAll: "View all testimonials",
      verified: "✓ Verified",
    },
    de: {
      title: "Partnerbewertungen",
      subtitle: "Was unsere Partner sagen",
      viewAll: "Alle Bewertungen anzeigen",
      verified: "✓ Verifiziert",
    },
    zh: {
      title: "合作伙伴评价",
      subtitle: "我们的合作伙伴怎么说",
      viewAll: "查看所有评价",
      verified: "✓ 已验证",
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
            className={i < rating ? "fill-cyan-400 text-cyan-400" : "text-gray-600"}
          />
        ))}
      </div>
    );
  };

  if (error) {
    return (
      <section className="py-16 px-4 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            {currentContent.title}
          </h2>
          <p className="text-red-400">Erreur lors du chargement des témoignages</p>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="py-16 px-4 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              {currentContent.title}
            </h2>
            <p className="text-gray-400 text-lg">{currentContent.subtitle}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-800 rounded-lg p-6 h-64 animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (featuredTestimonials.length === 0) {
    return (
      <section className="py-16 px-4 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            {currentContent.title}
          </h2>
          <p className="text-gray-400">Aucun témoignage disponible pour le moment</p>
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
    <section className="py-16 px-4 bg-gradient-to-b from-slate-900 to-slate-950">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            {currentContent.title}
          </h2>
          <p className="text-gray-400 text-lg">{currentContent.subtitle}</p>
        </div>

        {/* Carousel */}
        <div
          className="relative"
          onMouseEnter={() => setIsAutoPlaying(false)}
          onMouseLeave={() => setIsAutoPlaying(true)}
        >
          {/* Navigation Arrows */}
          {featuredTestimonials.length > 3 && (
            <>
              <button
                onClick={prevSlide}
                className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-white hover:bg-slate-700 hover:border-cyan-400/50 transition-all"
                aria-label="Previous testimonial"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={nextSlide}
                className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-white hover:bg-slate-700 hover:border-cyan-400/50 transition-all"
                aria-label="Next testimonial"
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
                className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-cyan-400/50 transition-all duration-300"
              >
                {/* Rating */}
                <div className="mb-4">{renderStars(testimonial.rating)}</div>

                {/* Title */}
                <h3 className="text-lg font-semibold text-white mb-2">
                  {testimonial.title}
                </h3>

                {/* Content */}
                <p className="text-gray-300 text-sm mb-4 line-clamp-4">
                  {testimonial.content}
                </p>

                {/* Author Info */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                  <div>
                    <p className="text-white font-medium">{testimonial.authorName}</p>
                    {testimonial.specialty && (
                      <p className="text-gray-400 text-xs">{testimonial.specialty}</p>
                    )}
                  </div>
                  {testimonial.verified === 1 && (
                    <span className="text-cyan-400 text-xs font-semibold">
                      {currentContent.verified}
                    </span>
                  )}
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
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    idx === currentIndex
                      ? "bg-cyan-400 w-6"
                      : "bg-slate-600 hover:bg-slate-500"
                  }`}
                  aria-label={`Go to testimonial ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* View All Button */}
        <div className="text-center mt-10">
          <a
            href="/testimonials"
            className="inline-block px-8 py-3 bg-gradient-to-r from-cyan-400 to-cyan-500 text-slate-900 font-semibold rounded-lg hover:shadow-lg hover:shadow-cyan-400/50 transition-all"
          >
            {currentContent.viewAll}
          </a>
        </div>
      </div>
    </section>
  );
}

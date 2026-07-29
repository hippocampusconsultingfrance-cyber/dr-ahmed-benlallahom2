import { useLanguage } from "@/contexts/LanguageContext";
import { Star } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function TestimonialsSection() {
  const { language } = useLanguage();
  const { data: testimonials = [], isLoading: loading } = trpc.testimonials.list.useQuery(
    {
      language,
      featured: 1,
    },
    {
      staleTime: 1000 * 60 * 60, // Cache for 1 hour
    }
  );

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

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={16}
            className={i < rating ? "fill-cyan-400 text-cyan-400" : "text-gray-600"}
          />
        ))}
      </div>
    );
  };

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

  if (testimonials.length === 0) {
    return null; // Don't show section if no testimonials
  }

  // Filter to show only featured testimonials
  const featuredTestimonials = testimonials.filter((t) => t.featured === 1);
  if (featuredTestimonials.length === 0) {
    return null;
  }

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

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {featuredTestimonials.slice(0, 3).map((testimonial) => (
            <div
              key={testimonial.id}
              className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-cyan-400/50 transition-colors"
            >
              {/* Rating */}
              <div className="mb-4">{renderStars(testimonial.rating)}</div>

              {/* Title */}
              <h3 className="text-lg font-semibold text-white mb-2">
                {testimonial.title}
              </h3>

              {/* Content */}
              <p className="text-gray-300 text-sm mb-4 line-clamp-3">
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

        {/* View All Button */}
        {featuredTestimonials.length > 3 && (
          <div className="text-center">
            <a
              href="/testimonials"
              className="inline-block px-8 py-3 bg-gradient-to-r from-cyan-400 to-cyan-500 text-slate-900 font-semibold rounded-lg hover:shadow-lg hover:shadow-cyan-400/50 transition-all"
            >
              {currentContent.viewAll}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

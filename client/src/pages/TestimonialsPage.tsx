import { useLanguage } from "@/contexts/LanguageContext";
import { Star } from "lucide-react";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { SEOHead } from "@/components/SEOHead";

export default function TestimonialsPage() {
  const { language } = useLanguage();
  const [filter, setFilter] = useState<string>("all");
  const { data: testimonials = [], isLoading: loading } = trpc.testimonials.list.useQuery(
    {
      language,
    },
    {
      staleTime: 1000 * 60 * 60, // Cache for 1 hour
    }
  );

  const content: Record<string, any> = {
    fr: {
      title: "Témoignages des Partenaires",
      subtitle: "Découvrez les expériences de nos partenaires",
      filterAll: "Tous les avis",
      filter5Stars: "5 étoiles",
      filter4Stars: "4 étoiles et plus",
      noTestimonials: "Aucun témoignage pour le moment",
      verified: "✓ Vérifié",
      specialty: "Spécialité",
    },
    en: {
      title: "Partner Testimonials",
      subtitle: "Discover the experiences of our partners",
      filterAll: "All reviews",
      filter5Stars: "5 stars",
      filter4Stars: "4 stars and up",
      noTestimonials: "No testimonials yet",
      verified: "✓ Verified",
      specialty: "Specialty",
    },
    de: {
      title: "Partnerbewertungen",
      subtitle: "Entdecken Sie die Erfahrungen unserer Partner",
      filterAll: "Alle Bewertungen",
      filter5Stars: "5 Sterne",
      filter4Stars: "4 Sterne und höher",
      noTestimonials: "Noch keine Bewertungen",
      verified: "✓ Verifiziert",
      specialty: "Fachgebiet",
    },
    zh: {
      title: "合作伙伴评价",
      subtitle: "了解我们的合作伙伴的经历",
      filterAll: "所有评价",
      filter5Stars: "5星",
      filter4Stars: "4星及以上",
      noTestimonials: "暂无评价",
      verified: "✓ 已验证",
      specialty: "专科",
    },
  };

  const currentContent = content[language] || content.en;

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={20}
            className={i < rating ? "fill-cyan-400 text-cyan-400" : "text-gray-600"}
          />
        ))}
      </div>
    );
  };

  const filteredTestimonials = testimonials.filter((t) => {
    if (filter === "5stars") return t.rating === 5;
    if (filter === "4stars") return t.rating >= 4;
    return true;
  });

  // Generate Review schema for SEO
  const reviewSchema = useMemo(() => {
    if (testimonials.length === 0) return null;

    const reviews = testimonials.slice(0, 10).map((testimonial) => ({
      "@type": "Review",
      "@context": "https://schema.org",
      author: {
        "@type": "Person",
        name: testimonial.authorName,
      },
      reviewRating: {
        "@type": "Rating",
        ratingValue: testimonial.rating,
        bestRating: "5",
        worstRating: "1",
      },
      reviewBody: testimonial.content,
      name: testimonial.title,
      datePublished: new Date(testimonial.createdAt).toISOString().split("T")[0],
    }));

    return {
      "@context": "https://schema.org",
      "@type": "AggregateOffer",
      name: currentContent.title,
      description: currentContent.subtitle,
      reviews: reviews,
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: (
          testimonials.reduce((sum, t) => sum + t.rating, 0) / testimonials.length
        ).toFixed(1),
        reviewCount: testimonials.length,
      },
    };
  }, [testimonials, currentContent]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 pt-24 pb-16">
      <SEOHead
        title={currentContent.title}
        description={currentContent.subtitle}
        ogUrl="https://drahmedbenlallahom.com/testimonials"
        structuredData={reviewSchema || undefined}
      />
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {currentContent.title}
          </h1>
          <p className="text-gray-400 text-lg">{currentContent.subtitle}</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 justify-center mb-12">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === "all"
                ? "bg-cyan-400 text-slate-900"
                : "bg-slate-800 text-gray-300 hover:bg-slate-700"
            }`}
          >
            {currentContent.filterAll}
          </button>
          <button
            onClick={() => setFilter("5stars")}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === "5stars"
                ? "bg-cyan-400 text-slate-900"
                : "bg-slate-800 text-gray-300 hover:bg-slate-700"
            }`}
          >
            {currentContent.filter5Stars}
          </button>
          <button
            onClick={() => setFilter("4stars")}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === "4stars"
                ? "bg-cyan-400 text-slate-900"
                : "bg-slate-800 text-gray-300 hover:bg-slate-700"
            }`}
          >
            {currentContent.filter4Stars}
          </button>
        </div>

        {/* Testimonials */}
        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-800 rounded-lg p-6 h-48 animate-pulse" />
            ))}
          </div>
        ) : filteredTestimonials.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">{currentContent.noTestimonials}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredTestimonials.map((testimonial) => (
              <div
                key={testimonial.id}
                className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-cyan-400/50 transition-colors"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="mb-2">{renderStars(testimonial.rating)}</div>
                    <h3 className="text-xl font-semibold text-white">
                      {testimonial.title}
                    </h3>
                  </div>
                  {testimonial.verified === 1 && (
                    <span className="text-cyan-400 text-sm font-semibold">
                      {currentContent.verified}
                    </span>
                  )}
                </div>

                {/* Content */}
                <p className="text-gray-300 mb-4 leading-relaxed">
                  {testimonial.content}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                  <div>
                    <p className="text-white font-medium">{testimonial.authorName}</p>
                    {testimonial.specialty && (
                      <p className="text-gray-400 text-sm">
                        {currentContent.specialty}: {testimonial.specialty}
                      </p>
                    )}
                  </div>
                  <p className="text-gray-500 text-xs">
                    {new Date(testimonial.createdAt).toLocaleDateString(language)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";
import ValuesSection from "@/components/ValuesSection";
import ExperienceSection from "@/components/ExperienceSection";
import ServicesSection from "@/components/ServicesSection";
import EducationSection from "@/components/EducationSection";
import ContactSection from "@/components/ContactSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import { isPublicTestimonialsEnabled } from "@shared/publicFeatures";
import MedicalQuestionsTeaser from "@/components/MedicalQuestionsTeaser";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { SEOHead } from "@/components/SEOHead";
import { useLanguage } from "@/contexts/LanguageContext";
import { scrollToSectionTop } from "@/lib/scrollToSection";
import { STATIC_ROUTE_METADATA } from "@shared/routeMetadata";
import { useEffect } from "react";

/**
 * Title and description of the home page in the language shown (EN-10): in French, those of the
 * prerendered page (shared/routeMetadata.ts), which SEOHead keeps; in the other languages, their
 * translation, applied when the visitor switches language without reloading.
 */
export const homeSeo = {
  fr: STATIC_ROUTE_METADATA["/"],
  en: {
    title: "Dr. Ahmed Ben Lallahom | Medicine and Consulting",
    description:
      "Anesthesiologist-intensivist, healthcare entrepreneur and medical consultant based in France.",
  },
  de: {
    title: "Dr. Ahmed Ben Lallahom | Medizin und Beratung",
    description:
      "Anästhesist und Intensivmediziner, Unternehmer im Gesundheitswesen und medizinischer Berater mit Sitz in Frankreich.",
  },
  zh: {
    title: "Dr. Ahmed Ben Lallahom | 医学与咨询",
    description: "常驻法国的麻醉学家和重症医学专家、医疗保健企业家及医学顾问。",
  },
} as const;

export default function Home() {
  const revealRef = useScrollReveal();
  const { language } = useLanguage();
  const seo = homeSeo[language] ?? homeSeo.fr;

  useEffect(() => {
    const scrollToHashTarget = () => {
      const targetId = decodeURIComponent(window.location.hash.slice(1));
      if (!targetId) return;
      scrollToSectionTop(document.getElementById(targetId), "auto");
    };

    const initialScrollTimers = [0, 180, 500].map(delay =>
      window.setTimeout(scrollToHashTarget, delay)
    );
    window.addEventListener("hashchange", scrollToHashTarget);
    return () => {
      initialScrollTimers.forEach(timer => window.clearTimeout(timer));
      window.removeEventListener("hashchange", scrollToHashTarget);
    };
  }, []);

  return (
    <div ref={revealRef} className="min-h-screen bg-background">
      <SEOHead
        title={seo.title}
        description={seo.description}
        ogUrl="https://drahmedbenlallahom.com"
      />
      <Navigation />
      <main>
        <HeroSection />
        <div className="fade-in-up">
          <AboutSection />
        </div>
        <div className="fade-in-up">
          <ValuesSection />
        </div>
        <div className="fade-in-up">
          <ExperienceSection />
        </div>
        <div className="fade-in-up parallax-subtle">
          <ServicesSection />
        </div>
        <div className="fade-in-up">
          <EducationSection />
        </div>
        {/* Témoignages masqués par défaut (LEGAL-08) : interrupteur unique dans shared/publicFeatures.ts. */}
        {isPublicTestimonialsEnabled() && (
          <div className="fade-in-up parallax-subtle">
            <TestimonialsSection />
          </div>
        )}
        <div className="fade-in-up">
          <MedicalQuestionsTeaser />
        </div>
        <div className="fade-in-up">
          <ContactSection />
        </div>
      </main>
      <Footer />
    </div>
  );
}

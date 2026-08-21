import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";
import ValuesSection from "@/components/ValuesSection";
import ExperienceSection from "@/components/ExperienceSection";
import ServicesSection from "@/components/ServicesSection";
import EducationSection from "@/components/EducationSection";
import ContactSection from "@/components/ContactSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import MedicalQuestionsTeaser from "@/components/MedicalQuestionsTeaser";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { SEOHead } from "@/components/SEOHead";
import { useEffect } from "react";

export default function Home() {
  const revealRef = useScrollReveal();

  useEffect(() => {
    const scrollToHashTarget = () => {
      const targetId = decodeURIComponent(window.location.hash.slice(1));
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: "auto" });
    };

    const initialScrollTimers = [0, 180, 500].map(delay => window.setTimeout(scrollToHashTarget, delay));
    window.addEventListener("hashchange", scrollToHashTarget);
    return () => {
      initialScrollTimers.forEach(timer => window.clearTimeout(timer));
      window.removeEventListener("hashchange", scrollToHashTarget);
    };
  }, []);

  return (
    <div ref={revealRef} className="min-h-screen bg-background">
      <SEOHead
        title="Dr. Ahmed Ben Lallahom | Anesthésie et Santé"
        description="Anesthésiste-réanimateur et entrepreneur en santé basé en France. Excellence clinique et vision stratégique pour l'innovation en santé."
        keywords="anesthésiste, réanimateur, entrepreneur santé, consultant médical, France, excellence clinique, formation, services"
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
        <div className="fade-in-up parallax-subtle">
          <TestimonialsSection />
        </div>
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

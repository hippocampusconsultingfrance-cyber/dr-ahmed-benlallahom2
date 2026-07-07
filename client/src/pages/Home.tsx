import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";
import ValuesSection from "@/components/ValuesSection";
import ExperienceSection from "@/components/ExperienceSection";
import ServicesSection from "@/components/ServicesSection";
import EducationSection from "@/components/EducationSection";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/useScrollReveal";

export default function Home() {
  const revealRef = useScrollReveal();

  return (
    <div ref={revealRef} className="min-h-screen bg-background">
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
        <div className="fade-in-up">
          <ServicesSection />
        </div>
        <div className="fade-in-up">
          <EducationSection />
        </div>
        <div className="fade-in-up">
          <ContactSection />
        </div>
      </main>
      <Footer />
    </div>
  );
}

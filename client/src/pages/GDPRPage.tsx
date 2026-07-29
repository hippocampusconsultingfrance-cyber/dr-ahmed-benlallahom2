import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import GDPRRequestForm from "@/components/GDPRRequestForm";
import Breadcrumb from "@/components/Breadcrumb";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

export default function GDPRPage() {
  const [, setLocation] = useLocation();
  const { language } = useLanguage();

  const label = language === "fr" ? "Protection des données (RGPD)" : language === "de" ? "Datenschutz (DSGVO)" : language === "zh" ? "数据保护 (GDPR)" : "Data Protection (GDPR)";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 pt-24">
          <Breadcrumb items={[{ label }]} />
        </div>
        <GDPRRequestForm onBack={() => setLocation("/")} />
      </main>
      <Footer />
    </div>
  );
}

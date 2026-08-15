import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import GDPRRequestForm from "@/components/GDPRRequestForm";
import Breadcrumb from "@/components/Breadcrumb";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { SEOHead } from "@/components/SEOHead";

export default function GDPRPage() {
  const [, setLocation] = useLocation();
  const { language } = useLanguage();

  const label = language === "fr" ? "Protection des données (RGPD)" : language === "de" ? "Datenschutz (DSGVO)" : language === "zh" ? "数据保护 (GDPR)" : "Data Protection (GDPR)";
  const description = language === "fr"
    ? "Exercez vos droits RGPD et adressez une demande concernant vos données personnelles traitées par Hippocampus Consulting."
    : language === "de"
      ? "Üben Sie Ihre DSGVO-Rechte aus und richten Sie eine Anfrage zu Ihren personenbezogenen Daten an Hippocampus Consulting."
      : language === "zh"
        ? "行使您的 GDPR 权利，并向 Hippocampus Consulting 提交有关个人数据的请求。"
        : "Exercise your GDPR rights and submit a request about personal data processed by Hippocampus Consulting.";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title={`${label} | Dr. Ahmed Ben Lallahom`} description={description} ogUrl="https://drahmedbenlallahom.com/gdpr" />
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

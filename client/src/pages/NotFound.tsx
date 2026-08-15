import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { SEOHead } from "@/components/SEOHead";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { language } = useLanguage();

  const content: Record<string, { title: string; subtitle: string; description: string; goHome: string; goBack: string }> = {
    fr: {
      title: "404",
      subtitle: "Page introuvable",
      description: "La page que vous recherchez n'existe pas ou a été déplacée.",
      goHome: "Retour à l'accueil",
      goBack: "Page précédente",
    },
    en: {
      title: "404",
      subtitle: "Page Not Found",
      description: "The page you are looking for doesn't exist or has been moved.",
      goHome: "Go Home",
      goBack: "Go Back",
    },
    de: {
      title: "404",
      subtitle: "Seite nicht gefunden",
      description: "Die gesuchte Seite existiert nicht oder wurde verschoben.",
      goHome: "Zur Startseite",
      goBack: "Zurück",
    },
    zh: {
      title: "404",
      subtitle: "页面未找到",
      description: "您查找的页面不存在或已被移动。",
      goHome: "返回首页",
      goBack: "返回上页",
    },
  };

  const c = content[language] || content.en;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <SEOHead title={`${c.subtitle} | Dr. Ahmed Ben Lallahom`} description={c.description} ogUrl="https://drahmedbenlallahom.com/404" />
      {/* Background pattern */}
      <div className="absolute inset-0 diagnostic-grid opacity-30" />
      
      <div className="relative text-center max-w-lg">
        {/* Large 404 number */}
        <div className="relative mb-6">
          <h1 className="stat-monumental text-[8rem] sm:text-[12rem] leading-none select-none opacity-20">
            {c.title}
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="ecg-divider w-48" />
          </div>
        </div>

        {/* Subtitle */}
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4 font-display">
          {c.subtitle}
        </h2>

        {/* Description */}
        <p className="text-muted-foreground mb-8 text-lg leading-relaxed">
          {c.description}
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => setLocation("/")}
            className="gap-2"
            size="lg"
          >
            <Home className="w-4 h-4" />
            {c.goHome}
          </Button>
          <Button
            onClick={() => window.history.back()}
            variant="outline"
            className="gap-2"
            size="lg"
          >
            <ArrowLeft className="w-4 h-4" />
            {c.goBack}
          </Button>
        </div>
      </div>
    </div>
  );
}

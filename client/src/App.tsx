import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import WhatsAppButton from "./components/WhatsAppButton";
import CookieConsent from "./components/CookieConsent";

const Home = lazy(() => import("./pages/Home"));
const VenturePage = lazy(() => import("./pages/VenturePage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const GDPRPage = lazy(() => import("./pages/GDPRPage"));
const TestimonialsPage = lazy(() => import("./pages/TestimonialsPage"));
const BookingPage = lazy(() => import("./pages/BookingPage"));
const BookingConfirmationPage = lazy(() => import("./pages/BookingConfirmationPage"));
const RecruitmentPage = lazy(() => import("./pages/RecruitmentPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));

function Router() {
  return (
    <Suspense
      fallback={
        <div className="app-loading-shell" role="status" aria-live="polite">
          <div className="app-loading-mark" aria-hidden="true">
            <span />
          </div>
          <div className="app-loading-copy">
            <span className="app-loading-kicker">ABL / HIPPOCAMPUS</span>
            <span className="app-loading-title">Chargement de votre espace</span>
            <span className="app-loading-caption">Préparation de l’expérience médicale sécurisée…</span>
          </div>
        </div>
      }
    >
      <Switch>
      <Route path="/" component={Home} />
      <Route path="/venture/:slug" component={VenturePage} />
      <Route path="/legal" component={LegalPage} />
      <Route path="/gdpr" component={GDPRPage} />
      <Route path="/testimonials" component={TestimonialsPage} />
      <Route path="/booking/confirmation" component={BookingConfirmationPage} />
      <Route path="/booking" component={BookingPage} />
      <Route path="/recruitment" component={RecruitmentPage} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
            <WhatsAppButton />
            <CookieConsent />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

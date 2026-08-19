import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import WhatsAppButton from "./components/WhatsAppButton";
import CookieConsent from "./components/CookieConsent";
import AnalyticsConsent from "./components/AnalyticsConsent";
import ConnectionMotionPreference from "./components/ConnectionMotionPreference";
import { SEOHead } from "./components/SEOHead";
import SkipToContent from "./components/SkipToContent";

const Home = lazy(() => import("./pages/Home"));
const VenturePage = lazy(() => import("./pages/VenturePage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const GDPRPage = lazy(() => import("./pages/GDPRPage"));
const TestimonialsPage = lazy(() => import("./pages/TestimonialsPage"));
const BookingPage = lazy(() => import("./pages/BookingPage"));
const BookingConfirmationPage = lazy(() => import("./pages/BookingConfirmationPage"));
const RecruitmentHubPage = lazy(() => import("./pages/RecruitmentHubPage"));
const RecruitmentPage = lazy(() => import("./pages/RecruitmentPage"));
const VvipOffshorePage = lazy(() => import("./pages/VvipOffshorePage"));
const EmployersPage = lazy(() => import("./pages/EmployersPage"));
const WhyHippocampusPage = lazy(() => import("./pages/WhyHippocampusPage"));
const CandidateAccessPage = lazy(() => import("./pages/CandidateAccessPage"));
const CandidateVerifyPage = lazy(() => import("./pages/CandidateVerifyPage"));
const CandidateResetPasswordPage = lazy(() => import("./pages/CandidateResetPasswordPage"));
const CandidatePortalPage = lazy(() => import("./pages/CandidatePortalPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const ServiceStatusPage = lazy(() => import("./pages/ServiceStatusPage"));

function CandidatePortalPrivateRoute() {
  return (
    <>
      <SEOHead
        title="Coffre documentaire candidat | Hippocampus Consulting"
        description="Consultez et déposez vos documents administratifs de manière sécurisée."
        noIndex
      />
      <CandidatePortalPage />
    </>
  );
}

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
      <Route path="/recruitment" component={RecruitmentHubPage} />
      <Route path="/recruitment/standard" component={RecruitmentPage} />
      <Route path="/recruitment/vvip-offshore" component={VvipOffshorePage} />
      <Route path="/vvip-offshore" component={VvipOffshorePage} />
      <Route path="/candidate/access" component={CandidateAccessPage} />
      <Route path="/candidate/verify" component={CandidateVerifyPage} />
      <Route path="/candidate/reset-password" component={CandidateResetPasswordPage} />
      <Route path="/candidate/portal" component={CandidatePortalPrivateRoute} />
      <Route path="/employers" component={EmployersPage} />
      <Route path="/why-hippocampus" component={WhyHippocampusPage} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/error" component={() => <ServiceStatusPage kind="error" />} />
      <Route path="/maintenance" component={() => <ServiceStatusPage kind="maintenance" />} />
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
            <SkipToContent />
            <Toaster />
            <Router />
            <WhatsAppButton />
            <CookieConsent />
            <AnalyticsConsent />
            <ConnectionMotionPreference />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

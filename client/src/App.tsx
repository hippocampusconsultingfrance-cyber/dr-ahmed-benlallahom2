import { Toaster } from "@/components/ui/sonner";
import { lazy, Suspense } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { useLanguage } from "./contexts/LanguageContext";
import WhatsAppButton from "./components/WhatsAppButton";
import CookieConsent from "./components/CookieConsent";
import AnalyticsConsent from "./components/AnalyticsConsent";
import ConnectionMotionPreference from "./components/ConnectionMotionPreference";
import { SEOHead } from "./components/SEOHead";
import SkipToContent from "./components/SkipToContent";
import PageTransition from "./components/PageTransition";
import { isPrivateAreaPath } from "./lib/privateAreaRoutes";

export const routeLoadingCopy = {
  fr: { title: "Chargement de votre espace", caption: "Préparation de l’expérience médicale sécurisée…" },
  en: { title: "Loading your space", caption: "Preparing your secure medical experience…" },
  de: { title: "Ihr Bereich wird geladen", caption: "Ihre sichere medizinische Erfahrung wird vorbereitet…" },
  zh: { title: "正在加载您的空间", caption: "正在准备您的安全医疗体验…" },
} as const;

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
const RecruitmentUnsubscribePage = lazy(() => import("./pages/RecruitmentUnsubscribePage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const ServiceStatusPage = lazy(() => import("./pages/ServiceStatusPage"));
const FAQPage = lazy(() => import("./pages/FAQPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const ResourcesPage = lazy(() => import("./pages/ResourcesPage"));
const PressPage = lazy(() => import("./pages/PressPage"));
const MedicalQuestionsPage = lazy(() => import("./pages/MedicalQuestionsPage"));

function RouteLoading() {
  const { language } = useLanguage();
  const copy = routeLoadingCopy[(language in routeLoadingCopy ? language : "fr") as keyof typeof routeLoadingCopy];
  return <div className="app-loading-shell" role="status" aria-live="polite"><div className="app-loading-mark" aria-hidden="true"><span /></div><div className="app-loading-copy"><span className="app-loading-kicker">ABL / HIPPOCAMPUS</span><span className="app-loading-title">{copy.title}</span><span className="app-loading-caption">{copy.caption}</span></div></div>;
}

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
    <Suspense fallback={<RouteLoading />}>
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
      <Route path="/recruitment/unsubscribe" component={RecruitmentUnsubscribePage} />
      <Route path="/candidate/access" component={CandidateAccessPage} />
      <Route path="/candidate/verify" component={CandidateVerifyPage} />
      <Route path="/candidate/reset-password" component={CandidateResetPasswordPage} />
      <Route path="/candidate/portal" component={CandidatePortalPrivateRoute} />
      <Route path="/employers" component={EmployersPage} />
      <Route path="/why-hippocampus" component={WhyHippocampusPage} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/error" component={() => <ServiceStatusPage kind="error" />} />
      <Route path="/maintenance" component={() => <ServiceStatusPage kind="maintenance" />} />
      <Route path="/faq" component={FAQPage} />
      <Route path="/search" component={SearchPage} />
      <Route path="/resources" component={ResourcesPage} />
      <Route path="/press" component={PressPage} />
      <Route path="/questions-anesthesie" component={MedicalQuestionsPage} />
      <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

/** WhatsApp and the cookie-preferences pill stay out of the candidate space and the admin (CAND-21). */
function FloatingWidgets() {
  const [location] = useLocation();
  const privateArea = isPrivateAreaPath(location);
  return <>{!privateArea && <WhatsAppButton />}<CookieConsent showPreferencesShortcut={!privateArea} /></>;
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" switchable>
      <LanguageProvider>
        <ErrorBoundary>
          <SkipToContent />
          <Toaster />
          <PageTransition><Router /></PageTransition>
          <FloatingWidgets />
          <AnalyticsConsent />
          <ConnectionMotionPreference />
        </ErrorBoundary>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;

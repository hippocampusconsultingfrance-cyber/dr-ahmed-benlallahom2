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
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));

function Router() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center" role="status" aria-live="polite">
          <span className="text-sm text-muted-foreground">Chargement…</span>
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

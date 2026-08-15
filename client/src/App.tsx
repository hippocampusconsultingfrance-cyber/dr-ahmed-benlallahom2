import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import Home from "./pages/Home";
import VenturePage from "./pages/VenturePage";
import LegalPage from "./pages/LegalPage";
import GDPRPage from "./pages/GDPRPage";
import TestimonialsPage from "./pages/TestimonialsPage";
import BookingPage from "@/pages/BookingPage";
import BookingConfirmationPage from "@/pages/BookingConfirmationPage";
import AdminDashboard from "./pages/AdminDashboard";
import BlogPage from "./pages/BlogPage";
import BlogPostPage from "./pages/BlogPostPage";
import WhatsAppButton from "./components/WhatsAppButton";
import CookieConsent from "./components/CookieConsent";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/venture/:slug" component={VenturePage} />
      <Route path="/legal" component={LegalPage} />
      <Route path="/gdpr" component={GDPRPage} />
      <Route path="/testimonials" component={TestimonialsPage} />
      <Route path="/booking/confirmation" component={BookingConfirmationPage} />
      <Route path="/booking" component={BookingPage} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/blog" component={BlogPage} />
      <Route path="/blog/:slug" component={BlogPostPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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

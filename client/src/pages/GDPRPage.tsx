import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import GDPRRequestForm from "@/components/GDPRRequestForm";
import { useLocation } from "wouter";

export default function GDPRPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <main className="flex-1">
        <GDPRRequestForm onBack={() => setLocation("/")} />
      </main>
      <Footer />
    </div>
  );
}

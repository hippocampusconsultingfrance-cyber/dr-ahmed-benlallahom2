import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { useLanguage } from "@/contexts/LanguageContext";
import { AlertTriangle, Home, RefreshCw, Wrench } from "lucide-react";
import { useLocation } from "wouter";
import { getServiceStatusContent, type ServiceStatusKind, type ServiceStatusLocale } from "./serviceStatusContent";

export default function ServiceStatusPage({ kind }: { kind: ServiceStatusKind }) {
  const { language } = useLanguage();
  const [, setLocation] = useLocation();
  const copy = getServiceStatusContent(kind, language as ServiceStatusLocale);
  const Icon = kind === "maintenance" ? Wrench : AlertTriangle;
  const code = kind === "maintenance" ? "MAINTENANCE" : "500";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12 text-center">
      <SEOHead title={`${copy.title} | Dr. Ahmed Ben Lallahom`} description={copy.description} noIndex />
      <div className="diagnostic-grid absolute inset-0 opacity-30" aria-hidden="true" />
      <section className="relative w-full max-w-xl rounded-3xl border border-primary/25 bg-card/95 p-7 shadow-2xl backdrop-blur sm:p-10" role={kind === "error" ? "alert" : "status"} aria-live="polite">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-7 w-7" aria-hidden="true" /></span>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">ABL / HIPPOCAMPUS · {copy.eyebrow}</p>
        <p className="mt-4 text-5xl font-bold tracking-tight text-foreground sm:text-6xl">{code}</p>
        <h1 className="mt-4 font-display text-2xl font-semibold text-foreground sm:text-3xl">{copy.title}</h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">{copy.description}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button className="min-h-11" onClick={() => setLocation("/")}><Home className="mr-2 h-4 w-4" />{copy.home}</Button>
          <Button className="min-h-11" variant="outline" onClick={() => window.location.reload()}><RefreshCw className="mr-2 h-4 w-4" />{copy.retry}</Button>
        </div>
      </section>
    </main>
  );
}

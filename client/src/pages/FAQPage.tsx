import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import { SEOHead } from "@/components/SEOHead";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { AlertTriangle, ArrowRight, CircleHelp, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { getFaqContent, type FaqLocale } from "./faqContent";

export default function FAQPage() {
  const { language } = useLanguage();
  const [, setLocation] = useLocation();
  const content = getFaqContent(language as FaqLocale);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead title={`${content.title} | Dr. Ahmed Ben Lallahom`} description={content.description} ogUrl="https://drahmedbenlallahom.com/faq" />
      <Navigation />
      <main id="main-content" tabIndex={-1} className="relative overflow-hidden pb-20 pt-28 sm:pt-32">
        <div className="diagnostic-grid absolute inset-0 opacity-20" aria-hidden="true" />
        <div className="container relative max-w-4xl">
          <header className="rounded-3xl border border-primary/25 bg-card/80 px-6 py-10 shadow-2xl backdrop-blur sm:px-10 sm:py-12">
            <div className="flex items-center gap-3 text-primary"><CircleHelp className="h-6 w-6" /><p className="text-xs font-semibold uppercase tracking-[0.18em]">{content.eyebrow}</p></div>
            <h1 className="mt-5 max-w-2xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">{content.title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{content.description}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row"><Button className="min-h-11" onClick={() => setLocation("/booking")}>{content.booking}<ArrowRight className="ml-2 h-4 w-4" /></Button><Button className="min-h-11" variant="outline" onClick={() => setLocation("/recruitment")}>{content.recruitment}</Button></div>
          </header>

          <section className="mt-6 rounded-2xl border border-border bg-card/70 px-6 py-3 sm:px-8" aria-label={content.title}>
            <Accordion type="single" collapsible className="w-full">
              {content.entries.map((entry, index) => <AccordionItem key={entry.question} value={`faq-${index}`}><AccordionTrigger className="py-5 text-base text-foreground hover:no-underline">{entry.question}</AccordionTrigger><AccordionContent className="max-w-3xl text-base leading-relaxed text-muted-foreground">{entry.answer}</AccordionContent></AccordionItem>)}
            </Accordion>
          </section>

          <aside className="mt-6 flex gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm leading-relaxed text-muted-foreground"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" /><p>{content.note}</p></aside>
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /><span>{content.humanReview}</span></div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

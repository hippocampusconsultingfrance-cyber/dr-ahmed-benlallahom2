import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export const errorBoundaryCopy = {
  fr: { service: "ABL / HIPPOCAMPUS · Service sécurisé", title: "Une difficulté technique est survenue", description: "Vous pouvez actualiser cette page ou revenir à l’accueil.", retry: "Réessayer", home: "Retour à l’accueil" },
  en: { service: "ABL / HIPPOCAMPUS · Secure service", title: "A technical issue occurred", description: "You can refresh this page or return to the home page.", retry: "Try again", home: "Return to home" },
  de: { service: "ABL / HIPPOCAMPUS · Sicherer Dienst", title: "Ein technisches Problem ist aufgetreten", description: "Sie können diese Seite aktualisieren oder zur Startseite zurückkehren.", retry: "Erneut versuchen", home: "Zur Startseite" },
  zh: { service: "ABL / HIPPOCAMPUS · 安全服务", title: "发生技术问题", description: "您可以刷新此页面或返回首页。", retry: "重试", home: "返回首页" },
} as const;

class ErrorBoundaryCore extends Component<Props & { language: keyof typeof errorBoundaryCopy }, State> {
  constructor(props: Props & { language: keyof typeof errorBoundaryCopy }) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }
  render() {
    if (!this.state.hasError) return this.props.children;
    const copy = errorBoundaryCopy[this.props.language];
    return <main className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-8"><section className="flex w-full max-w-xl flex-col items-center rounded-3xl border border-primary/25 bg-card p-7 text-center shadow-2xl sm:p-10" role="alert"><AlertTriangle size={48} className="mb-6 shrink-0 text-destructive" /><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{copy.service}</p><h2 className="mb-3 mt-4 text-2xl font-semibold text-foreground">{copy.title}</h2><p className="mb-7 text-muted-foreground">{copy.description}</p><button onClick={() => window.location.reload()} className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"><RotateCcw size={16}/>{copy.retry}</button><button onClick={() => { window.location.href = "/"; }} className="mt-3 flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"><Home size={16}/>{copy.home}</button></section></main>;
  }
}

export default function ErrorBoundary({ children }: Props) {
  const { language } = useLanguage();
  return <ErrorBoundaryCore language={(language in errorBoundaryCopy ? language : "fr") as keyof typeof errorBoundaryCopy}>{children}</ErrorBoundaryCore>;
}

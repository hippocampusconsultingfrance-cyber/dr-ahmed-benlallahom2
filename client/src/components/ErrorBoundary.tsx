import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-8">
          <section className="flex w-full max-w-xl flex-col items-center rounded-3xl border border-primary/25 bg-card p-7 text-center shadow-2xl sm:p-10" role="alert">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">ABL / HIPPOCAMPUS · Service sécurisé</p>
            <h2 className="mb-3 mt-4 text-2xl font-semibold text-foreground">Une difficulté technique est survenue</h2>
            <p className="mb-7 text-muted-foreground">Nous avons été informés du problème. Vous pouvez actualiser cette page ou revenir à l’accueil.</p>

            <button
              onClick={() => window.location.reload()}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
            >
              <RotateCcw size={16} />
              Réessayer
            </button>
            <button onClick={() => { window.location.href = "/"; }} className="mt-3 flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"><Home size={16} />Retour à l’accueil</button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

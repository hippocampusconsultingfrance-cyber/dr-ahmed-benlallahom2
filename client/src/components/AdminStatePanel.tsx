import type { ComponentType } from "react";
import { AlertTriangle } from "lucide-react";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export function getAdminStatePanelClassName(kind: "empty" | "error") {
  return kind === "error"
    ? "border-destructive/35 bg-destructive/5"
    : "border-border bg-card/70";
}

export function getAdminEmptyIllustrationClassName() {
  return "relative isolate mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary before:absolute before:-inset-2 before:-z-10 before:rounded-[1.35rem] before:border before:border-dashed before:border-primary/20 after:absolute after:-inset-4 after:-z-10 after:rounded-[1.8rem] after:bg-primary/5";
}

export function AdminEmptyState({ icon: Icon, title, description }: { icon: IconComponent; title: string; description: string }) {
  return (
    <section className={`rounded-xl border p-6 text-center ${getAdminStatePanelClassName("empty")}`} aria-label={title}>
      <span className={getAdminEmptyIllustrationClassName()} aria-hidden={true}>
        <Icon className="h-7 w-7" aria-hidden={true} />
      </span>
      <h2 className="font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </section>
  );
}

export function AdminErrorState({ description }: { description: string }) {
  return (
    <section className={`rounded-xl border p-6 text-center ${getAdminStatePanelClassName("error")}`} role="alert">
      <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-destructive" aria-hidden={true} />
      <h2 className="font-semibold text-foreground">Impossible de charger ces données</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </section>
  );
}

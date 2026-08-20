import type { ComponentType } from "react";
import { AlertTriangle } from "lucide-react";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export function getAdminStatePanelClassName(kind: "empty" | "error") {
  return kind === "error"
    ? "border-destructive/35 bg-destructive/5"
    : "border-border bg-card/70";
}

export function AdminEmptyState({ icon: Icon, title, description }: { icon: IconComponent; title: string; description: string }) {
  return (
    <section className={`rounded-xl border p-6 text-center ${getAdminStatePanelClassName("empty")}`} aria-label={title}>
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden={true} />
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

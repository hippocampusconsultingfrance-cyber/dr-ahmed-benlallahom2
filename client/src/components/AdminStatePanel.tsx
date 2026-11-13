import type { ComponentType } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean;
}>;

export function getAdminStatePanelClassName(kind: "empty" | "error") {
  return kind === "error"
    ? "border-destructive/35 bg-destructive/5"
    : "border-border bg-card/70";
}

export function getAdminEmptyIllustrationClassName() {
  return "relative isolate mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary before:absolute before:-inset-2 before:-z-10 before:rounded-[1.35rem] before:border before:border-dashed before:border-primary/20 after:absolute after:-inset-4 after:-z-10 after:rounded-[1.8rem] after:bg-primary/5";
}

export function AdminEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: IconComponent;
  title: string;
  description: string;
}) {
  return (
    <section
      className={`rounded-xl border p-6 text-center ${getAdminStatePanelClassName("empty")}`}
      aria-label={title}
    >
      <span className={getAdminEmptyIllustrationClassName()} aria-hidden={true}>
        <Icon className="h-7 w-7" aria-hidden={true} />
      </span>
      <h2 className="font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-md wrap-anywhere text-sm text-muted-foreground">
        {description}
      </p>
    </section>
  );
}

/**
 * A list that could not be loaded, never shown as an empty one (ADM-10). With
 * `onRetry`, a « Réessayer » button reloads it, disabled while `retrying`.
 * `headingLevel` keeps the title below the heading of the section it sits in.
 */
export function AdminErrorState({
  description,
  title = "Impossible de charger ces données",
  onRetry,
  retrying = false,
  retryLabel = "Réessayer",
  headingLevel = 2,
}: {
  description: string;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <section
      className={`rounded-xl border p-6 text-center ${getAdminStatePanelClassName("error")}`}
      role="alert"
    >
      <AlertTriangle
        className="mx-auto mb-3 h-6 w-6 text-destructive"
        aria-hidden={true}
      />
      <Heading className="font-semibold text-foreground">{title}</Heading>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 min-h-10 sm:min-h-0"
          onClick={onRetry}
          disabled={retrying}
        >
          <RotateCcw className="mr-1 h-3 w-3" aria-hidden={true} />
          {retryLabel}
        </Button>
      )}
    </section>
  );
}

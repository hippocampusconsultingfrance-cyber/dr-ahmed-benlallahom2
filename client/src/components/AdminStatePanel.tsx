import React, { type ComponentType } from "react";
import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export const adminStateCopy = {
  fr: { loadErrorTitle: "Impossible de charger ces données" },
  en: { loadErrorTitle: "These data could not be loaded" },
  de: { loadErrorTitle: "Diese Daten konnten nicht geladen werden" },
  zh: { loadErrorTitle: "无法加载这些数据" },
} as const;

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
  const { language } = useLanguage();
  const copy = adminStateCopy[language as keyof typeof adminStateCopy] ?? adminStateCopy.fr;

  return (
    <section className={`rounded-xl border p-6 text-center ${getAdminStatePanelClassName("error")}`} role="alert">
      <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-destructive" aria-hidden={true} />
      <h2 className="font-semibold text-foreground">{copy.loadErrorTitle}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </section>
  );
}

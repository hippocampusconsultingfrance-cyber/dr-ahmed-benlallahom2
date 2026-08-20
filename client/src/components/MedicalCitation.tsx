import React from "react";
import { ExternalLink, Info } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type MedicalCitationCopy = {
  source: string;
  updated: string;
  notice: string;
};

export const medicalCitationCopy: Record<"fr" | "en" | "de" | "zh", MedicalCitationCopy> = {
  fr: {
    source: "Source",
    updated: "Mis à jour le",
    notice: "Information générale : ce contenu ne remplace pas un avis médical personnalisé ni une prise en charge d’urgence.",
  },
  en: {
    source: "Source",
    updated: "Updated",
    notice: "General information only: this content does not replace personalised medical advice or emergency care.",
  },
  de: {
    source: "Quelle",
    updated: "Aktualisiert am",
    notice: "Allgemeine Information: Dieser Inhalt ersetzt weder eine individuelle ärztliche Beratung noch eine Notfallversorgung.",
  },
  zh: {
    source: "来源",
    updated: "更新日期",
    notice: "仅供一般信息参考：本内容不能替代个体化医疗建议或紧急医疗救治。",
  },
};

const localeByLanguage = {
  fr: "fr-FR",
  en: "en-GB",
  de: "de-DE",
  zh: "zh-CN",
} as const;

export type MedicalCitationProps = {
  sourceName: string;
  sourceUrl: string;
  updatedAt: string;
  children: React.ReactNode;
  context?: string;
};

export default function MedicalCitation({ sourceName, sourceUrl, updatedAt, children, context }: MedicalCitationProps) {
  const { language } = useLanguage();
  const copy = medicalCitationCopy[language];
  const date = new Date(`${updatedAt}T00:00:00Z`);
  const formattedDate = Number.isNaN(date.getTime())
    ? updatedAt
    : new Intl.DateTimeFormat(localeByLanguage[language], { dateStyle: "long", timeZone: "UTC" }).format(date);

  return (
    <figure className="my-6 rounded-xl border border-primary/25 bg-primary/5 p-5" role="note" aria-label={copy.source}>
      <blockquote className="text-sm leading-7 text-foreground">{children}</blockquote>
      {context ? <p className="mt-3 text-xs leading-5 text-muted-foreground">{context}</p> : null}
      <figcaption className="mt-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline">
          <ExternalLink className="size-3" aria-hidden="true" />
          {copy.source}: {sourceName}
        </a>
        <time className="ml-2" dateTime={updatedAt}>{copy.updated} {formattedDate}</time>
        <span className="mt-3 flex items-start gap-2 leading-5">
          <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          {copy.notice}
        </span>
      </figcaption>
    </figure>
  );
}

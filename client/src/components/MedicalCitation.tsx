import { BookOpenCheck, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

export type MedicalCitationLevel = "information" | "recommendation" | "regulatory";

type MedicalCitationProps = {
  /** Organisme ou publication à l’origine de l’information. */
  source: string;
  /** Date de dernière vérification de la source, au format ISO YYYY-MM-DD. */
  updatedAt: string;
  /** Lien officiel de la source, s’il peut être publié. */
  href?: string;
  /** Précise la nature de l’information affichée sans en faire un avis clinique individuel. */
  level?: MedicalCitationLevel;
  locale?: string;
  children?: ReactNode;
};

const levelCopy: Record<MedicalCitationLevel, string> = {
  information: "Information générale",
  recommendation: "Recommandation citée",
  regulatory: "Référence institutionnelle",
};

const formatUpdatedAt = (updatedAt: string, locale: string) => {
  const parsed = new Date(`${updatedAt}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return updatedAt;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(parsed);
};

/**
 * Affiche la provenance et la date d’une information médicale générale.
 * Ne doit pas être employé pour présenter un diagnostic, une décision personnalisée ou une promesse thérapeutique.
 */
export default function MedicalCitation({ source, updatedAt, href, level = "information", locale = "fr-FR", children }: MedicalCitationProps) {
  const content = <><span className="font-semibold text-foreground">Source : {source}</span><span> · Vérifié le {formatUpdatedAt(updatedAt, locale)}</span></>;
  return <aside className="flex gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground" aria-label={`Citation médicale — ${source}`}>
    <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
    <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{levelCopy[level]}</p><p className="mt-1 break-words">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-baseline gap-1 underline decoration-primary/60 underline-offset-4 hover:text-foreground">{content}<ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></a> : content}</p>{children && <div className="mt-2">{children}</div>}</div>
  </aside>;
}

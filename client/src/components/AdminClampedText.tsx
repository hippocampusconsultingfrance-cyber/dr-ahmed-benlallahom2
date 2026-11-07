import { useId, useLayoutEffect, useRef, useState } from "react";
import type { UserLanguage } from "@/contexts/userPreferences";

/** French by default, like the Réservations and Témoignages tabs that show it. */
const clampedTextCopy = {
  fr: { more: "Voir tout", less: "Réduire" },
  en: { more: "See all", less: "Show less" },
  de: { more: "Alles anzeigen", less: "Weniger anzeigen" },
  zh: { more: "查看全部", less: "收起" },
} as const;

/**
 * A text typed by a patient or a visitor, shown on two lines in an admin list
 * (EXPL-02): a long word or link wraps instead of being cut at the card's
 * edge, and « Voir tout » shows the whole text, with its line breaks, once it
 * is longer than those two lines, then « Réduire » folds it again.
 */
export default function AdminClampedText({ text, className = "", language = "fr" }: { text: string; className?: string; language?: UserLanguage }) {
  const copy = clampedTextCopy[language] ?? clampedTextCopy.fr;
  const id = useId();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [cut, setCut] = useState(false);
  // Measured on the two-line text, again when the card's width changes (a phone turned, a window resized).
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;
    const measure = () => setCut(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className={className}>
      <p ref={textRef} id={id} className={`whitespace-pre-line wrap-anywhere ${expanded ? "" : "line-clamp-2"}`}>{text}</p>
      {(cut || expanded) && (
        <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(current => !current)} className="mt-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {expanded ? copy.less : copy.more}
        </button>
      )}
    </div>
  );
}

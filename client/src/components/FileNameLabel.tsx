import { useLayoutEffect, useRef } from "react";

/**
 * Extension of a file name, kept apart so that it stays visible when the name
 * is cut: up to 10 characters from its last dot, as the server keeps it when
 * it shortens a name (shortenFileName); "" for a name without one.
 */
export function fileNameExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 && name.length - dot <= 10 ? name.slice(dot) : "";
}

/**
 * The browser puts the ellipsis of a cut name right after the last whole
 * letter that fits, which leaves up to a letter of blank at the end of the box,
 * read as a space before the extension (EXPL-02). Narrows the box of the base
 * name to that letter and its ellipsis, so that the extension follows them.
 */
function fitToEllipsis(base: HTMLElement) {
  base.style.maxWidth = "";
  const text = base.firstChild;
  if (!(text instanceof Text) || base.scrollWidth <= base.clientWidth) return;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return;
  context.font = getComputedStyle(base).font;
  const ellipsis = context.measureText("…").width;
  // Widths of the beginnings of the name as laid out, ellipsis aside: the longest that leaves room for it.
  const range = document.createRange();
  range.setStart(text, 0);
  const widthTo = (end: number) => {
    range.setEnd(text, end);
    return range.getBoundingClientRect().width;
  };
  let fits = 0;
  for (let low = 1, high = text.length; low <= high;) {
    const middle = (low + high) >> 1;
    if (widthTo(middle) + ellipsis <= base.clientWidth) [fits, low] = [middle, middle + 1];
    else high = middle - 1;
  }
  if (fits) base.style.maxWidth = `${Math.ceil(widthTo(fits) + ellipsis)}px`;
}

/**
 * A file name chosen by a visitor (CV of the application forms, document of
 * the candidate's vault), on one line within its box whatever its length: a
 * name without a space no longer widens the page on a phone and pushes the
 * consents and the submit button off the screen. The base name is cut with an
 * ellipsis, the extension stays visible right after it, then `suffix` (the
 * size, say); the whole name is in the title. It fills the width of its box
 * and is never sized by the name (inline-size containment), whatever box or
 * grid holds it. Screen readers get the whole name in one piece, not the two
 * boxes the browser would read with a space between them.
 */
export default function FileNameLabel({ name, suffix = "", className = "" }: { name: string; suffix?: string; className?: string }) {
  const extension = fileNameExtension(name);
  const labelRef = useRef<HTMLSpanElement>(null);
  const baseRef = useRef<HTMLSpanElement>(null);
  const followed = Boolean(extension || suffix);
  // Again whenever the box changes width or the web font arrives; the label's own size never depends on the name.
  useLayoutEffect(() => {
    const label = labelRef.current;
    const base = baseRef.current;
    if (!followed || !label || !base || typeof ResizeObserver === "undefined") return;
    let active = true;
    const fit = () => {
      if (active) fitToEllipsis(base);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(label);
    void document.fonts?.ready.then(fit);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [name, suffix, followed]);
  return <span ref={labelRef} title={name} className={`flex w-full min-w-0 contain-inline-size ${className}`}>
    <span ref={baseRef} aria-hidden="true" className="truncate">{extension ? name.slice(0, -extension.length) : name}</span>
    {followed && <span aria-hidden="true" className="shrink-0 whitespace-pre">{extension}{suffix}</span>}
    <span className="sr-only">{name}{suffix}</span>
  </span>;
}

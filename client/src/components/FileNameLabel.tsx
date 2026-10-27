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
 * A file name chosen by a visitor (CV of the application forms, document of
 * the candidate's vault), on one line within its box whatever its length: a
 * name without a space no longer widens the page on a phone and pushes the
 * consents and the submit button off the screen. The base name is cut with an
 * ellipsis, the extension stays visible right after it, then `suffix` (the
 * size, say); the whole name is in the title. It fills the width of its box
 * and is never sized by the name (inline-size containment), whatever box or
 * grid holds it.
 */
export default function FileNameLabel({ name, suffix = "", className = "" }: { name: string; suffix?: string; className?: string }) {
  const extension = fileNameExtension(name);
  return <span title={name} className={`flex w-full min-w-0 contain-inline-size ${className}`}>
    <span className="truncate">{extension ? name.slice(0, -extension.length) : name}</span>
    {(extension || suffix) && <span className="shrink-0 whitespace-pre">{extension}{suffix}</span>}
  </span>;
}

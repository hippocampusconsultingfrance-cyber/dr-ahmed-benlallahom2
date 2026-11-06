import { useRef } from "react";
import { Search, X } from "lucide-react";
import { ADMIN_SEARCH_MAX_LENGTH } from "@shared/adminSearchLimits";

/**
 * Search box of an admin list (ADM-02): name, email or reference, searched by
 * the server once typing pauses (useAdminSearch); the cross empties it at once
 * and gives the focus back to the field. `status` (adminSearchStatus) is read
 * out by screen readers once the results are shown.
 */
export default function AdminSearchField({ id, label, placeholder, value, onChange, onClear, status = "", className = "" }: { id: string; label: string; placeholder: string; value: string; onChange: (value: string) => void; onClear: () => void; status?: string; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  // 8 px between the label and the field: the focus ring (3 px outline 3 px away, index.css) stays clear of the label.
  return (
    <div className={`space-y-2 text-sm text-muted-foreground ${className}`}>
      <label htmlFor={id} className="block">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="searchbox"
          value={value}
          onChange={event => onChange(event.target.value)}
          maxLength={ADMIN_SEARCH_MAX_LENGTH}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-10 text-foreground placeholder:text-muted-foreground"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onClear();
              // The cross disappears with the text: the focus goes back to the field, not to the top of the page.
              inputRef.current?.focus();
            }}
            aria-label="Effacer la recherche"
            className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {/* Present from the first render (empty until a search is shown), so that each new result is announced. */}
      <p role="status" className="sr-only">{status}</p>
    </div>
  );
}

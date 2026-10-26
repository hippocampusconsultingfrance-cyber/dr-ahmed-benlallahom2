import { Search, X } from "lucide-react";
import { ADMIN_SEARCH_MAX_LENGTH } from "./adminSearch";

/**
 * Search box of an admin list (ADM-02): name, email or reference, searched by
 * the server once typing pauses (useAdminSearch); the cross empties it at once.
 */
export default function AdminSearchField({ id, label, placeholder, value, onChange, onClear, className = "" }: { id: string; label: string; placeholder: string; value: string; onChange: (value: string) => void; onClear: () => void; className?: string }) {
  return (
    <div className={`space-y-1 text-sm text-muted-foreground ${className}`}>
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
        <input
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
            onClick={onClear}
            aria-label="Effacer la recherche"
            className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

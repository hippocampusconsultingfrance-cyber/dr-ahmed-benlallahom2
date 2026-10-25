import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTurnstileWidgetCopy } from "@/lib/publicFormCopy";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        "expired-callback": () => void;
        "timeout-callback": () => void;
        "unsupported-callback": () => void;
        "error-callback": (errorCode?: string) => boolean | void;
        theme?: "light" | "dark" | "auto";
        language?: "auto" | string;
        size?: "normal" | "flexible" | "compact";
        retry?: "auto" | "never";
        "retry-interval"?: number;
        tabindex?: number;
      }) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_ID = "cloudflare-turnstile-script";

/** Distance au viewport à partir de laquelle un widget différé charge Cloudflare. */
export const TURNSTILE_DEFER_ROOT_MARGIN = "400px 0px";

type TurnstileWidgetCopy = ReturnType<typeof getTurnstileWidgetCopy>;

/** Shown when the challenge cannot load or no longer holds a token: sending stays blocked until a new one arrives. */
export function TurnstileLoadError({ copy, onRetry }: { copy: TurnstileWidgetCopy; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-amber-500/50 bg-amber-950/30 p-3 text-xs text-amber-100 sm:flex-row sm:items-center sm:justify-between" role="alert">
      <span>{copy.loadError}</span>
      <button type="button" onClick={onRetry} className="shrink-0 rounded border border-amber-300/70 px-2.5 py-1 font-medium text-amber-50 transition hover:bg-amber-100/10">
        {copy.retry}
      </button>
    </div>
  );
}

/**
 * Renders one explicit Cloudflare challenge and exposes only its short-lived token.
 * The callback is held in a ref so a parent re-render cannot tear down a challenge
 * that is already being completed by a visitor.
 *
 * deferUntilVisible (PERF-04) : le script tiers de Cloudflare n'est chargé que lorsque le
 * formulaire approche du viewport ou reçoit le focus, et non dès l'ouverture de la page
 * (formulaire de contact en bas de l'accueil). Le bouton d'envoi reste bloqué sans jeton.
 */
export function TurnstileWidget({ onToken, deferUntilVisible = false }: { onToken: (token: string | null) => void; deferUntilVisible?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const tokenRef = useRef(false);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const { language } = useLanguage();
  const copy = getTurnstileWidgetCopy(language);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [armed, setArmed] = useState(!deferUntilVisible);

  onTokenRef.current = onToken;

  useEffect(() => {
    if (armed || !siteKey) return;
    const container = containerRef.current;
    if (!container) return;
    const form = container.closest("form");
    const arm = () => setArmed(true);
    if (typeof IntersectionObserver === "undefined") {
      arm();
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) arm();
    }, { rootMargin: TURNSTILE_DEFER_ROOT_MARGIN });
    observer.observe(container);
    form?.addEventListener("focusin", arm);
    return () => {
      observer.disconnect();
      form?.removeEventListener("focusin", arm);
    };
  }, [armed, siteKey]);

  useEffect(() => {
    if (!armed || !siteKey || !containerRef.current) return;

    let script: HTMLScriptElement | null = null;

    const reportError = (code: string) => {
      tokenRef.current = false;
      onTokenRef.current(null);
      setErrorCode(code);
    };

    const form = containerRef.current.closest("form");
    const blockSubmitWithoutToken = (event: Event) => {
      if (tokenRef.current) return;
      event.preventDefault();
      reportError("token_required");
    };
    form?.addEventListener("submit", blockSubmitWithoutToken, true);

    const render = () => {
      const container = containerRef.current;
      if (!window.turnstile || !container || widgetIdRef.current) return;
      setErrorCode(null);
      widgetIdRef.current = window.turnstile.render(container, {
        sitekey: siteKey,
        theme: "auto",
        language: "auto",
        size: "flexible",
        retry: "auto",
        "retry-interval": 8000,
        tabindex: 0,
        callback: token => {
          tokenRef.current = true;
          setErrorCode(null);
          onTokenRef.current(token);
        },
        "expired-callback": () => reportError("expired"),
        "timeout-callback": () => reportError("timeout"),
        "unsupported-callback": () => reportError("unsupported"),
        "error-callback": errorCode => {
          reportError(errorCode || "challenge_failed");
          return false;
        },
      });

    };

    const reportScriptLoadError = () => reportError("script_load_failed");
    script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (script) {
      script.addEventListener("load", render);
      script.addEventListener("error", reportScriptLoadError);
      render();
    } else {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render);
      script.addEventListener("error", reportScriptLoadError);
      document.head.appendChild(script);
    }

    return () => {
      form?.removeEventListener("submit", blockSubmitWithoutToken, true);
      script?.removeEventListener("load", render);
      script?.removeEventListener("error", reportScriptLoadError);
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
      onTokenRef.current(null);
    };
  }, [armed, siteKey, retryNonce]);

  if (!siteKey) return <p className="text-xs text-amber-200" role="alert">{copy.unavailable}</p>;

  return (
    <div className="space-y-2" aria-live="polite">
      <div ref={containerRef} className="min-h-[65px] w-full overflow-hidden" aria-label={copy.label} />
      {errorCode && <TurnstileLoadError copy={copy} onRetry={() => setRetryNonce(value => value + 1)} />}
    </div>
  );
}

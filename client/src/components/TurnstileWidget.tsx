import { useEffect, useRef, useState } from "react";

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

/**
 * Renders one explicit Cloudflare challenge and exposes only its short-lived token.
 * The callback is held in a ref so a parent re-render cannot tear down a challenge
 * that is already being completed by a visitor.
 */
export function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const tokenRef = useRef(false);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

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
  }, [siteKey, retryNonce]);

  if (!siteKey) return <p className="text-xs text-amber-200" role="alert">La vérification anti-bot est indisponible. Veuillez réessayer ultérieurement.</p>;

  return (
    <div className="space-y-2" aria-live="polite">
      <div ref={containerRef} className="min-h-[65px] w-full overflow-hidden" aria-label="Vérification anti-bot" />
      {errorCode && (
        <div className="flex flex-col items-start gap-2 rounded-md border border-amber-500/50 bg-amber-950/30 p-3 text-xs text-amber-100 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>La vérification de sécurité n’a pas pu être chargée. L’envoi reste bloqué afin de protéger vos données ; réessayez dans quelques instants.</span>
          <button type="button" onClick={() => setRetryNonce(value => value + 1)} className="shrink-0 rounded border border-amber-300/70 px-2.5 py-1 font-medium text-amber-50 transition hover:bg-amber-100/10">
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
}

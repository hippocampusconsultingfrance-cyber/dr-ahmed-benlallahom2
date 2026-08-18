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

export function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    const render = () => {
      if (!window.turnstile || !containerRef.current || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "auto",
        language: "auto",
        size: "flexible",
        retry: "auto",
        "retry-interval": 8000,
        tabindex: 0,
        callback: token => {
          setErrorCode(null);
          onToken(token);
        },
        "expired-callback": () => {
          onToken(null);
          setErrorCode("expired");
        },
        "timeout-callback": () => {
          onToken(null);
          setErrorCode("timeout");
        },
        "unsupported-callback": () => {
          onToken(null);
          setErrorCode("unsupported");
        },
        "error-callback": errorCode => {
          onToken(null);
          setErrorCode(errorCode || "challenge_failed");
          return false;
        },
      });
    };
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (script) {
      script.addEventListener("load", render);
      render();
    } else {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render);
      document.head.appendChild(script);
    }
    return () => {
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [onToken, siteKey]);

  if (!siteKey) return <p className="text-xs text-amber-200">La vérification anti-bot est en cours de configuration.</p>;
  const retry = () => {
    onToken(null);
    setErrorCode(null);
    if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
  };

  return (
    <div className="space-y-2" aria-live="polite">
      <div ref={containerRef} className="min-h-[65px] w-full overflow-hidden" aria-label="Vérification anti-bot" />
      {errorCode && (
        <div className="flex flex-col items-start gap-2 rounded-md border border-amber-500/50 bg-amber-950/30 p-3 text-xs text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span>La vérification anti-bot n’a pas abouti. Le contrôle se relance automatiquement ; vous pouvez aussi réessayer.</span>
          <button type="button" onClick={retry} className="shrink-0 rounded border border-amber-300/70 px-2.5 py-1 font-medium text-amber-50 transition hover:bg-amber-100/10">
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
}

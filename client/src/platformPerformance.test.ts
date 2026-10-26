import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { describe, expect, it } from "vitest";
import { TURNSTILE_DEFER_ROOT_MARGIN } from "./components/TurnstileWidget";

const root = resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const vercel = JSON.parse(read("vercel.json")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
  rewrites: { source: string; destination: string }[];
};
const headerFor = (source: string, key: string) => vercel.headers.find(rule => rule.source === source)?.headers.find(header => header.key === key)?.value;

describe("polices auto-hébergées (PUB-COOKIE-02 / PERF-05)", () => {
  it("ne contacte plus Google Fonts, ni dans le HTML ni dans la CSP", () => {
    const html = read("client/index.html");
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    const csp = headerFor("/(.*)", "Content-Security-Policy") ?? "";
    expect(csp).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(csp).toContain("font-src 'self' data:;");
    expect(read("server/_core/index.ts")).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });

  it("sert DM Sans et Playfair Display depuis le build, sous-ensemble latin uniquement", () => {
    const fonts = read("client/src/fonts.css");
    const sources = Array.from(fonts.matchAll(/url\("([^"]+)"\)/g), match => match[1]);
    expect(sources.length).toBe(5);
    for (const source of sources) {
      expect(source).toMatch(/^@fontsource(-variable)?\/[a-z-]+\/files\/[a-z-]+-latin-[a-z0-9]+-normal\.woff2$/);
      expect(() => readFileSync(resolve(root, "node_modules", source))).not.toThrow();
    }
    expect(fonts).toContain('font-family: "DM Sans";');
    expect(fonts).toContain('font-family: "Playfair Display";');
    expect(fonts.match(/font-display: swap;/g)).toHaveLength(5);
    expect(read("client/src/main.tsx")).toContain('import "./fonts.css";');
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@fontsource-variable/dm-sans"]).toBeTruthy();
    expect(pkg.dependencies["@fontsource/playfair-display"]).toBeTruthy();
  });
});

describe("Turnstile différé sur l'accueil (PERF-04)", () => {
  it("le formulaire de contact ne charge Cloudflare qu'à l'approche ou au focus", () => {
    expect(read("client/src/components/ContactSection.tsx")).toContain("<TurnstileWidget onToken={setTurnstileToken} deferUntilVisible />");
    const widget = read("client/src/components/TurnstileWidget.tsx");
    expect(widget).toContain("const [armed, setArmed] = useState(!deferUntilVisible);");
    expect(widget).toContain("new IntersectionObserver(");
    expect(widget).toContain('form?.addEventListener("focusin", arm);');
    expect(widget).toContain("if (!armed || !siteKey || !containerRef.current) return;");
    expect(TURNSTILE_DEFER_ROOT_MARGIN).toBe("400px 0px");
  });
});

describe("cache immuable des fichiers hachés (CACHE-01)", () => {
  it("place la sortie hachée de Vite dans /static et la met en cache un an", () => {
    expect(read("vite.config.ts")).toContain('assetsDir: "static",');
    expect(headerFor("/static/(.*)", "Cache-Control")).toBe("public, max-age=31536000, immutable");
    // Les fichiers non hachés (photos, logos) de /assets ne sont jamais figés.
    expect(vercel.headers.some(rule => rule.source.startsWith("/assets") && rule.headers.some(header => /immutable/.test(header.value)))).toBe(false);
    expect(read("scripts/check-performance-budgets.mjs")).toContain('path.resolve("dist/public/static")');
  });

  it("répare un fragment introuvable mis en cache (redéploiement, retour arrière) au lieu de rester bloqué un an", () => {
    const main = read("client/src/main.tsx");
    expect(main).toContain('import { installChunkLoadRecovery } from "./lib/chunkLoadRecovery";');
    expect(main.indexOf("installChunkLoadRecovery();")).toBeLessThan(main.indexOf("createRoot("));
  });
});

describe("repères de code source de l'éditeur visuel Manus (CODE-06)", () => {
  it("compile les composants sans attribut data-loc donnant le fichier et la ligne du code", async () => {
    const server = await createServer({
      configFile: resolve(root, "vite.config.ts"),
      cacheDir: resolve(root, "node_modules/.vite/source-locations-test"),
      server: { middlewareMode: true, hmr: false, ws: false },
      optimizeDeps: { noDiscovery: true },
      logLevel: "error",
    });
    try {
      const component = await server.transformRequest("/src/components/ErrorBoundary.tsx");
      expect(component?.code).toContain("getDerivedStateFromError");
      expect(component?.code).not.toContain("data-loc");
      expect(component?.code).not.toContain("client/src/components/ErrorBoundary.tsx:");
    } finally {
      await server.close();
    }
  }, 30_000);
});

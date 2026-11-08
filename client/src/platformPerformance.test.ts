import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { createServer } from "vite";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const vercel = JSON.parse(read("vercel.json")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
  rewrites: { source: string; destination: string }[];
};
const headerFor = (source: string, key: string) => vercel.headers.find(rule => rule.source === source)?.headers.find(header => header.key === key)?.value;

/**
 * The headers Vercel sends for a path: those of every rule whose source matches
 * it, a later rule's value replacing an earlier one's. The sources of
 * vercel.json are literal paths, ending at most in a `(.*)` group.
 */
function headersAt(pathname: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const rule of vercel.headers) {
    expect(rule.source).toMatch(/^(?:\/[a-z-]+)*(?:\/\(\.\*\))?$/);
    if (!new RegExp(`^${rule.source}$`).test(pathname)) continue;
    for (const { key, value } of rule.headers) headers[key] = value;
  }
  return headers;
}

describe("polices auto-hébergées (PUB-COOKIE-02 / PERF-05)", () => {
  it("ne contacte plus Google Fonts, ni dans le HTML ni dans la CSP", () => {
    const html = read("client/index.html");
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    const csp = headerFor("/(.*)", "Content-Security-Policy") ?? "";
    expect(csp).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(csp).toContain("font-src 'self' data:;");
    expect(read("server/_core/contentSecurityPolicy.ts")).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    // Les réponses du serveur Express : server/routes/selfHostedFonts.test.ts.
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

describe("cache immuable des fichiers hachés (CACHE-01)", () => {
  it("place la sortie hachée de Vite dans /static et la met en cache un an", () => {
    expect(read("vite.config.ts")).toContain('assetsDir: "static",');
    expect(headerFor("/static/(.*)", "Cache-Control")).toBe("public, max-age=31536000, immutable");
    // Les fichiers non hachés (photos, logos) de /assets ne sont jamais figés.
    expect(vercel.headers.some(rule => rule.source.startsWith("/assets") && rule.headers.some(header => /immutable/.test(header.value)))).toBe(false);
    expect(read("scripts/check-performance-budgets.mjs")).toContain('path.resolve("dist/public/static")');
  });

  it("garde un jour en cache les photos, logos et illustrations de /assets, non hachés, puis les revalide en arrière-plan pendant une semaine (SEOP-14)", () => {
    const assets = readdirSync(resolve(root, "client/public/assets"), { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
    expect(assets.length).toBeGreaterThan(0);
    const page = headersAt("/");
    for (const asset of assets) {
      const pathname = `/${relative(resolve(root, "client/public"), resolve(asset.parentPath, asset.name)).split(sep).join("/")}`;
      const headers = headersAt(pathname);
      expect(headers["Cache-Control"], pathname).toBe("public, max-age=86400, stale-while-revalidate=604800");
      // The security headers of every page are kept.
      expect({ ...headers, "Cache-Control": undefined }, pathname).toEqual({ ...page, "Cache-Control": undefined });
    }
    // Hashed files stay immutable, the API uncached, and the pages revalidated at each visit.
    expect(headersAt("/static/index-Bu9jLZjO.css")["Cache-Control"]).toBe("public, max-age=31536000, immutable");
    expect(headersAt("/api/health")["Cache-Control"]).toBe("no-store");
    for (const pathname of ["/", "/booking", "/recruitment/vvip-offshore"]) expect(headersAt(pathname)["Cache-Control"], pathname).toBeUndefined();
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

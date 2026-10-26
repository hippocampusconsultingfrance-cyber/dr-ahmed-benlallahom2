import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build, type Metafile } from "esbuild";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// M31 / PERF-01 / PUB-COOKIE-02 : le site public ne charge ni @clerk/react ni
// clerk-js. Le client est découpé par un vrai bundler (esbuild, chunks comme
// les React.lazy de App.tsx) et l’on suit les imports statiques de chaque
// chunk : seul le chunk chargé à la demande pour /admin contient Clerk.

const root = process.cwd();
let metafile: Metafile;
let directory = "";

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "client-chunks-"));
  const result = await build({
    entryPoints: [path.join(root, "client/src/main.tsx")],
    bundle: true,
    splitting: true,
    format: "esm",
    outdir: directory,
    write: false,
    metafile: true,
    jsx: "automatic",
    logLevel: "silent",
    // Styles and fonts are irrelevant to the JavaScript graph.
    plugins: [{ name: "no-css", setup(builder) { builder.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "css" })); } }],
    loader: { ".woff2": "empty", ".woff": "empty", ".ttf": "empty", ".png": "empty", ".svg": "empty", ".jpg": "empty", ".webp": "empty", ".avif": "empty" },
  });
  metafile = result.metafile!;
}, 120_000);
afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

type Output = Metafile["outputs"][string];
const outputs = () => Object.entries(metafile.outputs).filter(([file]) => file.endsWith(".js"));
const entryOutput = () => outputs().find(([, output]) => output.entryPoint?.endsWith("client/src/main.tsx"))!;
const outputOf = (file: string) => metafile.outputs[file]!;
const sources = (output: Output) => Object.keys(output.inputs);

/** Every chunk loaded with this one, i.e. through static imports only. */
function staticClosure(file: string): string[] {
  const seen = new Set<string>();
  const queue = [file];
  while (queue.length) {
    const current = queue.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const imported of outputOf(current).imports) if (imported.kind === "import-statement" && imported.path in metafile.outputs) queue.push(imported.path);
  }
  return [...seen];
}

const loadsClerk = (file: string) => staticClosure(file).some(chunk => sources(outputOf(chunk)).some(input => /node_modules\/.*@clerk\//.test(input)));
/** The chunk created for a page loaded with React.lazy. */
const pageChunk = (page: string) => outputs().find(([, output]) => output.entryPoint?.endsWith(`client/src/pages/${page}`))?.[0];

describe("Clerk chargé uniquement pour /admin (M31 / PERF-01)", () => {
  it("le point d’entrée et les chunks qu’il charge d’emblée ne contiennent pas @clerk/*", () => {
    const [entry, output] = entryOutput();
    expect(sources(output)).toContain("client/src/App.tsx");
    expect(loadsClerk(entry)).toBe(false);
  });

  it("la route /admin charge à la demande une racine qui, elle, apporte Clerk", () => {
    const [entry] = entryOutput();
    const adminRoot = pageChunk("AdminRoot.tsx");
    expect(adminRoot).toBeDefined();
    expect(staticClosure(entry)).not.toContain(adminRoot);
    expect(outputOf(entry).imports).toEqual(expect.arrayContaining([expect.objectContaining({ path: adminRoot, kind: "dynamic-import" })]));
    expect(loadsClerk(adminRoot!)).toBe(true);
  });

  it("aucune page publique chargée à la demande n’apporte Clerk ni le hook d’authentification", () => {
    const publicPages = outputs().map(([file, output]) => [file, output.entryPoint ?? ""] as const)
      .filter(([, entryPoint]) => /client\/src\/pages\/[^/]+\.tsx$/.test(entryPoint) && !/pages\/Admin(Root|Dashboard)\.tsx$/.test(entryPoint));
    expect(publicPages.length).toBeGreaterThan(15);
    const offenders = publicPages.filter(([file]) => loadsClerk(file) || staticClosure(file).some(chunk => sources(outputOf(chunk)).includes("client/src/_core/hooks/useAuth.ts")));
    expect(offenders.map(([, entryPoint]) => entryPoint)).toEqual([]);
  });
});

describe("racine de l’administration", () => {
  it("monte Clerk autour du tableau de bord chargé à la demande, avec retour sur /admin", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_admin_root");
    const { ClerkProvider } = await import("@clerk/react");
    const { default: AdminRoot } = await import("./pages/AdminRoot");
    const tree = AdminRoot() as { type: unknown; props: Record<string, unknown> & { children: { props: { children: { type: { $$typeof: symbol } } } } } };

    expect(tree.type).toBe(ClerkProvider);
    expect(tree.props).toMatchObject({ publishableKey: "pk_test_admin_root", signInFallbackRedirectUrl: "/admin", signUpFallbackRedirectUrl: "/admin", afterSignOutUrl: "/" });
    expect(tree.props.children.props.children.type.$$typeof).toBe(Symbol.for("react.lazy"));
    vi.unstubAllEnvs();
  });

  it("sans clé Clerk, n’indispose que /admin avec un message clair", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { default: AdminRoot } = await import("./pages/AdminRoot");
    const html = renderToStaticMarkup(createElement(AdminRoot));

    expect(html).toContain('role="alert"');
    expect(html).toContain("Administration indisponible");
    expect(html).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
    vi.unstubAllEnvs();
  });
});

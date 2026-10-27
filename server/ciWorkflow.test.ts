import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => readFile(path.join(root, relative), "utf8");

type Step = { name: string; keys: Record<string, string>; run: string };

/**
 * The steps of one job, read from the block layout of ci.yml (no YAML library
 * among the dependencies): `- ` opens a step at the steps' indentation, each
 * `key: value` below it is one of its keys, and a `run: |` block keeps every
 * more indented line that follows. A line this layout does not explain fails
 * the test rather than being skipped.
 */
function jobSteps(workflow: string, job: string): Step[] {
  const lines = workflow.split("\n");
  const start = lines.indexOf(`  ${job}:`);
  expect(start, `job ${job}`).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((line, index) => index > start && /^ {2}\S/.test(line));
  const body = lines.slice(start + 1, end < 0 ? undefined : end);
  const stepsAt = body.indexOf("    steps:");
  expect(stepsAt, `steps of ${job}`).toBeGreaterThanOrEqual(0);
  const steps: Step[] = [];
  let block: { step: Step; indent: number } | null = null;
  for (const line of body.slice(stepsAt + 1)) {
    if (block && (line.trim() === "" || line.search(/\S/) > block.indent)) {
      block.step.run += `${line.trim()}\n`;
      continue;
    }
    block = null;
    if (line.trim().startsWith("#")) continue;
    // Another key of the job after its steps.
    if (line.trim() && line.search(/\S/) <= 4) break;
    const entry = /^ {6}(- | {2})([\w-]+):\s?(.*)$/.exec(line);
    if (!entry) {
      if (line.trim() && !/^ {8,}\S/.test(line)) throw new Error(`ci.yml: unexpected line in ${job}: ${line}`);
      continue;
    }
    const [, marker, key, value] = entry;
    if (marker === "- ") steps.push({ name: "", keys: {}, run: "" });
    const step = steps.at(-1)!;
    step.keys[key] = value;
    if (key === "name") step.name = value;
    if (key === "run") {
      if (value === "|") block = { step, indent: 8 };
      else step.run = `${value}\n`;
    }
  }
  return steps;
}

const AFTER_BUILD = "${{ !cancelled() && steps.build.outcome == 'success' }}";

describe("intégration continue GitHub", () => {
  it("contrôle le typage et les tests à chaque changement de la branche principale", async () => {
    const [workflow, packageJson] = await Promise.all([read(".github/workflows/ci.yml"), read("package.json")]);
    const packageManager = JSON.parse(packageJson).packageManager as string;
    const pnpmVersion = packageManager.match(/^pnpm@([0-9.]+)/)?.[1];
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("pnpm check");
    expect(workflow).toContain("pnpm test:ci");
    expect(workflow).toContain("pnpm audit --prod --audit-level=high");
    expect(workflow).not.toContain("continue-on-error: true");
    expect(workflow).toContain("STRIPE_SECRET_KEY: sk_test_");
    expect(workflow).toContain("CANDIDATE_DOCUMENT_ENCRYPTION_KEY:");
    // Une base PostgreSQL de test (`services:`) est permise ; jamais un push du schéma.
    expect(workflow).not.toContain("pnpm db:push");
    expect(pnpmVersion).toBeTruthy();
    expect(packageManager).toMatch(/^pnpm@[0-9.]+\+sha512\./);
    expect(workflow).not.toMatch(/pnpm\/action-setup@v4\s+with:\s+version:/);
  });

  it("vérifie après le build les budgets, le démarrage réel du serveur, la concordance des migrations et le code mort (CODE-14)", async () => {
    const steps = jobSteps(await read(".github/workflows/ci.yml"), "quality");
    const stepRunning = (command: string) => steps.findIndex(step => step.run.split("\n").includes(command));
    const commands = [
      "pnpm build",
      "node scripts/check-performance-budgets.mjs",
      "node scripts/smoke-built-server.mjs",
      "node scripts/check-migrations-in-sync.mjs",
      "pnpm knip",
    ];
    const positions = commands.map(stepRunning);
    expect(Object.fromEntries(commands.map((command, index) => [command, positions[index]! >= 0]))).toEqual(Object.fromEntries(commands.map(command => [command, true])));
    expect(new Set(positions).size).toBe(commands.length);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const command of commands) {
      const script = /^node (scripts\/\S+\.mjs)$/.exec(command)?.[1];
      if (script) expect(existsSync(path.join(root, script)), script).toBe(true);
    }
    const [build, budgets, smoke, migrations, knip] = positions.map(position => steps[position]!);
    expect(build.keys.id).toBe("build");
    expect(migrations.run.split("\n")).toEqual(expect.arrayContaining([
      "git diff --exit-code -- drizzle/pg",
      'untracked="$(git status --porcelain --untracked-files=all -- drizzle/pg)"',
      'if [ -n "$untracked" ]; then echo "$untracked"; exit 1; fi',
    ]));
    // Juste après le build, le budget n'a pas besoin de condition ; un budget dépassé
    // n'empêche pas les trois contrôles suivants de rendre leur résultat.
    expect(budgets.keys.if).toBeUndefined();
    for (const step of [smoke, migrations, knip]) expect(step.keys.if, step.name).toBe(AFTER_BUILD);
  });

  it("ne neutralise aucune étape du job quality (|| true, || echo, continue-on-error, exit 0 forcé, étape désactivée)", async () => {
    const workflow = await read(".github/workflows/ci.yml");
    const steps = jobSteps(workflow, "quality");
    expect(steps.length).toBeGreaterThanOrEqual(10);
    const quality = workflow.slice(workflow.indexOf("\n  quality:\n"), workflow.indexOf("\n  dependency-audit:\n"));
    expect(quality).not.toMatch(/^ {4}continue-on-error:/m);
    for (const step of steps) {
      expect(step.keys["continue-on-error"] ?? "false", step.name).toBe("false");
      expect(step.run, step.name).not.toMatch(/\|\|\s*(?:true\b|:|echo\b|exit\b)/);
      expect(step.run, step.name).not.toMatch(/\bexit\s+0\b/);
      expect(step.run, step.name).not.toMatch(/\bset\s+\+e\b/);
      expect(step.keys.if ?? "", step.name).not.toMatch(/^(?:false|0|\$\{\{\s*(?:false|0)\s*\}\})$/);
    }
  });

  it("borne la durée de chaque job et annule la vérification dépassée d'une pull request", async () => {
    const workflow = await read(".github/workflows/ci.yml");
    const jobs = workflow.slice(workflow.indexOf("\njobs:\n"));
    const jobCount = jobs.match(/^ {2}[a-z][\w-]*:$/gm)?.length ?? 0;
    expect(jobCount).toBeGreaterThanOrEqual(2);
    expect(jobs.match(/^ {4}timeout-minutes: \d+$/gm)).toHaveLength(jobCount);
    expect(workflow).toContain("concurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}\n");
  });

  it("prend la version de Node dans .nvmrc, et un champ engines éventuel désigne la même version majeure", async () => {
    const [workflow, nvmrc, packageJson] = await Promise.all([read(".github/workflows/ci.yml"), read(".nvmrc"), read("package.json")]);
    expect(nvmrc.trim()).toBe("22");
    const setups = workflow.match(/uses: actions\/setup-node@v4\s+with:\s+node-version-file: \.nvmrc\b/g) ?? [];
    expect(setups).toHaveLength(workflow.match(/uses: actions\/setup-node@/g)?.length ?? 0);
    expect(setups.length).toBeGreaterThan(0);
    expect(workflow).not.toMatch(/node-version:/);
    // Vercel ne lit pas .nvmrc : il prend `engines.node` s'il existe, sinon le réglage du projet.
    // Le champ, une fois ajouté, doit faire tourner la production sur la version de la CI.
    const engine = (JSON.parse(packageJson).engines as { node?: string } | undefined)?.node;
    if (engine !== undefined) expect(engine).toBe(`${nvmrc.trim()}.x`);
  });
});

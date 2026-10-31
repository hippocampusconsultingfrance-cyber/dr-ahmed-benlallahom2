import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => readFile(path.join(root, relative), "utf8");

type Step = { name: string; keys: Record<string, string>; run: string };
type BlockScalar = { step: Step; key: string; folded: boolean; lines: string[] };

/** A block scalar header: `|` or `>`, then an optional chomping (`-`, `+`) and indentation indicator. */
const BLOCK_SCALAR = /^[|>][+-]?\d*$/;

/** The value of a block scalar from its trimmed lines: `|` keeps each line, `>` folds each paragraph into one line, as YAML does. */
function blockScalarValue({ lines, folded }: BlockScalar) {
  if (!folded) return lines.map(line => `${line}\n`).join("");
  const paragraphs: string[][] = [[]];
  for (const line of lines) {
    if (line) paragraphs.at(-1)!.push(line);
    else paragraphs.push([]);
  }
  return paragraphs.filter(paragraph => paragraph.length > 0).map(paragraph => `${paragraph.join(" ")}\n`).join("");
}

/**
 * The steps of one job, read from the block layout of ci.yml (no YAML library
 * among the dependencies): `- ` opens a step at the steps' indentation, each
 * `key: value` below it is one of its keys, and a block scalar (`run: |`,
 * `run: >-`, `if: |+`…) keeps every more indented line that follows. Only
 * `with:` and `env:` may hold more indented lines of their own. A line this
 * layout does not explain, such as a value carried on to a more indented line,
 * fails the test rather than being skipped.
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
  const blocks: BlockScalar[] = [];
  let block: BlockScalar | null = null;
  // The last key read holds a mapping (`with:`, `env:`) on the more indented lines.
  let mapping = false;
  for (const line of body.slice(stepsAt + 1)) {
    const indent = line.search(/\S/);
    if (block && (indent < 0 || indent > 8)) {
      block.lines.push(line.trim());
      continue;
    }
    block = null;
    if (indent < 0 || line.trim().startsWith("#")) continue;
    // Another key of the job after its steps.
    if (indent <= 4) break;
    const entry = /^ {6}(- | {2})([\w-]+):\s?(.*)$/.exec(line);
    if (!entry) {
      if (mapping && indent > 8) continue;
      throw new Error(`ci.yml: unexpected line in ${job}: ${line}`);
    }
    const [, marker, key, value] = entry;
    if (marker === "- ") steps.push({ name: "", keys: {}, run: "" });
    const step = steps.at(-1)!;
    mapping = value === "" && (key === "with" || key === "env");
    step.keys[key] = value;
    if (BLOCK_SCALAR.test(value)) {
      block = { step, key, folded: value.startsWith(">"), lines: [] };
      blocks.push(block);
    }
  }
  for (const scalar of blocks) scalar.step.keys[scalar.key] = blockScalarValue(scalar);
  for (const step of steps) {
    step.name = step.keys.name?.trim() ?? "";
    step.run = step.keys.run?.replace(/\n?$/, "\n") ?? "";
  }
  return steps;
}

const AFTER_BUILD = "${{ !cancelled() && steps.build.outcome == 'success' }}";

/** After the build, in this order: the budgets, then three checks that each report even when another fails. */
function expectPostBuildChecks(workflow: string) {
  const steps = jobSteps(workflow, "quality");
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
}

/**
 * The lines of a step's command holding a pipe that runs without pipefail: such a
 * pipe (`pnpm check | tee check.log`) fails only when its last command does. Only
 * the step's own `shell: bash` or a `set -o pipefail` before the pipe counts.
 */
function pipesWithoutPipefail(step: Step) {
  let pipefail = step.keys.shell?.trim() === "bash";
  return step.run.split("\n").filter(line => {
    if (/^set\s+-[a-z]*o\s+pipefail\b/.test(line)) pipefail = true;
    return !pipefail && /(?:^|[^|])\|(?!\|)/.test(line);
  });
}

/**
 * A command without the text of its quoted strings and comments, so that a `;` or a `|`
 * in an argument is not taken for an operator. What `$(…)` and backquotes run is kept,
 * even within double quotes, and a `\` at the end of a line joins it to the next one.
 */
function unquoted(command: string) {
  let text = "";
  // The double quotes, backquotes and parentheses open around the current character.
  const open: string[] = [];
  for (let index = 0; index < command.length; index++) {
    const char = command[index]!;
    if (char === "\\") {
      if (command[index + 1] === "\n") text += " ";
      index++;
    } else if (char === '"' || char === "`") {
      if (open.at(-1) === char) open.pop();
      else open.push(char);
      text += char;
    } else if (open.at(-1) === '"') {
      if (!command.startsWith("$(", index)) continue;
      open.push("(");
      text += "$(";
      index++;
    } else if (char === "'") {
      const end = command.indexOf("'", index + 1);
      index = end < 0 ? command.length : end;
      text += "''";
    } else if (char === "#" && /(?:^|[\s;&|(])$/.test(text)) {
      const end = command.indexOf("\n", index);
      index = (end < 0 ? command.length : end) - 1;
    } else {
      if (char === "(") open.push(char);
      else if (char === ")" && open.at(-1) === "(") open.pop();
      text += char;
    }
  }
  return text;
}

type Silencer = { what: string; pattern: RegExp };

/**
 * What lets a step pass under `bash -e` though one of its commands fails: bash does not
 * stop on a command tested by `||`, `&&`, `!`, `if`, `while` or `until`, nor wait for one
 * sent to the background. Only a test (`[ … ]`, `[[ … ]]`, `test`) may be a condition,
 * and an `&&` list only the step's last command, whose status is the step's. A command
 * given as quoted text (`eval`, `bash -c`) is refused, since quoted text is not read.
 */
const STEP_SILENCERS: readonly Silencer[] = [
  { what: "||", pattern: /\|\|/ },
  { what: "exit 0", pattern: /\bexit\s+0\b/ },
  { what: "set +e", pattern: /\bset\s+(?:[-+][a-z]*\s+)*\+[a-z]*(?:e|o\s+(?:errexit|pipefail)\b)/ },
  { what: "a command as a condition", pattern: /(?:^|[;&|({]|\b(?:then|do|else)\b)\s*(?:if|elif|while|until)\s+(?!(?:!\s+)?(?:\[\[?\s|test\s))/m },
  { what: "!", pattern: /(?:^|[;&|({]|\b(?:then|do|else|if|elif|while|until)\b)\s*!\s+(?!\[\[?\s|test\s)/m },
  { what: "&", pattern: /(?<![&|<>])&(?![&>])/ },
  { what: "&& before another command", pattern: /&&.*[;\n]/s },
  { what: "eval or sh -c", pattern: /\b(?:eval|(?:ba|da|z)?sh\s+(?:-\S+\s+)*-[a-z]*c)\b/ },
];

/**
 * A package.json script runs in `sh -c`, without -e or pipefail: only its last command,
 * and the last command of a pipe, decide whether it fails.
 */
const SCRIPT_SILENCERS: readonly Silencer[] = [
  ...STEP_SILENCERS,
  { what: "; or a second line", pattern: /[;\n]/ },
  { what: "|", pattern: /(?:^|[^|])\|(?!\|)/ },
];

type NamedException = { where: string; line: string; reason: string };

/**
 * The lines the checks below leave out, each named by its step (`step "Verify TypeScript"`)
 * or script (`script "knip"`) and its exact text, with why a failure on that line still
 * fails the job. None today.
 */
const NAMED_EXCEPTIONS: readonly NamedException[] = [];

/** What in a command lets it pass though one of its commands fails, outside the lines named for it with a reason. */
function silencersIn(command: string, where: string, silencers: readonly Silencer[], exceptions: readonly NamedException[]) {
  const named = new Set(exceptions.filter(exception => exception.where === where && exception.reason.trim()).map(exception => exception.line));
  const text = unquoted(command.split("\n").map(line => (named.has(line.trim()) ? "" : line)).join("\n")).trim();
  return silencers.filter(({ pattern }) => pattern.test(text)).map(({ what }) => what);
}

/** The package.json scripts a command runs, as `pnpm <script>` or `pnpm run <script>`, then those they run in turn. */
function scriptsRun(command: string, scripts: Record<string, string>, found = new Map<string, string>()) {
  for (const [, name] of unquoted(command).matchAll(/\bpnpm(?:\s+-\S+)*\s+(?:run\s+(?:-\S+\s+)*)?([^\s;&|()<>]+)/g)) {
    if (!name || !Object.hasOwn(scripts, name) || found.has(name)) continue;
    found.set(name, scripts[name]!);
    scriptsRun(scripts[name]!, scripts, found);
  }
  return found;
}

/** No step of the quality job, nor any package.json script it runs, may pass whatever its command does. */
function expectNoNeutralizedStep(workflow: string, packageJson: string, exceptions = NAMED_EXCEPTIONS) {
  const steps = jobSteps(workflow, "quality");
  expect(steps.length).toBeGreaterThanOrEqual(10);
  const quality = workflow.slice(workflow.indexOf("\n  quality:\n"), workflow.indexOf("\n  dependency-audit:\n"));
  expect(quality).not.toMatch(/^ {4}continue-on-error:/m);
  // Without `shell:`, GitHub runs `bash -e {0}`, and `shell: bash` adds pipefail; any
  // other shell (`bash {0}`, `sh`…, set in a step or in `defaults:`) would let a failed
  // command go on to the next one unnoticed.
  expect(workflow).not.toMatch(/^ *shell:(?! *bash *$)/m);
  for (const step of steps) {
    expect(step.keys.shell?.trim() ?? "bash", step.name).toBe("bash");
    expect(step.keys["continue-on-error"] ?? "false", step.name).toBe("false");
    expect(silencersIn(step.run, `step "${step.name}"`, STEP_SILENCERS, exceptions), step.name).toEqual([]);
    expect(pipesWithoutPipefail(step), step.name).toEqual([]);
    // GitHub reads a quoted condition (`'false'`, `"${{ false }}"`) as the same expression.
    const condition = (step.keys.if?.trim() ?? "").replace(/^(['"])(.*)\1$/, "$2").trim();
    expect(condition, step.name).not.toMatch(/^(?:false|0|\$\{\{\s*(?:false|0)\s*\}\})$/);
  }
  const scripts = (JSON.parse(packageJson) as { scripts?: Record<string, string> }).scripts ?? {};
  for (const [name, script] of scriptsRun(steps.map(step => step.run).join("\n"), scripts)) {
    expect(silencersIn(script, `script "${name}"`, SCRIPT_SILENCERS, exceptions), `script "${name}"`).toEqual([]);
  }
}

/**
 * A small workflow laid out like ci.yml, on which the parser's own test changes
 * one line at a time: both checks above pass on it as it is.
 */
const FIXTURE_WORKFLOW = `name: Fixture

on:
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      CI_DUMMY_KEY: dummy

    steps:
      - name: Check out source
        uses: actions/checkout@v4
      - name: Set up pnpm
        uses: pnpm/action-setup@v4
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Verify TypeScript
        run: pnpm check
      - name: Run test suite
        run: pnpm test:ci
      - name: Verify production build
        id: build
        run: pnpm build
      # A comment between two steps.
      - name: Check performance budgets
        run: node scripts/check-performance-budgets.mjs
      - name: Start the built server
        if: ${AFTER_BUILD}
        run: node scripts/smoke-built-server.mjs
      - name: Verify migrations match the schema
        if: ${AFTER_BUILD}
        run: |
          node scripts/check-migrations-in-sync.mjs
          git diff --exit-code -- drizzle/pg
          untracked="$(git status --porcelain --untracked-files=all -- drizzle/pg)"
          if [ -n "$untracked" ]; then echo "$untracked"; exit 1; fi
      - name: Find unused files and dependencies
        if: ${AFTER_BUILD}
        run: pnpm knip

  dependency-audit:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Audit production dependencies
        run: pnpm audit --prod --audit-level=high
`;

/** The scripts of a package.json beside that workflow: the build's banner holds a quoted `;`, and no step runs `dev`. */
const FIXTURE_SCRIPTS: Record<string, string> = {
  dev: "tsx watch server/index.ts",
  build: `vite build && esbuild server/index.ts --bundle --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" --outfile=api/index.js`,
  check: "tsc --noEmit",
  knip: "knip",
  "test:ci": "vitest run --exclude server/slow.test.ts",
};

/** The fixture workflow with one of its lines changed. */
function changed(from: string, to: string) {
  expect(FIXTURE_WORKFLOW).toContain(from);
  return FIXTURE_WORKFLOW.replace(from, to);
}

/** That package.json, with these scripts added or changed. */
const fixturePackageJson = (scripts: Record<string, string> = {}) => JSON.stringify({ scripts: { ...FIXTURE_SCRIPTS, ...scripts } });

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
    expectPostBuildChecks(await read(".github/workflows/ci.yml"));
  });

  it("ne neutralise aucune étape du job quality ni aucun script package.json qu'elle lance (||, exit 0 forcé, set +e, commande en condition, continue-on-error, shell sans -e, pipe sans pipefail, étape désactivée)", async () => {
    const [workflow, packageJson] = await Promise.all([read(".github/workflows/ci.yml"), read("package.json")]);
    expectNoNeutralizedStep(workflow, packageJson);
  });

  it("lit chaque forme de bloc YAML d'une étape, et refuse une ligne qu'il ne sait pas lire", () => {
    const check = "        run: pnpm check\n";
    const tests = "        run: pnpm test:ci\n";
    const smoke = "        run: node scripts/smoke-built-server.mjs\n";
    expect(() => expectPostBuildChecks(FIXTURE_WORKFLOW)).not.toThrow();
    expect(() => expectNoNeutralizedStep(FIXTURE_WORKFLOW, fixturePackageJson())).not.toThrow();
    // A literal or folded block, whatever its chomping or indentation indicator, is read as
    // the command it holds, and refused when that command is silenced.
    for (const header of ["|", "|-", "|+", "|2", ">", ">-", ">+"]) {
      const block = (command: string) => changed(tests, `        run: ${header}\n          ${command}\n`);
      expect(jobSteps(block("pnpm test:ci"), "quality").find(step => step.name === "Run test suite")?.run, header).toBe("pnpm test:ci\n");
      expect(() => expectNoNeutralizedStep(block("pnpm test:ci || true"), fixturePackageJson()), header).toThrow(/^Run test suite: /);
    }
    // Folded, one line still runs the smoke test; these two run `echo node scripts/smoke-built-server.mjs`.
    expect(() => expectPostBuildChecks(changed(smoke, "        run: >-\n          node scripts/smoke-built-server.mjs\n"))).not.toThrow();
    expect(() => expectPostBuildChecks(changed(smoke, "        run: >\n          echo\n          node scripts/smoke-built-server.mjs\n"))).toThrow();
    // A plain value carried on to a more indented line is part of the command.
    expect(() => jobSteps(changed(smoke, `${smoke}          || true\n`), "quality")).toThrow(/unexpected line in quality: {11}\|\| true/);
    // A step disabled by a folded condition.
    expect(() => expectNoNeutralizedStep(changed(`        if: ${AFTER_BUILD}\n${smoke}`, `        if: >-\n          \${{ false }}\n${smoke}`), fixturePackageJson())).toThrow(/^Start the built server: /);
    // A shell without -e, for one step or for the whole job.
    expect(() => expectNoNeutralizedStep(changed(tests, `${tests}        shell: bash {0}\n`), fixturePackageJson())).toThrow(/shell:/);
    expect(() => expectNoNeutralizedStep(changed("  quality:\n", "  quality:\n    defaults:\n      run:\n        shell: bash {0}\n"), fixturePackageJson())).toThrow(/shell:/);
    // A pipe reports only its last command, unless the step sets pipefail before it.
    const piped = "        run: pnpm check | tee check-output.log\n";
    expect(() => expectNoNeutralizedStep(changed(check, piped), fixturePackageJson())).toThrow(/^Verify TypeScript: /);
    expect(() => expectNoNeutralizedStep(changed(check, "        run: |\n          pnpm check | tee check-output.log\n          set -o pipefail\n"), fixturePackageJson())).toThrow(/^Verify TypeScript: /);
    expect(() => expectNoNeutralizedStep(changed(check, `${piped}        shell: sh\n`), fixturePackageJson())).toThrow(/shell:/);
    expect(() => expectNoNeutralizedStep(changed(check, `${piped}        shell: bash\n`), fixturePackageJson())).not.toThrow();
    expect(() => expectNoNeutralizedStep(changed(check, "        run: |\n          set -eo pipefail\n          pnpm check | tee check-output.log\n"), fixturePackageJson())).not.toThrow();
    // A condition GitHub evaluates to false, quoted or not.
    for (const condition of ["false", "'false'", "'0'", "${{ false }}", '"${{ false }}"']) {
      expect(() => expectNoNeutralizedStep(changed(tests, `        if: ${condition}\n${tests}`), fixturePackageJson()), condition).toThrow(/^Run test suite: /);
    }
  });

  it("refuse ce qui laisse passer une commande en échec dans une étape (bash -e) ou un script package.json (sh -c), hors du texte entre guillemets (CODE-14)", () => {
    const inStep = (command: string) => silencersIn(command, 'step "Fixture"', STEP_SILENCERS, []);
    const inScript = (command: string) => silencersIn(command, 'script "fixture"', SCRIPT_SILENCERS, []);
    const steps: [string, string[]][] = [
      ["pnpm check || printf ok", ["||"]],
      ["pnpm check || :", ["||"]],
      ["pnpm check || exit 0", ["||", "exit 0"]],
      ["pnpm check\nexit 0", ["exit 0"]],
      ["set +o errexit\npnpm knip", ["set +e"]],
      ["set -x +e\npnpm check", ["set +e"]],
      ["set -eu +o pipefail\npnpm check | tee check.log", ["set +e"]],
      ["if pnpm check; then :; fi", ["a command as a condition"]],
      ["until pnpm check; do break; done", ["a command as a condition"]],
      ["! pnpm check", ["!"]],
      ["pnpm check &", ["&"]],
      ["pnpm check && echo typed\npnpm test:ci", ["&& before another command"]],
      ["bash -c 'pnpm check || true'", ["eval or sh -c"]],
      ['eval "pnpm check; exit 0"', ["eval or sh -c"]],
      // What `$(…)` runs is read, even within double quotes, and a line carried on by `\` is the same command.
      ['typed="$(pnpm check || true)"', ["||"]],
      ["pnpm check \\\n  || true", ["||"]],
      ["pnpm check && \\\n  pnpm test:ci", []],
      // Neither quoted text, a comment, a redirection, a test as condition nor a last `&&` list.
      ['echo "|| true; exit 0 &" && pnpm check', []],
      ["# not || true\npnpm check 2>&1 | tee check.log", []],
      ['if [ -n "$untracked" ]; then echo "$untracked"; exit 1; fi', []],
      ["if ! [ -f dist/index.js ]; then exit 1; fi\npnpm check && pnpm test:ci", []],
      ["set -eo pipefail\nset +x\npnpm check", []],
    ];
    for (const [command, found] of steps) expect(inStep(command), command).toEqual(found);
    // A script keeps only its last command's status, and that of a pipe's last command.
    const scripts: [string, string[]][] = [
      ["knip || true", ["||"]],
      ["knip; exit 0", ["exit 0", "; or a second line"]],
      ["knip\necho done", ["; or a second line"]],
      ["knip | tee knip.log", ["|"]],
      ["tsc --noEmit && vitest run", []],
      [FIXTURE_SCRIPTS.build!, []],
    ];
    for (const [command, found] of scripts) expect(inScript(command), command).toEqual(found);
    // Each construct refused above is refused by one of these cases.
    expect(new Set([...steps, ...scripts].flatMap(([, found]) => found))).toEqual(new Set(SCRIPT_SILENCERS.map(({ what }) => what)));
  });

  it("lit les scripts package.json que lancent les étapes du job quality et ceux qu'ils lancent, et ne laisse passer qu'une ligne nommée avec sa raison (CODE-14)", () => {
    const check = "        run: pnpm check\n";
    const knip = "        run: pnpm knip\n";
    const verify = (workflow: string, scripts: Record<string, string> = {}, exceptions?: readonly NamedException[]) => () =>
      expectNoNeutralizedStep(workflow, fixturePackageJson(scripts), exceptions);
    const runs = jobSteps(FIXTURE_WORKFLOW, "quality").map(step => step.run).join("\n");
    expect([...scriptsRun(runs, FIXTURE_SCRIPTS).keys()]).toEqual(["check", "test:ci", "build", "knip"]);
    expect([...scriptsRun("pnpm check", { check: "pnpm run typecheck", typecheck: "pnpm check && tsc --noEmit", lint: "eslint ." }).keys()]).toEqual(["check", "typecheck"]);
    expect(verify(FIXTURE_WORKFLOW)).not.toThrow();
    // knip exits 0 whatever it finds, in the script the step runs or in one that script runs.
    expect(verify(FIXTURE_WORKFLOW, { knip: "knip || true" })).toThrow(/^script "knip": /);
    expect(verify(FIXTURE_WORKFLOW, { knip: "pnpm run knip:files", "knip:files": "knip; exit 0" })).toThrow(/^script "knip:files": /);
    // A script no step runs is not read.
    expect(verify(FIXTURE_WORKFLOW, { dev: "tsx watch server/index.ts || true" })).not.toThrow();
    expect(verify(changed(knip, "        run: |\n          set +o errexit\n          pnpm knip\n"))).toThrow(/^Find unused files and dependencies: /);
    // An `||` passes only on the line named for its step, with a reason.
    const exitsItself = 'pnpm check || { echo "::error::TypeScript failed"; exit 1; }';
    const named = changed(check, `        run: ${exitsItself}\n`);
    const exception = { where: 'step "Verify TypeScript"', line: exitsItself, reason: "the step exits 1 itself after its message" };
    expect(verify(named)).toThrow(/^Verify TypeScript: /);
    expect(verify(named, {}, [exception])).not.toThrow();
    expect(verify(named, {}, [{ ...exception, reason: " " }])).toThrow(/^Verify TypeScript: /);
    expect(verify(named, {}, [{ ...exception, where: 'step "Run test suite"' }])).toThrow(/^Verify TypeScript: /);
    expect(verify(FIXTURE_WORKFLOW, { knip: "knip || exit 1" }, [{ where: 'script "knip"', line: "knip || exit 1", reason: "exits 1 itself" }])).not.toThrow();
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

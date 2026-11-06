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
 * A one-line value as YAML reads it, so as GitHub runs it: a quoted one loses its quotes and
 * any comment after them, `''` becomes `'` in single quotes, and double quotes decode the
 * escapes JSON shares (`\"`, `\\`, `\n`…). A quoted value it cannot read, such as one
 * carried on to the next line, fails the test.
 */
function yamlValue(value: string) {
  if (!/^['"]/.test(value)) return value;
  const single = /^'((?:[^']|'')*)'(?:\s+#.*)?\s*$/.exec(value);
  if (single) return single[1]!.replaceAll("''", "'");
  const double = /^("(?:[^"\\]|\\["\\/bfnrt]|\\u[\da-fA-F]{4})*")(?:\s+#.*)?\s*$/.exec(value);
  if (double) return JSON.parse(double[1]!) as string;
  throw new Error(`ci.yml: unreadable quoted value: ${value}`);
}

/**
 * The steps of one job, read from the block layout of ci.yml (no YAML library
 * among the dependencies): `- ` opens a step at the steps' indentation, each
 * `key: value` below it is one of its keys (read without its YAML quotes), and a
 * block scalar (`run: |`, `run: >-`, `if: |+`…) keeps every more indented line
 * that follows. Only `with:` and `env:` may hold more indented lines of their own. A line this
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
    step.keys[key] = yamlValue(value);
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
 * A character escaped by `\` is a letter of its word: `\ #` starts no comment.
 */
function unquoted(command: string) {
  let text = "";
  // The double quotes, backquotes and parentheses open around the current character.
  const open: string[] = [];
  for (let index = 0; index < command.length; index++) {
    const char = command[index]!;
    if (char === "\\") {
      text += command[index + 1] === "\n" ? " " : "_";
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
 * sent to the background (`&`, `coproc`), nor look at what `$(…)` returns outside a plain
 * assignment (`echo "$(…)"`, `export X="$(…)"`); and -e does not reach inside `$(…)`, so an
 * assignment's holds one command. Only a test (`[ … ]`, `[[ … ]]`, `test`) may be a
 * condition, alone before its `then` or `do`, and an `&&` list only the step's last command,
 * whose status is the step's. A command given as quoted text (`eval`, `trap`, `bash -c`) is
 * refused, since quoted text is not read, and so is knip told to exit 0 whatever it finds.
 */
const STEP_SILENCERS: readonly Silencer[] = [
  { what: "||", pattern: /\|\|/ },
  { what: "exit 0", pattern: /\bexit\s+0\b/ },
  { what: "set +e or shopt -u errexit", pattern: /\bset\b[^;&|\n]*\s\+[a-z]*(?:e|o\s+(?:errexit|pipefail)\b)|\bshopt\b[^;&|\n]*\b(?:errexit|pipefail)\b/ },
  { what: "a command as a condition", pattern: /(?:^|[;&|({]|\b(?:then|do|else)\b)\s*(?:if|elif|while|until)\s+(?:(?!(?:!\s+)?(?:\[\[?\s|test\s))|[^;\n]*[;\n]\s*(?!(?:then|do)\b)\S)/m },
  { what: "!", pattern: /(?:^|[;&|({]|\b(?:then|do|else|if|elif|while|until)\b)\s*!\s+(?!\[\[?\s|test\s)/m },
  { what: "& or coproc", pattern: /(?<![&|<>])&(?![&>])|\bcoproc\b/ },
  { what: "&& before another command", pattern: /&&.*[;\n]/s },
  { what: "$(…) outside an assignment", pattern: /^(?![ \t]*[A-Za-z_]\w*="?(?:\$\((?:[^$`();&|\n]|\$(?!\())*\)|`[^$`();&|\n]*`)"?[ \t]*$).*(?:\$\((?!\()|`)/m },
  { what: "eval, trap or sh -c", pattern: /\b(?:eval|trap|(?:ba|da|z)?sh\s+(?:[^\s;&|]+\s+)*?-[a-z]*c[a-z]*)\b/ },
  { what: "knip --no-exit-code or --max-issues", pattern: /\bknip\b[^;&|\n]*\s--(?:no-exit-code|max-issues)\b/ },
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

/** `allows`: the one check this line is left out of; without it, every check. */
type NamedException = { where: string; line: string; reason: string; allows?: string };

/** The check of the arguments a script gives its tool (REQUIRED_SCRIPT_COMMANDS below), as a named line's `allows`. */
const OTHER_ARGUMENTS = "a tool given other arguments";

/**
 * The lines the checks below leave out, each named by its step (`step "Verify TypeScript"`)
 * or script (`script "knip"`) and its exact text, with why that is no failure going
 * unnoticed. A line changed in any way is checked again.
 */
const NAMED_EXCEPTIONS: readonly NamedException[] = [
  {
    where: 'script "test:ci"',
    line: "vitest run --exclude server/googleDriveOAuthCredentials.test.ts --exclude server/googleDriveExport.test.ts",
    allows: OTHER_ARGUMENTS,
    reason: "googleDriveOAuthCredentials.test.ts calls Google's real OAuth endpoint, which the CI must not reach; googleDriveExport.test.ts has been set aside since 6139269 (CODE-11 brings it back). Any other file left out changes the line.",
  },
];

/** What in a command lets it pass though one of its commands fails, outside the lines named for it with a reason. */
function silencersIn(command: string, where: string, silencers: readonly Silencer[], exceptions: readonly NamedException[]) {
  const named = exceptions.filter(exception => exception.where === where && exception.reason.trim());
  return silencers.filter(({ what, pattern }) => {
    const left = new Set(named.filter(exception => (exception.allows ?? what) === what).map(exception => exception.line));
    return pattern.test(unquoted(command.split("\n").map(line => (left.has(line.trim()) ? "" : line)).join("\n")).trim());
  }).map(({ what }) => what);
}

/** The words that open a construct whose commands may not run: a test's branches, a loop, a `case`. */
const CONDITIONAL_CONSTRUCTS = new Set(["if", "while", "until", "for", "select", "case"]);

/** A function's name before its body (`f()`, `function f`, `function f()`), read as `function`. */
const FUNCTION_HEADER = /(?<![^\s;&|(){}])(?:function\s+[\w.:-]+(?:\s*\(\s*\))?|[\w.:-]+\s*\(\s*\))/g;

/** A redirection, part of the simple command it follows: `2>&1`, `> check.log`, `&>> out.log`, `< /dev/null`. */
const REDIRECTION = /(?:^| )\d*(?:[<>]&|&>>?|>>|>\||<>|[<>])(?: ?[^\s<>&;|()]+)?/g;

/**
 * The simple commands a step or a script runs whenever it runs, as the shell reads them:
 * split at each operator and line, without comments, quoted text (read as '' or ""), the
 * keywords before a command (`then`, `!`…), its redirections (`2>&1`) nor repeated spaces.
 * Those within an `if`, a loop, a `case` or a function's body are left out, since they may
 * never run (`if [ -n "$NEVER" ]; then pnpm check; fi`, `f() { pnpm check; }`); those
 * within a group, a subshell or `$(…)` run.
 */
function simpleCommands(command: string) {
  const commands: string[] = [];
  // The constructs open around the current command: a keyword above, `function`, `{` or `(`.
  const open: string[] = [];
  // A function's name was just read: the `{` that follows opens its body.
  let functionHeader = false;
  for (const part of unquoted(command).replace(FUNCTION_HEADER, "function").split(/(\|\||&&|;;|(?<![<>&|])&(?![&>])|[;|\n()])/)) {
    // A `)` that closes no `(` ends a `case` pattern.
    if (part === "(") open.push("(");
    if (part === ")" && open.at(-1) === "(") open.pop();
    const words = /^(?:\|\||&&|;;|[&;|\n()])$/.test(part) ? [] : part.trim().split(/\s+/).filter(Boolean);
    while (words.length) {
      const word = words[0]!;
      if (word === "{") open.push(functionHeader ? "function" : "{");
      else if (["fi", "done", "esac", "}"].includes(word)) open.pop();
      else if (CONDITIONAL_CONSTRUCTS.has(word)) {
        open.push(word);
        // What follows `for`, `select` or `case` on its line names no command: `for x in a b`, `case $x in`.
        if (!["if", "while", "until"].includes(word)) words.length = 1;
      } else if (!["function", "then", "do", "else", "elif", "time", "!"].includes(word)) break;
      functionHeader = word === "function";
      words.shift();
    }
    const simple = words.join(" ").replace(REDIRECTION, "").trim();
    if (simple && open.every(construct => construct === "{" || construct === "(")) commands.push(simple);
    if (simple) functionHeader = false;
  }
  return commands;
}

/**
 * The commands the quality job must run, each a simple command one of its steps runs
 * whenever it runs, whole: not an argument (`echo pnpm check`), a comment (`true # pnpm
 * check`), given other arguments (`pnpm check --help`, passed on to the script) nor
 * within an `if`, a loop or a function.
 */
const REQUIRED_STEP_COMMANDS = [
  "pnpm install --frozen-lockfile",
  "pnpm check",
  "pnpm test:ci",
  "pnpm build",
  "node scripts/check-performance-budgets.mjs",
  "node scripts/smoke-built-server.mjs",
  "node scripts/check-migrations-in-sync.mjs",
  "git diff --exit-code -- drizzle/pg",
  "pnpm knip",
];

/** A tool and the only options a script may give it: a pattern of what follows the tool, read as simpleCommands reads it. */
type ScriptTool = { command: string; options: RegExp };

/**
 * The tool each package.json script those steps run must run, after its variables
 * (`NODE_ENV=production vite build`), itself or through a script it runs alone
 * (`"check": "pnpm run typecheck"`): as is, or with the options listed here, which change
 * how it reports, not what it checks. Any other argument fails, as most make it check
 * less: another configuration (`tsc -p tsconfig.empty.json`, `vitest -c`, `knip
 * --config`), part of the project (`vitest run server/x.test.ts`, `--shard`, `-t`,
 * `--changed`, `knip --exclude`, `--workspace`), types left unchecked (`tsc --noCheck`,
 * `--listFilesOnly`), a reporter of the project's own (`--reporter ./quiet.mjs`), the help,
 * the version or the configuration printed instead. What `node -e '…'` or a script in a
 * file of its own (`node scripts/check-performance-budgets.mjs`) runs cannot be read here:
 * such a script is neither covered nor refused, only the steps that run it.
 */
const REQUIRED_SCRIPT_COMMANDS: Readonly<Record<string, ScriptTool>> = {
  check: { command: "tsc --noEmit", options: /^(?: (?:(?:-p|--project)[ =](?:\.\/?|(?:\.\/)?tsconfig\.json)|--pretty))*$/ },
  "test:ci": { command: "vitest run", options: /^(?: --reporter[ =](?:default|verbose|dot|tap|tap-flat|junit|json|github-actions|hanging-process))*$/ },
  build: { command: "vite build", options: /^$/ },
  knip: { command: "knip", options: /^(?: --no-progress| --reporter[ =](?:symbols|compact|codeowners|disclosure|markdown|codeclimate|json|github-actions))*$/ },
};

/** Whether a simple command runs this tool, after its variable assignments, with only the options listed for it, or any on a line named for it. */
function runsTool(simple: string, { command, options }: ScriptTool, anyArguments: boolean) {
  const bare = simple.replace(/^(?:[A-Za-z_]\w*=\S*\s+)*/, "");
  if (bare !== command && !bare.startsWith(`${command} `)) return false;
  return anyArguments || options.test(bare.slice(command.length));
}

/** The script a simple command runs given nothing to pass on to it: `pnpm typecheck`, `pnpm run typecheck`, `npm run typecheck`, `yarn typecheck`. */
const scriptRunAlone = (simple: string) =>
  /^(?:(?:pnpm|yarn)(?: (?:-s|--silent))*(?: run)?|npm(?: (?:-s|--silent))* run(?:-script)?)(?: (?:-s|--silent))* ([^\s-]\S*)$/.exec(simple)?.[1];

/** Whether this script runs the tool, itself or through a script it runs alone; on its line named for it, with any arguments. */
function scriptRunsTool(name: string, tool: ScriptTool, scripts: Record<string, string>, exceptions: readonly NamedException[], seen = new Set<string>()): boolean {
  if (seen.has(name) || !Object.hasOwn(scripts, name)) return false;
  seen.add(name);
  const script = scripts[name]!;
  const named = exceptions.some(exception => exception.where === `script "${name}"` && exception.reason.trim()
    && exception.line === script.trim() && (exception.allows ?? OTHER_ARGUMENTS) === OTHER_ARGUMENTS);
  return simpleCommands(script).some(simple => {
    const other = scriptRunAlone(simple);
    return runsTool(simple, tool, named) || (other !== undefined && scriptRunsTool(other, tool, scripts, exceptions, seen));
  });
}

/**
 * The conditions a quality step after the build may run under besides none, so that each
 * check reports even when another fails. Any other one (`${{ !true }}`, `failure()`,
 * `github.event_name == 'never'`) could skip a check without failing the job, and so does
 * this one before the build or on it, where `steps.build` has no outcome yet.
 */
const STEP_CONDITIONS: readonly string[] = [AFTER_BUILD];

/** The package.json scripts a command runs, as `pnpm <script>`, `pnpm run <script>`, `yarn <script>` or `npm run <script>`, then those they run in turn. */
function scriptsRun(command: string, scripts: Record<string, string>, found = new Map<string, string>()) {
  for (const [, name] of unquoted(command).matchAll(/\b(?:(?:pnpm|yarn)(?:\s+-\S+)*\s+(?:run\s+(?:-\S+\s+)*)?|npm(?:\s+-\S+)*\s+run(?:-script)?\s+(?:-\S+\s+)*)([^\s;&|()<>]+)/g)) {
    if (!name || !Object.hasOwn(scripts, name) || found.has(name)) continue;
    found.set(name, scripts[name]!);
    scriptsRun(scripts[name]!, scripts, found);
  }
  return found;
}

/**
 * Code loaded into each node process (`--require`, `--import`): NODE_OPTIONS, or the
 * node-options pnpm and npm read from the environment (npm_config_node_options) or from
 * their configuration (`node-options=` in .npmrc, `nodeOptions:` in pnpm-workspace.yaml).
 */
const NODE_OPTIONS = /node[-_]?options/i;

/**
 * No step of the quality job, nor any package.json script it runs, may pass whatever its
 * command does; nor may the configuration files pnpm reads (`configs`, by name) load code
 * into it.
 */
function expectNoNeutralizedStep(workflow: string, packageJson: string, exceptions = NAMED_EXCEPTIONS, configs: Readonly<Record<string, string>> = {}) {
  const steps = jobSteps(workflow, "quality");
  expect(steps.length).toBeGreaterThanOrEqual(10);
  const quality = workflow.slice(workflow.indexOf("\n  quality:\n"), workflow.indexOf("\n  dependency-audit:\n"));
  expect(quality).not.toMatch(/^ {4}continue-on-error:/m);
  // Without `shell:`, GitHub runs `bash -e {0}`, and `shell: bash` adds pipefail; any
  // other shell (`bash {0}`, `sh`…, set in a step or in `defaults:`) would let a failed
  // command go on to the next one unnoticed.
  expect(workflow).not.toMatch(/^ *shell:(?! *bash *$)/m);
  // Nor a condition on the whole job, nor code loaded into each node process (--require, --import).
  expect(quality).not.toMatch(/^ {4}if:/m);
  expect(workflow, "NODE_OPTIONS").not.toMatch(NODE_OPTIONS);
  for (const [file, config] of Object.entries(configs)) expect(config, file).not.toMatch(NODE_OPTIONS);
  // `steps.build` has an outcome only once the step with that id has run.
  const build = steps.findIndex(step => step.keys.id?.trim() === "build");
  for (const [index, step] of steps.entries()) {
    expect(step.keys.shell?.trim() ?? "bash", step.name).toBe("bash");
    expect(step.keys["continue-on-error"] ?? "false", step.name).toBe("false");
    expect(silencersIn(step.run, `step "${step.name}"`, STEP_SILENCERS, exceptions), step.name).toEqual([]);
    expect(pipesWithoutPipefail(step), step.name).toEqual([]);
    // GitHub replaces an expression before the shell reads the command: `pnpm check ${{ '||' }} true`.
    expect(step.run, step.name).not.toContain("${{");
    // A quoted condition (`'false'`, `"${{ false }}"`) is read without its YAML quotes, as GitHub reads it.
    const condition = step.keys.if?.trim();
    if (condition !== undefined) expect(build >= 0 && index > build ? STEP_CONDITIONS : [], step.name).toContain(condition);
  }
  const commands = steps.flatMap(step => simpleCommands(step.run));
  for (const command of REQUIRED_STEP_COMMANDS) expect(commands, command).toContain(command);
  const scripts = (JSON.parse(packageJson) as { scripts?: Record<string, string> }).scripts ?? {};
  for (const [name, script] of scriptsRun(steps.map(step => step.run).join("\n"), scripts)) {
    expect(silencersIn(script, `script "${name}"`, SCRIPT_SILENCERS, exceptions), `script "${name}"`).toEqual([]);
    expect(script, `script "${name}"`).not.toMatch(NODE_OPTIONS);
    const tool = REQUIRED_SCRIPT_COMMANDS[name];
    if (tool) expect(scriptRunsTool(name, tool, scripts, exceptions), `script "${name}": ${tool.command}`).toBe(true);
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
  "test:ci": "vitest run",
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
    const configFiles = [".npmrc", "pnpm-workspace.yaml"].filter(file => existsSync(path.join(root, file)));
    const configs = Object.fromEntries(await Promise.all(configFiles.map(async file => [file, await read(file)] as const)));
    expectNoNeutralizedStep(workflow, packageJson, NAMED_EXCEPTIONS, configs);
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
    // A quoted command is the one GitHub runs once YAML has read its quotes, and is refused when silenced.
    const quoted = (value: string) => jobSteps(changed(tests, `        run: ${value}\n`), "quality").find(step => step.name === "Run test suite")?.run;
    expect(quoted("'echo ''ok'' && pnpm test:ci' # a comment")).toBe("echo 'ok' && pnpm test:ci\n");
    expect(quoted('"echo \\"ok\\" \\\\ && pnpm test:ci"')).toBe('echo "ok" \\ && pnpm test:ci\n');
    expect(() => quoted("'pnpm test:ci")).toThrow(/unreadable quoted value: 'pnpm test:ci$/);
    expect(() => quoted('"pnpm test:ci\\x20"')).toThrow(/unreadable quoted value/);
    for (const value of ["'pnpm test:ci || true'", '"pnpm test:ci || true"', '"if pnpm test:ci; then :; fi"']) {
      expect(() => expectNoNeutralizedStep(changed(tests, `        run: ${value}\n`), fixturePackageJson()), value).toThrow(/^Run test suite: /);
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
      ["set +o errexit\npnpm knip", ["set +e or shopt -u errexit"]],
      ["set -x +e\npnpm check", ["set +e or shopt -u errexit"]],
      ["set -eu +o pipefail\npnpm check | tee check.log", ["set +e or shopt -u errexit"]],
      ["set -o pipefail +e\npnpm check", ["set +e or shopt -u errexit"]],
      ["set -euo pipefail +o errexit\npnpm check", ["set +e or shopt -u errexit"]],
      ["shopt -uo errexit\npnpm check", ["set +e or shopt -u errexit"]],
      ["shopt -u -o pipefail\npnpm check | tee check.log", ["set +e or shopt -u errexit"]],
      ["if pnpm check; then :; fi", ["a command as a condition"]],
      ["until pnpm check; do break; done", ["a command as a condition"]],
      ["if [ -d . ]; pnpm check; then :; fi", ["a command as a condition"]],
      ["while [ -d . ]\n  pnpm check\ndo break; done", ["a command as a condition"]],
      ["! pnpm check", ["!"]],
      ["pnpm check &", ["& or coproc"]],
      ["coproc pnpm check", ["& or coproc"]],
      ["pnpm check && echo typed\npnpm test:ci", ["&& before another command"]],
      ['echo "$(pnpm test:ci)"', ["$(…) outside an assignment"]],
      ['export OUT="$(pnpm test:ci)"', ["$(…) outside an assignment"]],
      ["echo `pnpm check`", ["$(…) outside an assignment"]],
      ['typed="$(pnpm check; true)"', ["$(…) outside an assignment"]],
      ['OUT="$(pnpm test:ci)" echo done', ["$(…) outside an assignment"]],
      ["bash -c 'pnpm check || true'", ["eval, trap or sh -c"]],
      ["bash -ce 'pnpm test:ci || true'", ["eval, trap or sh -c"]],
      ["bash -o pipefail -c 'pnpm test:ci || true'", ["eval, trap or sh -c"]],
      ['eval "pnpm check; exit 0"', ["eval, trap or sh -c"]],
      ["trap 'exit 0' EXIT\npnpm test:ci", ["eval, trap or sh -c"]],
      ["pnpm knip --no-exit-code", ["knip --no-exit-code or --max-issues"]],
      ["pnpm knip --max-issues=50", ["knip --no-exit-code or --max-issues"]],
      // What `$(…)` runs is read, even within double quotes, and a line carried on by `\` is the same command.
      ['typed="$(pnpm check || true)"', ["||", "$(…) outside an assignment"]],
      ["pnpm check \\\n  || true", ["||"]],
      ["pnpm check && \\\n  pnpm test:ci", []],
      // An escaped character belongs to its word: bash runs `pnpm knip ' #' || true`.
      ["pnpm knip \\ # || true", ["||"]],
      // Neither quoted text, a comment, a redirection, a test as condition, a last `&&` list
      // nor a plain assignment, whose status is that of its `$(…)`.
      ['echo "|| true; exit 0 &" && pnpm check', []],
      ["# not || true\npnpm check 2>&1 | tee check.log", []],
      ['if [ -n "$untracked" ]; then echo "$untracked"; exit 1; fi', []],
      ["if ! [ -f dist/index.js ]; then exit 1; fi\npnpm check && pnpm test:ci", []],
      ["set -eo pipefail\nset +x\npnpm check", []],
      ['untracked="$(git status --porcelain -- "$dir" drizzle/pg)"\ntyped=`pnpm check`', []],
    ];
    for (const [command, found] of steps) expect(inStep(command), command).toEqual(found);
    // A script keeps only its last command's status, and that of a pipe's last command.
    const scripts: [string, string[]][] = [
      ["knip || true", ["||"]],
      ["knip; exit 0", ["exit 0", "; or a second line"]],
      ["knip\necho done", ["; or a second line"]],
      ["knip | tee knip.log", ["|"]],
      ["echo $(knip)", ["$(…) outside an assignment"]],
      ["knip --no-exit-code", ["knip --no-exit-code or --max-issues"]],
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
    expect([...scriptsRun("npm run --silent check && yarn knip", FIXTURE_SCRIPTS).keys()]).toEqual(["check", "knip"]);
    expect(verify(FIXTURE_WORKFLOW)).not.toThrow();
    // knip exits 0 whatever it finds, in the script the step runs or in one that script runs.
    expect(verify(FIXTURE_WORKFLOW, { knip: "knip || true" })).toThrow(/^script "knip": /);
    expect(verify(changed(knip, "        run: 'pnpm knip'\n"), { knip: "knip || true" })).toThrow(/^script "knip": /);
    expect(verify(FIXTURE_WORKFLOW, { knip: "pnpm run knip:files", "knip:files": "knip; exit 0" })).toThrow(/^script "knip:files": /);
    expect(verify(FIXTURE_WORKFLOW, { check: "npm run typecheck", typecheck: "tsc --noEmit || true" })).toThrow(/^script "typecheck": /);
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

  it("refuse une expression ${{ }} dans un run, un if: ailleurs qu'après le build, une commande requise lue comme texte ou qui peut ne pas tourner, et NODE_OPTIONS (CODE-14)", () => {
    const check = "        run: pnpm check\n";
    const tests = "        run: pnpm test:ci\n";
    const budgets = "        run: node scripts/check-performance-budgets.mjs\n";
    const verify = (workflow: string, scripts: Record<string, string> = {}, exceptions?: readonly NamedException[], configs?: Record<string, string>) => () =>
      expectNoNeutralizedStep(workflow, fixturePackageJson(scripts), exceptions, configs);
    // GitHub replaces the expression before bash reads the command: `pnpm check || true`.
    expect(verify(changed(check, "        run: pnpm check ${{ '||' }} true\n"))).toThrow(/^Verify TypeScript: /);
    // A condition other than the one after the build can skip the step without failing the job.
    for (const condition of ["${{ !true }}", "failure()", "github.event_name == 'never'", "always() && false", `"${AFTER_BUILD} && false"`]) {
      expect(verify(changed(tests, `        if: ${condition}\n${tests}`)), condition).toThrow(/^Run test suite: /);
    }
    expect(verify(changed("    timeout-minutes: 20\n", "    timeout-minutes: 20\n    if: github.event_name == 'never'\n"))).toThrow();
    // The one after the build, only after it: before it, or on it, `steps.build` has no
    // outcome yet, the condition is false and the step skipped.
    expect(verify(changed(budgets, `        if: ${AFTER_BUILD}\n${budgets}`))).not.toThrow();
    expect(verify(changed(tests, `        if: ${AFTER_BUILD}\n${tests}`))).toThrow(/^Run test suite: /);
    expect(verify(changed(check, `        if: ${AFTER_BUILD}\n${check}`))).toThrow(/^Verify TypeScript: /);
    expect(verify(changed("        id: build\n", `        id: build\n        if: ${AFTER_BUILD}\n`))).toThrow(/^Verify production build: /);
    expect(verify(changed("        id: build\n", ""))).toThrow(/^Start the built server: /);
    // A required command that only appears as text, a comment or with other arguments is never run;
    // nor may it be, within an `if`, a loop, a `case` or a function never called.
    for (const run of [
      "echo pnpm check",
      "true # pnpm check",
      "pnpm check --help",
      "'echo pnpm check'",
      "|\n          printf '%s' pnpm check",
      '|\n          if [ -n "$NEVER" ]; then pnpm check; fi',
      "|\n          for x in; do pnpm check; done",
      "|\n          case x in y) pnpm check;; esac",
      "|\n          f() { pnpm check; }",
      "|\n          function f {\n            pnpm check\n          }",
    ]) {
      expect(verify(changed(check, `        run: ${run}\n`)), run).toThrow(/^pnpm check: /);
    }
    expect(verify(changed("          git diff --exit-code -- drizzle/pg\n", "          echo git diff --exit-code -- drizzle/pg\n"))).toThrow(/^git diff --exit-code -- drizzle\/pg: /);
    // Followed by a comment or a redirection, one of several commands, in a group or after an `if`, it is run.
    for (const run of [
      '|\n          pnpm check # the whole project\n          echo "typed; || done"',
      "pnpm check 2>&1",
      "|\n          { pnpm check; } > check-output.log",
      "|\n          if [ -d . ]; then echo typed; fi\n          pnpm check",
    ]) {
      expect(verify(changed(check, `        run: ${run}\n`)), run).not.toThrow();
    }
    // NODE_OPTIONS loads code into every node process: in the job's or a step's env, a command, a
    // script, or as the node-options pnpm reads from the environment or its configuration.
    expect(verify(changed("      CI_DUMMY_KEY: dummy\n", "      CI_DUMMY_KEY: dummy\n      NODE_OPTIONS: --require ./ci-hook.cjs\n"))).toThrow(/^NODE_OPTIONS: /);
    expect(verify(changed("      CI_DUMMY_KEY: dummy\n", "      CI_DUMMY_KEY: dummy\n      npm_config_node_options: --require ./ci-hook.cjs\n"))).toThrow(/^NODE_OPTIONS: /);
    expect(verify(changed(tests, "        run: NODE_OPTIONS=--import=./ci-hook.mjs pnpm test:ci\n"))).toThrow(/^NODE_OPTIONS: /);
    expect(verify(FIXTURE_WORKFLOW, { "test:ci": "NODE_OPTIONS='--require ./ci-hook.cjs' vitest run" })).toThrow(/^script "test:ci": /);
    expect(verify(FIXTURE_WORKFLOW, {}, undefined, { ".npmrc": "node-options=--require ./ci-hook.cjs\n" })).toThrow(/^\.npmrc: /);
    expect(verify(FIXTURE_WORKFLOW, {}, undefined, { "pnpm-workspace.yaml": 'packages:\n  - "."\nnodeOptions: --require ./ci-hook.cjs\n' })).toThrow(/^pnpm-workspace\.yaml: /);
    expect(verify(FIXTURE_WORKFLOW, {}, undefined, { ".npmrc": "engine-strict=true\n", "pnpm-workspace.yaml": 'packages:\n  - "."\n' })).not.toThrow();
  });

  it("n'accepte d'un script lancé par le job quality que son outil, seul ou avec une option qui ne change que l'affichage, hors la ligne nommée de test:ci (CODE-14)", () => {
    const verify = (scripts: Record<string, string>, exceptions?: readonly NamedException[]) => () =>
      expectNoNeutralizedStep(FIXTURE_WORKFLOW, fixturePackageJson(scripts), exceptions);
    // A script that only names its tool, or runs another one.
    for (const scripts of [{ check: "echo tsc --noEmit" }, { check: "true # tsc --noEmit" }, { check: "tsc" }, { "test:ci": "node scripts/run-tests.mjs" }, { knip: "echo knip" }]) {
      const [name] = Object.keys(scripts);
      expect(verify(scripts), name).toThrow(new RegExp(`^script "${name}": `));
    }
    // Any other argument: another configuration, part of the project, types left unchecked,
    // a reporter of the project's own, the help, the version or the configuration printed.
    const weakened: Record<string, string[]> = {
      check: ["--noCheck", "--listFilesOnly", "--showConfig", "-v", "--help", "-p tsconfig.empty.json", "--project=tsconfig.empty.json", "-b tsconfig.empty.json"].map(option => `tsc --noEmit ${option}`),
      "test:ci": ["-c vitest.empty.config.ts", "--config=vitest.empty.config.ts", "server/ciWorkflow.test.ts", "--shard=1/50", "-t nothing", "--changed", "--dir docs", "-v", "--exclude '**' --passWithNoTests", "--reporter ./quiet-reporter.mjs"].map(option => `vitest run ${option}`),
      knip: ["--exclude files,dependencies", "--directory docs", "--workspace docs", "-V", "-c knip.empty.json", "--config=knip.empty.json", "--include files", "--reporter ./quiet-reporter.mjs"].map(option => `knip ${option}`),
      build: ["vite build --config vite.empty.config.ts"],
    };
    for (const [name, scripts] of Object.entries(weakened)) {
      for (const script of scripts) expect(verify({ [name]: script }), script).toThrow(new RegExp(`^script "${name}": `));
    }
    // The options that only change how it reports, its variables, and the project's own configuration.
    for (const scripts of [
      { check: "tsc --noEmit -p tsconfig.json --pretty" },
      { check: "tsc --noEmit --project ./tsconfig.json" },
      { "test:ci": "vitest run --reporter=dot" },
      { knip: "knip --reporter compact --no-progress" },
      { build: "NODE_ENV=production vite build && esbuild server/index.ts --outfile=api/index.js" },
    ]) {
      expect(verify(scripts), JSON.stringify(scripts)).not.toThrow();
    }
    // Through another script run alone, the tool itself still has to run, given nothing more.
    expect(verify({ check: "pnpm run typecheck", typecheck: "tsc --noEmit" })).not.toThrow();
    expect(verify({ check: "pnpm run typecheck", typecheck: "echo tsc --noEmit" })).toThrow(/^script "check": /);
    expect(verify({ check: "pnpm run typecheck --noCheck", typecheck: "tsc --noEmit" })).toThrow(/^script "check": /);
    // The exclusions of test:ci pass on their exact line, named with its reason, and for that check only.
    const real = { "test:ci": NAMED_EXCEPTIONS[0]!.line };
    expect(verify(real)).not.toThrow();
    expect(verify(real, [])).toThrow(/^script "test:ci": /);
    expect(verify(real, [{ ...NAMED_EXCEPTIONS[0]!, allows: "||" }])).toThrow(/^script "test:ci": /);
    expect(verify(real, [{ ...NAMED_EXCEPTIONS[0]!, reason: " " }])).toThrow(/^script "test:ci": /);
    expect(verify({ "test:ci": `${real["test:ci"]} --passWithNoTests` })).toThrow(/^script "test:ci": /);
    expect(verify({ "test:ci": `${real["test:ci"]} || true` })).toThrow(/^script "test:ci": /);
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

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createVitest, parseCLI } from "vitest/node";
import { LOCKED_PACKAGES_MESSAGE, lockedPackagesProblems } from "../scripts/check-locked-packages.mjs";

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
 * that follows. Only `with:` and `env:` may hold more indented lines of their own,
 * each `key: value` one of its entries, kept as the step's key `with.<key>` or
 * `env.<key>`. A line this layout does not explain, such as a value carried on to
 * a more indented line, fails the test rather than being skipped.
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
  // The mapping the last key read opens (`with:`, `env:`), whose entries are on the more indented lines.
  let mapping: string | null = null;
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
      const item = mapping ? /^ {10}([\w-]+):\s?(.*)$/.exec(line) : null;
      if (!item) throw new Error(`ci.yml: unexpected line in ${job}: ${line}`);
      steps.at(-1)!.keys[`${mapping}.${item[1]}`] = yamlValue(item[2]!);
      continue;
    }
    const [, marker, key, value] = entry;
    if (marker === "- ") steps.push({ name: "", keys: {}, run: "" });
    const step = steps.at(-1)!;
    mapping = value === "" && (key === "with" || key === "env") ? key : null;
    if (mapping) continue;
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

/** A function's name before its body (`f()`, `function f`, `function f()`), read as `function`. */
const FUNCTION_HEADER = /(?<![^\s;&|(){}])(?:function\s+[\w.:-]+(?:\s*\(\s*\))?|[\w.:-]+\s*\(\s*\))/g;

/**
 * What lets a step pass under `bash -e` though one of its commands fails: bash does not
 * stop on a command tested by `||`, `&&`, `!`, `if`, `while` or `until`, nor wait for one
 * sent to the background (`&`, `coproc`), nor look at what `$(…)` returns outside a plain
 * assignment (`echo "$(…)"`, `export X="$(…)"`); and -e does not reach inside `$(…)`, so an
 * assignment's holds one command. Only a test (`[ … ]`, `[[ … ]]`, `test`) may be a
 * condition, alone before its `then` or `do`, and an `&&` list only the step's last command,
 * whose status is the step's. A command given as quoted text (`eval`, `trap`, `bash -c`) is
 * refused, since quoted text is not read, and so is knip told to exit 0 whatever it finds.
 * Nor may a command name run another program than its own: a function, called or not, an
 * alias (`shopt -s expand_aliases; alias pnpm=true`), `hash -p /bin/true pnpm`, or a file
 * sourced, which may define them, before `pnpm check`.
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
  { what: "a function, an alias, hash -p or source", pattern: new RegExp(`${FUNCTION_HEADER.source}|(?:^|[;&|({]|\\b(?:then|do|else)\\b)\\s*(?:alias\\s|hash\\s+(?:-\\S+\\s+)*-[a-z]*p|(?:source|\\.)\\s)`, "m") },
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
 * The command that runs this check alone, with a configuration of its own
 * (scripts/ci-workflow.vitest.config.mjs): a vitest.config.ts leaving it out of the suite,
 * or running code before the tests (a globalSetup ending the run with success), neither
 * keeps it from running nor runs before it, and it then refuses that vitest.config.ts.
 * vitest runs by its file: `pnpm vitest` would run a script « vitest » of package.json
 * instead, and `pnpm exec` loads into node the node-options of .npmrc or
 * pnpm-workspace.yaml (`--require ./ci.cjs` exiting with 0), before this check.
 */
const GUARD_COMMAND = "node node_modules/vitest/vitest.mjs run server/ciWorkflow.test.ts --config scripts/ci-workflow.vitest.config.mjs --passWithNoTests=false";

/**
 * The install, which runs no code of the repository: neither the project's install
 * scripts (`postinstall`) nor a pnpmfile, which would run before the step « Check this
 * workflow » refuses them and could change what it runs (node_modules/.bin/vitest, a
 * BASH_ENV written to $GITHUB_ENV that every next step's bash reads first).
 */
const INSTALL_COMMAND = "pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile";

/** What the step « Check this workflow » runs before vitest, and whose text ci.yml pins by its digest: changing it means changing ci.yml. */
const GUARD_PINNED_FILES = ["scripts/check-locked-packages.mjs", "scripts/ci-workflow.vitest.config.mjs"];

/** A line of that step: sha256sum compares the file with the digest ci.yml writes, and fails the step when they differ. */
const pinnedDigestCheck = (file: string, text = readFileSync(path.join(root, file))) =>
  `sha256sum --check --strict <<< "${createHash("sha256").update(text).digest("hex")}  ${file}"`;

/**
 * The step « Check this workflow », right after the install: the digests of what it runs
 * before vitest, the packages installed checked as the registry's (CODE-14), then this check.
 */
const GUARD_STEP_RUN = [...GUARD_PINNED_FILES.map(file => pinnedDigestCheck(file)), "node scripts/check-locked-packages.mjs", GUARD_COMMAND].join("\n");

/**
 * The commands the quality job must run, each a simple command one of its steps runs
 * whenever it runs, whole: not an argument (`echo pnpm check`), a comment (`true # pnpm
 * check`), given other arguments (`pnpm check --help`, passed on to the script) nor
 * within an `if`, a loop or a function.
 */
const REQUIRED_STEP_COMMANDS = [
  INSTALL_COMMAND,
  "node scripts/check-locked-packages.mjs",
  GUARD_COMMAND,
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
 * The pnpm and npm settings that change how a script runs: in another shell than sh
 * (script-shell, `script-shell=/bin/true` running none of them; shell-emulator) or not at
 * all (ignore-scripts), whether in their configuration (`.npmrc`, `pnpm-workspace.yaml` in
 * camelCase), set by a command (`pnpm config set`) or an option; and any npm_config_ or
 * pnpm_config_ variable, any case, in the workflow's, a job's or a step's env:, each one a
 * setting of every pnpm command (npm_config_script_shell, npm_config_userconfig…).
 */
const SCRIPT_SETTINGS = /script[-_]?shell|shell[-_]?emulator|ignore[-_]?scripts|\bp?npm_config_/i;

/**
 * What changes the variables the next steps run with, or where they look for a command: a
 * line written to $GITHUB_ENV or $GITHUB_PATH, the workflow commands GitHub disabled
 * (::set-env, ::add-path); and, within a step or a script, a PATH of its own (`export
 * PATH=./bin:$PATH`, `PATH:` in an env:) or a BASH_ENV file bash loads before the command.
 */
const ENVIRONMENT_CHANGES = /\bGITHUB_(?:ENV|PATH)\b|::(?:set-env|add-path)\b|\bACTIONS_ALLOW_UNSECURE_COMMANDS\b|\bBASH_ENV\b|(?:^|[\s;&|(])PATH[:=]/m;

/**
 * No step of the quality job, nor any package.json script it runs, may pass whatever its
 * command does; nor may the configuration files pnpm reads (`configs`, by name) load code
 * into it or change how it runs a script.
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
  // The install's own --ignore-scripts, which runs no script of the repository before this check (INSTALL_COMMAND), is the one allowed.
  expect(workflow.split("\n").filter(line => line.trim() !== `run: ${INSTALL_COMMAND}`).join("\n"), "script settings").not.toMatch(SCRIPT_SETTINGS);
  expect(workflow, "environment changes").not.toMatch(ENVIRONMENT_CHANGES);
  for (const [file, config] of Object.entries(configs)) {
    expect(config, file).not.toMatch(NODE_OPTIONS);
    expect(config, file).not.toMatch(SCRIPT_SETTINGS);
  }
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
    expect(script, `script "${name}"`).not.toMatch(SCRIPT_SETTINGS);
    expect(script, `script "${name}"`).not.toMatch(ENVIRONMENT_CHANGES);
    const tool = REQUIRED_SCRIPT_COMMANDS[name];
    if (tool) expect(scriptRunsTool(name, tool, scripts, exceptions), `script "${name}": ${tool.command}`).toBe(true);
  }
}

/** The keys of ci.yml at its root: neither an `env:` nor a `defaults:` of the whole workflow. */
const WORKFLOW_KEYS = ["name", "on", "permissions", "concurrency", "jobs"];

/**
 * The quality job's own keys, and each variable of its `env:` as `env.<NAME>`: dummy values
 * the tests read, the external tests left off. No `container:`, `defaults:`, `services:`
 * nor variable of a setting (`npm_config_script_shell`) besides: a PostgreSQL service for
 * the tests (CODE-14) is added here, with the job.
 */
const QUALITY_JOB: Readonly<Record<string, string>> = {
  name: "TypeScript and test suite",
  "runs-on": "ubuntu-latest",
  "timeout-minutes": "20",
  env: "",
  "env.RESEND_API_KEY": "re_test_dummy_key_12345678",
  "env.STRIPE_SECRET_KEY": "sk_test_51N9oXjDummyKeyForContinuousIntegration000000",
  "env.TURNSTILE_SECRET_KEY": "1x00000000000000000000AA",
  "env.CANDIDATE_AUTH_PEPPER": "dummy_pepper_for_ci_testing_32_chars_long",
  "env.CANDIDATE_DOCUMENT_ENCRYPTION_KEY": "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
  "env.JWT_SECRET": "dummy_jwt_secret_for_ci_testing_32_chars_long",
  "env.GOOGLE_DRIVE_CLIENT_ID": "dummy_client_id",
  "env.GOOGLE_DRIVE_CLIENT_SECRET": "dummy_client_secret",
  "env.GOOGLE_DRIVE_CV_FOLDER_ID": "dummy_ci_folder_id",
  "env.RUN_EXTERNAL_SECURITY_TESTS": "false",
  steps: "",
};

/**
 * Its steps in this order, each with all its keys as jobSteps reads them (a `with:` entry
 * as `with.<key>`), a `run` of several lines with one command a line: no `env:` of a step,
 * no `with:` but Node's version and cache (not `ref:` checking out another commit).
 */
const QUALITY_STEPS: readonly Readonly<Record<string, string>>[] = [
  { name: "Check out source", uses: "actions/checkout@v4" },
  { name: "Set up pnpm", uses: "pnpm/action-setup@v4" },
  { name: "Set up Node.js", uses: "actions/setup-node@v4", "with.node-version-file": ".nvmrc", "with.cache": "pnpm" },
  { name: "Install dependencies", run: INSTALL_COMMAND },
  { name: "Check this workflow", run: GUARD_STEP_RUN },
  { name: "Verify TypeScript", run: "pnpm check" },
  { name: "Run test suite", run: "pnpm test:ci" },
  { name: "Verify production build", id: "build", run: "pnpm build" },
  { name: "Check performance budgets", run: "node scripts/check-performance-budgets.mjs" },
  { name: "Start the built server", if: AFTER_BUILD, run: "node scripts/smoke-built-server.mjs" },
  {
    name: "Verify migrations match the schema",
    if: AFTER_BUILD,
    run: [
      "node scripts/check-migrations-in-sync.mjs",
      "git diff --exit-code -- drizzle/pg",
      'untracked="$(git status --porcelain --untracked-files=all -- drizzle/pg)"',
      'if [ -n "$untracked" ]; then echo "$untracked"; exit 1; fi',
    ].join("\n"),
  },
  { name: "Find unused files and dependencies", if: AFTER_BUILD, run: "pnpm knip" },
];

/** The package.json scripts these steps run, each as it is: test:ci with the two files named above. */
const QUALITY_SCRIPTS: Readonly<Record<string, string>> = {
  check: "tsc --noEmit",
  "test:ci": "vitest run --exclude server/googleDriveOAuthCredentials.test.ts --exclude server/googleDriveExport.test.ts",
  build: `NODE_ENV=production vite build && tsx scripts/prerender-route-seo.ts && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist && esbuild server/vercelEntry.ts --platform=node --packages=external --bundle --format=esm --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" --outfile=api/index.js`,
  knip: "knip",
};

/**
 * The scripts pnpm runs by itself around those, which no step shows: those of the project's
 * install, and the pre and post scripts of each one (run with enable-pre-post-scripts). None
 * may be set.
 */
const QUALITY_HOOKS = ["pnpm:devPreinstall", "preinstall", "install", "postinstall", "preprepare", "prepare", "postprepare", ...Object.keys(QUALITY_SCRIPTS).flatMap(name => [`pre${name}`, `post${name}`])];

/**
 * The keys of the workflow at its root, or of one of its jobs (`job`), each with its value,
 * and an entry of the job's `env:` as `env.<NAME>`. The lines of another key (`on:`,
 * `steps:`…) are its own; a line this layout does not explain fails the test.
 */
function workflowKeys(workflow: string, job?: string) {
  const lines = workflow.split("\n");
  const start = job ? lines.indexOf(`  ${job}:`) : -1;
  if (job) expect(start, `job ${job}`).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((line, index) => index > start && job !== undefined && /^ {0,2}\S/.test(line));
  const indent = job ? 4 : 0;
  const keys: Record<string, string> = {};
  let key = "";
  for (const line of lines.slice(start + 1, end < 0 ? undefined : end)) {
    const at = line.search(/\S/);
    if (at < 0 || line.trim().startsWith("#") || (at > indent && key !== "env")) continue;
    const entry = (at === indent ? /^ *([\w-]+):\s?(.*)$/ : at === indent + 2 ? /^ *([A-Za-z_]\w*):\s?(.*)$/ : null)?.exec(line);
    if (!entry) throw new Error(`ci.yml: unexpected line ${job ? `in ${job}` : "at the root"}: ${line}`);
    if (at === indent) key = entry[1]!;
    keys[at === indent ? key : `env.${entry[1]}`] = yamlValue(entry[2]!);
  }
  return keys;
}

/**
 * The quality job runs what is listed above, as it is, and pnpm the scripts listed. A list
 * of what may not run is always got round (`builtin alias pnpm=true`, `BASH_CMDS[pnpm]=/bin/true`,
 * `printf -v PATH`, a link from node_modules/.bin/tsc to /bin/true, a pnpm rc written in the
 * home directory, a script `ln -s … && tsc --noEmit`): any change of what the job or those
 * scripts run is a change of these lists, read in review. The checks above refuse in turn a
 * listed change that silences a check.
 */
function expectQualityJobAsListed(workflow: string, packageJson: string) {
  expect(Object.keys(workflowKeys(workflow)).sort(), "ci.yml: keys of the workflow").toEqual([...WORKFLOW_KEYS].sort());
  expect(workflowKeys(workflow, "quality"), "ci.yml: keys of the quality job").toEqual(QUALITY_JOB);
  const steps = jobSteps(workflow, "quality").map(({ keys }) => (keys.run === undefined ? keys : { ...keys, run: keys.run.replace(/\n$/, "") }));
  expect(steps, "ci.yml: steps of the quality job").toEqual(QUALITY_STEPS);
  const scripts = (JSON.parse(packageJson) as { scripts?: Record<string, string> }).scripts ?? {};
  const run = Object.fromEntries(scriptsRun(QUALITY_STEPS.map(step => step.run ?? "").join("\n"), scripts));
  expect(run, "package.json: scripts the quality job runs").toEqual(QUALITY_SCRIPTS);
  expect(QUALITY_HOOKS.filter(hook => Object.hasOwn(scripts, hook)), "package.json: scripts pnpm runs by itself").toEqual([]);
}

/** The files of these directories and of the directories within them, relative to the root, with `/` between their parts. */
const filesIn = (...directories: string[]) => directories.flatMap(directory =>
  readdirSync(path.join(root, directory), { recursive: true, encoding: "utf8" }).map(file => `${directory}/${file.split(path.sep).join("/")}`));

/** A path relative to the root, with `/` between its parts. */
const fromRoot = (file: string) => path.relative(root, file).split(path.sep).join("/");

const TEST_FILE = /\.(?:test|spec)\.tsx?$/;

/** The test files of the repository: those of server/ and client/. */
const repositoryTests = () => filesIn("server", "client").filter(file => TEST_FILE.test(file));

/** Its source files, tests aside: the TypeScript of client/src, server and shared. */
const repositorySources = () => filesIn("client/src", "server", "shared").filter(file => /\.tsx?$/.test(file) && !TEST_FILE.test(file));

/** A JSON file as TypeScript reads tsconfig.json, and knip its knip.json: comments and trailing commas allowed. */
function readJsonWithComments(file: string, text: string) {
  const { config, error } = ts.parseConfigFileTextToJson(file, text);
  if (error) throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`);
  return config as Record<string, unknown>;
}

/**
 * The configuration vitest reads (vitest.config.ts, which no step's command shows; `config`,
 * a file of its own, in the test of this check) runs every test file of server/ and client/,
 * under any name: not `exclude: ['**']`, `include: []`, nor a `testNamePattern`, as
 * `vitest run -t` is refused above. The files are those vitest itself finds with it, and
 * `passWithNoTests` is refused too. One that leaves out this file never runs this check in
 * the suite: the step « Check this workflow » runs it all the same (guardStepRun below). The
 * project's configuration is compared with its listed text before vitest loads it here, so
 * that code added to it never runs in this check.
 */
async function expectVitestRunsEveryTest(config?: string) {
  if (config === undefined) expectVitestConfigAsListed(readFileSync(path.join(root, "vitest.config.ts"), "utf8"), readdirSync(root));
  const vitest = await createVitest("test", { root, config, watch: false }, { server: { watch: null } });
  try {
    const run = new Set((await vitest.globTestSpecifications()).map(specification => fromRoot(specification.moduleId)));
    expect(repositoryTests().filter(file => !run.has(file)), "vitest: test files left out").toEqual([]);
    expect(vitest.config.testNamePattern, "vitest: testNamePattern").toBeUndefined();
    expect(vitest.config.passWithNoTests ?? false, "vitest: passWithNoTests").toBe(false);
  } finally {
    await vitest.close();
  }
}

/**
 * What the command of the step « Check this workflow » runs: the configuration file it reads,
 * its projects (the one of its own, which leaves a workspace file unread), the test files it
 * finds, and whether it then passes with none: when it finds none and does not, vitest exits
 * 1 and the job fails.
 */
async function guardStepRun() {
  const { filter, options } = parseCLI(GUARD_COMMAND.replace(/^node node_modules\/vitest\/vitest\.mjs /, "vitest "));
  const vitest = await createVitest("test", { ...options, root, watch: false }, { server: { watch: null } });
  try {
    const files = (await vitest.globTestSpecifications(filter)).map(specification => fromRoot(specification.moduleId));
    const configFile = vitest.vite.config.configFile ? fromRoot(vitest.vite.config.configFile) : null;
    return { configFile, projects: vitest.projects.map(project => project.name), files, passWithNoTests: vitest.config.passWithNoTests ?? false };
  } finally {
    await vitest.close();
  }
}

/**
 * vitest.config.ts as it is. A vitest configuration is code, which runs before any test and
 * which no step's command shows: one line of `setupFiles` making every assertion pass, or of
 * `globalSetup` exiting with 0, outside this check alone, leaves the suite and this step
 * green; so would an alias of `vitest`, an `environment`, a reporter or an exit listener of
 * its own. As for the quality job, a list of what it may not hold is got round: any change
 * of it is a change of this text, read in review (CODE-14). Nor may a workspace file, which
 * vitest reads beside it (vitest.workspace.*, vitest.projects.*), add projects of their own.
 */
const VITEST_CONFIG = `import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  // Même runtime JSX que l'application (@vitejs/plugin-react) pour les tests qui rendent des composants.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // Critical screens mounted by React with Testing Library declare \`// @vitest-environment happy-dom\`.
    // Their DOM loads no script, style sheet or frame and never navigates, so no test reaches the network.
    environmentOptions: {
      happyDOM: {
        url: "https://drahmedbenlallahom.com/",
        settings: {
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
          disableIframePageLoading: true,
          navigation: { disableMainFrameNavigation: true, disableChildFrameNavigation: true, disableChildPageNavigation: true },
        },
      },
    },
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/**/*.test.ts", "client/**/*.spec.ts"],
  },
});
`;

const VITEST_WORKSPACE_FILE = /^vitest\.(?:workspace|projects)\./;

function expectVitestConfigAsListed(config: string, rootFiles: readonly string[]) {
  expect(config, "vitest.config.ts").toBe(VITEST_CONFIG);
  expect(rootFiles.filter(file => VITEST_WORKSPACE_FILE.test(file)), "vitest: workspace files").toEqual([]);
}

/**
 * A version range of the registry (« 3.3.7 », « ^6.29.1 », « >=1 <2 »), whose package the
 * lockfile pins by its integrity: not another package under the name (`npm:`), a directory
 * of the repository (`file:`, `link:`), a git repository or an address, whose code would run
 * in place of tsc, vitest or knip once installed.
 */
const REGISTRY_VERSION = /^(?=.*\d)[\w.^~<>=|* -]+$/;

/** The settings of pnpm-workspace.yaml, and of package.json's `pnpm` field: any other is a change of these lists. */
const PNPM_WORKSPACE_KEYS = ["packages", "overrides", "allowBuilds"];
const PACKAGE_PNPM_KEYS = ["overrides"];

/**
 * What runs code of the repository during the install or changes a package's code, in any
 * of pnpm's configuration files, any case: a pnpmfile (`pnpmfile`, `global-pnpmfile`), a
 * patch of a package (`patchedDependencies`), a package's manifest extended.
 */
const PNPM_CODE_SETTINGS = /pnpmfile|patched[-_]?dependencies|package[-_]?extensions/i;

/**
 * The top-level keys of pnpm-workspace.yaml, each with its lines (no YAML library among
 * the dependencies): a line not indented opens a key, the indented ones that follow are its
 * own. A value written on the key's line, in flow style (`overrides: { … }`), is kept there.
 */
function pnpmWorkspaceSettings(workspace: string) {
  const settings: Record<string, { value: string; lines: string[] }> = {};
  let key = "";
  for (const line of workspace.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const entry = /^([\w-]+):\s*(.*)$/.exec(line);
    if (entry) settings[(key = entry[1]!)] = { value: entry[2]!.replace(/\s+#.*$/, ""), lines: [] };
    else if (key && /^\s/.test(line)) settings[key]!.lines.push(line.trim());
    else throw new Error(`pnpm-workspace.yaml: unexpected line: ${line}`);
  }
  return settings;
}

/**
 * pnpm installs what the lockfile pins, as published, and runs no code of the repository
 * while installing (CODE-14): no .pnpmfile at the root, which pnpm loads by itself, nor any
 * setting naming one; no patch of a package nor manifest extended; pnpm-workspace.yaml and
 * package.json's `pnpm` field set only what is listed above; each override (their
 * `overrides`, package.json's `resolutions`) and each dependency a registry version range.
 * A pnpmfile replacing node_modules/typescript/bin/tsc ran during the install, before the
 * frozen lockfile refused its checksum, and `pnpm check` then passed with a type error.
 */
function expectPnpmInstallsTheLockedPackages({ packageJson, workspace, npmrc, rootFiles }: { packageJson: string; workspace?: string; npmrc?: string; rootFiles: readonly string[] }) {
  expect(rootFiles.filter(file => /^\.?pnpmfile\b/i.test(file)), "pnpm: pnpmfile").toEqual([]);
  const manifest = JSON.parse(packageJson) as Record<string, unknown>;
  const pnpmField = (manifest.pnpm ?? {}) as Record<string, unknown>;
  for (const [file, text] of [[".npmrc", npmrc], ["pnpm-workspace.yaml", workspace], ["package.json: pnpm", JSON.stringify(pnpmField)]] as const) {
    if (text !== undefined) expect(text, file).not.toMatch(PNPM_CODE_SETTINGS);
  }
  expect(Object.keys(pnpmField).filter(key => !PACKAGE_PNPM_KEYS.includes(key)), "package.json: pnpm settings").toEqual([]);
  const versions: Array<[string, unknown]> = [];
  const entries = (where: string, map: unknown) => {
    for (const [name, spec] of Object.entries((map ?? {}) as Record<string, unknown>)) versions.push([`${where} ${name}`, spec]);
  };
  entries("pnpm.overrides", pnpmField.overrides);
  entries("resolutions", manifest.resolutions);
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) entries(field, manifest[field]);
  if (workspace !== undefined) {
    const settings = pnpmWorkspaceSettings(workspace);
    expect(Object.keys(settings).filter(key => !PNPM_WORKSPACE_KEYS.includes(key)), "pnpm-workspace.yaml: settings").toEqual([]);
    if (settings.packages) expect(settings.packages.lines.map(line => yamlValue(line.replace(/^-\s*/, ""))), "pnpm-workspace.yaml: packages").toEqual(["."]);
    if (settings.overrides) {
      expect(settings.overrides.value, "pnpm-workspace.yaml: overrides, one a line").toBe("");
      for (const line of settings.overrides.lines) {
        const override = /^('[^']*'|"[^"]*"|[^\s'"][^:]*):\s+(.+)$/.exec(line);
        if (!override) throw new Error(`pnpm-workspace.yaml: unreadable override: ${line}`);
        versions.push([`overrides ${yamlValue(override[1]!)}`, yamlValue(override[2]!.replace(/\s+#.*$/, ""))]);
      }
    }
  }
  expect(versions.filter(([, spec]) => typeof spec !== "string" || !REGISTRY_VERSION.test(spec)), "pnpm: versions other than the registry's").toEqual([]);
}

/**
 * What makes a script the quality job runs by its file (`node scripts/….mjs`) pass whatever
 * it checks, or change what the next steps run: an exit with 0 forced (`process.exit(0)`,
 * `process.exit()`, `process.exitCode = 0`, `process.reallyExit`), a line written to
 * $GITHUB_ENV or $GITHUB_PATH, a NODE_OPTIONS. These scripts are code: this list catches
 * the plain forms, another way to exit or a module they import is read in review.
 */
const FORCED_SUCCESS = /\bprocess\s*\.\s*(?:exit\s*\(\s*(?:0\s*)?\)|exitCode\s*=\s*0\b|reallyExit\b)/;
const SCRIPT_ENVIRONMENT_CHANGES = /\bGITHUB_(?:ENV|PATH)\b|::(?:set-env|add-path)\b/;

/** The scripts the steps of the quality job run by their file. */
const SCRIPTS_RUN_BY_FILE = QUALITY_STEPS.flatMap(step => (step.run ?? "").split("\n").flatMap(command => /^node (scripts\/\S+\.mjs)$/.exec(command)?.[1] ?? []));

function expectScriptsRunByFileFinish(scripts: Readonly<Record<string, string>>) {
  for (const [file, script] of Object.entries(scripts)) {
    expect(script, `${file}: forced success`).not.toMatch(FORCED_SUCCESS);
    expect(script, `${file}: environment changes`).not.toMatch(SCRIPT_ENVIRONMENT_CHANGES);
    expect(script, `${file}: NODE_OPTIONS`).not.toMatch(NODE_OPTIONS);
  }
}

/** The type checks `strict` turns on, none of which may be turned off one by one. */
const STRICT_CHECKS = ["noImplicitAny", "noImplicitThis", "strictNullChecks", "strictFunctionTypes", "strictBindCallApply", "strictPropertyInitialization", "strictBuiltinIteratorReturn", "useUnknownInCatchVariables", "alwaysStrict"] as const;

/**
 * tsconfig.json, which no step's command shows either, read as TypeScript reads it (its
 * `extends`, `files`, `include` and `exclude`): `tsc --noEmit` checks the types of every
 * source file of client/src, server and shared, and of every test file (CODE-03), in strict
 * mode. Not `include: []`, nor `exclude` of the tests, nor `noCheck`, as `tsc --noCheck` is
 * refused above, nor `strict: false` or one of its checks turned off.
 */
function expectTypeScriptChecksEverySource(tsconfig: string) {
  const file = path.join(root, "tsconfig.json");
  const parsed = ts.parseJsonConfigFileContent(readJsonWithComments(file, tsconfig), ts.sys, root, undefined, file);
  const checked = new Set(parsed.fileNames.map(fromRoot));
  expect(repositorySources().filter(source => !checked.has(source)), "tsconfig.json: source files left out").toEqual([]);
  expect(repositoryTests().filter(test => !checked.has(test)), "tsconfig.json: test files left out").toEqual([]);
  expect(parsed.options.noCheck ?? false, "tsconfig.json: noCheck").toBe(false);
  expect(parsed.options.strict ?? false, "tsconfig.json: strict").toBe(true);
  expect(STRICT_CHECKS.filter(option => parsed.options[option] === false), "tsconfig.json: strict checks turned off").toEqual([]);
}

/** The matcher knip compares its file patterns with (picomatch), taken from knip's own dependencies. */
const knipPicomatch = createRequire(realpathSync(path.join(root, "node_modules/knip/package.json")))("picomatch") as
  (patterns: string[], options: { dot: boolean; ignore: string[] }) => (file: string) => boolean;

/**
 * Whether a file is among these patterns as knip reads them: one that starts with `!` takes back
 * what the others match, and the `!` that ends a pattern of production mode is left out.
 */
function knipMatcher(patterns: string[]) {
  const bare = patterns.map(pattern => pattern.replace(/!$/, ""));
  const positive = bare.filter(pattern => !pattern.startsWith("!"));
  if (!positive.length) return () => false;
  return knipPicomatch(positive, { dot: true, ignore: bare.filter(pattern => pattern.startsWith("!")).map(pattern => pattern.slice(1)) });
}

type KnipConfiguration = {
  entry?: string[];
  project?: string[];
  ignore?: string[];
  ignoreFiles?: string[];
  ignoreDependencies?: string[];
  ignoreUnresolved?: string[];
  ignoreIssues?: Record<string, string[]>;
  ignoreWorkspaces?: string[];
  workspaces?: Record<string, KnipConfiguration>;
  rules?: Record<string, string>;
  include?: string[];
  exclude?: string[];
};

/** What the step « Find unused files and dependencies » reports, each an issue type of knip. */
const KNIP_REPORTED_ISSUES = ["files", "dependencies", "devDependencies", "unlisted", "unresolved"];

/**
 * The keys knip's configuration may hold, at its root or in its root workspace: those read
 * below, and those that bear only on issue types the step does not require (exports, types,
 * members, binaries). Any other one is refused, as it may hide a file or a dependency: a
 * plugin's own entries (`"vitest": { "entry": … }`), `paths`, a `preprocessor`…
 */
const KNIP_KEYS = new Set([
  "$schema", "entry", "project", "ignore", "ignoreFiles", "ignoreDependencies", "ignoreUnresolved", "ignoreIssues", "ignoreWorkspaces", "workspaces", "rules", "include", "exclude",
  "ignoreBinaries", "ignoreGlobalBinaries", "ignoreMembers", "ignoreExportsUsedInFile", "includeEntryExports", "tags", "treatConfigHintsAsErrors",
]);

/** A name knip reads as a regular expression in ignoreDependencies or ignoreUnresolved (its util/regex.js): `.*` ignores them all. */
const KNIP_REGEX_LIKE = /[*+\\(|{^$]/;

/**
 * knip's configuration, read as knip reads it (package.json's `knip` under knip.json, key by
 * key), looks for unused code in every source file of client/src, server and shared: each
 * one in its project, the root workspace's if it has one, and in no `ignore` or
 * `ignoreFiles` pattern (not `ignore: ['**']`), the root workspace not ignored and no other
 * one configured; each entry a file of its own, as one pattern of many sources makes them all
 * entries, never reported unused; and unused files and dependencies reported as errors, as
 * `knip --exclude files,dependencies` is refused above: no rule `off` or `warn` (knip exits 0
 * on a warning), nor left out by `include`, `exclude` or an `ignoreIssues` pattern, nor a
 * dependency or an import ignored by a pattern rather than by its name.
 */
function expectKnipReadsEverySource(knipJson: string, manifestKnip: Record<string, unknown> = {}) {
  const knip = { ...manifestKnip, ...readJsonWithComments("knip.json", knipJson) } as KnipConfiguration;
  const workspace = knip.workspaces?.["."] ?? {};
  const configs = [knip, workspace];
  expect(configs.flatMap(config => Object.keys(config).filter(key => !KNIP_KEYS.has(key))), "knip.json: keys of no check").toEqual([]);
  expect(Object.keys(knip.workspaces ?? {}).filter(name => name !== "."), "knip.json: other workspaces").toEqual([]);
  // Without `project`, knip reads every JavaScript and TypeScript file.
  const project = knipMatcher(workspace.project ?? knip.project ?? ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"]);
  const ignored = knipMatcher([...knip.ignore ?? [], ...knip.ignoreFiles ?? [], ...workspace.ignore ?? [], ...workspace.ignoreFiles ?? []]);
  expect(repositorySources().filter(source => !project(source) || ignored(source)), "knip.json: source files left out").toEqual([]);
  expect(knip.ignoreWorkspaces ?? [], "knip.json: ignoreWorkspaces").not.toContain(".");
  const entries = configs.flatMap(config => config.entry ?? []).filter(pattern => !pattern.startsWith("!"));
  expect(entries.filter(pattern => repositorySources().filter(knipMatcher([pattern])).length > 1), "knip.json: entries of several source files").toEqual([]);
  expect(configs.flatMap(config => [...config.ignoreDependencies ?? [], ...config.ignoreUnresolved ?? []]).filter(name => KNIP_REGEX_LIKE.test(name)), "knip.json: names ignored by a pattern").toEqual([]);
  const ignoredIssues = configs.flatMap(config => Object.entries(config.ignoreIssues ?? {}).flatMap(([pattern, issues]) => issues.filter(issue => KNIP_REPORTED_ISSUES.includes(issue)).map(issue => `${pattern}: ${issue}`)));
  expect(ignoredIssues, "knip.json: issue types ignored").toEqual([]);
  const reported = (issue: string) => [knip.rules?.[issue], workspace.rules?.[issue]].every(rule => (rule ?? "error") === "error")
    && !(knip.exclude ?? []).includes(issue) && (knip.include?.includes(issue) ?? true);
  expect(KNIP_REPORTED_ISSUES.filter(issue => !reported(issue)), "knip.json: issue types left out").toEqual([]);
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
        run: ${INSTALL_COMMAND}
      - name: Check this workflow
        run: |
          node scripts/check-locked-packages.mjs
          ${GUARD_COMMAND}
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
    // Une base PostgreSQL de test (`services:`) s'ajoute au job listé dans QUALITY_JOB ; jamais un push du schéma.
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
      // A command name that runs another program than its own: pnpm, node, npx or tsc as : or true.
      ["pnpm() { :; }\npnpm check", ["a function, an alias, hash -p or source"]],
      ["function node { :; }\nnode scripts/smoke-built-server.mjs", ["a function, an alias, hash -p or source"]],
      ["function npx() { true; }\nnpx tsc --noEmit", ["a function, an alias, hash -p or source"]],
      ["shopt -s expand_aliases\nalias pnpm=true\npnpm check", ["a function, an alias, hash -p or source"]],
      ["hash -p /bin/true tsc\npnpm check", ["a function, an alias, hash -p or source"]],
      ["source ./ci-functions.sh\npnpm check", ["a function, an alias, hash -p or source"]],
      [". ./ci-functions.sh\npnpm check", ["a function, an alias, hash -p or source"]],
      // A script run by its path, and `hash` that only forgets the paths it found.
      ["./scripts/ci-check.sh\nhash -r\npnpm check", []],
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
    // nor may it be, within an `if`, a loop or a `case` (a function, called or not, is refused itself).
    for (const run of [
      "echo pnpm check",
      "true # pnpm check",
      "pnpm check --help",
      "'echo pnpm check'",
      "|\n          printf '%s' pnpm check",
      '|\n          if [ -n "$NEVER" ]; then pnpm check; fi',
      "|\n          for x in; do pnpm check; done",
      "|\n          case x in y) pnpm check;; esac",
    ]) {
      expect(verify(changed(check, `        run: ${run}\n`)), run).toThrow(/^pnpm check: /);
    }
    // What a function's body runs is not counted as run.
    expect(simpleCommands("f() { pnpm check; }")).toEqual([]);
    expect(simpleCommands("function f {\n  pnpm check\n}\necho done")).toEqual(["echo done"]);
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
    for (const scripts of [{ check: "echo tsc --noEmit" }, { check: "true # tsc --noEmit" }, { check: "tsc" }, { "test:ci": "node scripts/run-tests.mjs" }, { knip: "echo knip" }] as Array<Record<string, string>>) {
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
    ] as Array<Record<string, string>>) {
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

  it("refuse un réglage de pnpm qui change le shell des scripts ou les saute, une fonction, un alias ou un fichier lu avant une commande, et ce qui change l'environnement des étapes suivantes (CODE-14)", () => {
    const check = "        run: pnpm check\n";
    const env = "      CI_DUMMY_KEY: dummy\n";
    const verify = (workflow: string, scripts: Record<string, string> = {}, configs?: Record<string, string>) => () =>
      expectNoNeutralizedStep(workflow, fixturePackageJson(scripts), undefined, configs);
    // script-shell=/bin/true runs no script and passes; shell-emulator runs them in another
    // shell; ignore-scripts skips them: in pnpm's configuration files, any case.
    for (const setting of ["script-shell=/bin/true", "shell-emulator=true", "ignore-scripts=true", "SCRIPT_SHELL=/bin/true"]) {
      expect(verify(FIXTURE_WORKFLOW, {}, { ".npmrc": `engine-strict=true\n${setting}\n` }), setting).toThrow(/^\.npmrc: /);
    }
    for (const setting of ["scriptShell: /bin/true", "shellEmulator: true", "ignoreScripts: true"]) {
      expect(verify(FIXTURE_WORKFLOW, {}, { "pnpm-workspace.yaml": `packages:\n  - "."\n${setting}\n` }), setting).toThrow(/^pnpm-workspace\.yaml: /);
    }
    // As an npm_config_ variable, any case, of the workflow, the job or a step; set by a command or in a script.
    for (const variable of ["npm_config_script_shell: /bin/true", "NPM_CONFIG_SCRIPT_SHELL: /bin/true", "Npm_Config_Ignore_Scripts: \"true\"", "npm_config_userconfig: ./ci.npmrc", "pnpm_config_shell_emulator: \"true\""]) {
      expect(verify(changed(env, `${env}      ${variable}\n`)), variable).toThrow(/^script settings: /);
    }
    expect(verify(changed("jobs:\n", "env:\n  npm_config_script_shell: /bin/true\n\njobs:\n"))).toThrow(/^script settings: /);
    expect(verify(changed(check, `${check}        env:\n          npm_config_script_shell: /bin/true\n`))).toThrow(/^script settings: /);
    expect(verify(changed(check, "        run: |\n          pnpm config set script-shell /bin/true\n          pnpm check\n"))).toThrow(/^script settings: /);
    expect(verify(FIXTURE_WORKFLOW, { "test:ci": "npm_config_script_shell=/bin/true vitest run" })).toThrow(/^script "test:ci": /);
    // pnpm, node, npx or tsc made into a function, an alias, a path of bash's own, or by a file sourced first.
    for (const run of [
      "|\n          pnpm() { :; }\n          pnpm check",
      "|\n          function pnpm {\n            :\n          }\n          pnpm check",
      "|\n          shopt -s expand_aliases\n          alias pnpm=true\n          pnpm check",
      "|\n          hash -p /bin/true pnpm\n          pnpm check",
      "|\n          source ./ci-functions.sh\n          pnpm check",
    ]) {
      expect(verify(changed(check, `        run: ${run}\n`)), run).toThrow(/^Verify TypeScript: /);
    }
    // Lines written to $GITHUB_ENV or $GITHUB_PATH change the variables and the PATH of the next
    // steps, as did ::set-env and ::add-path; within a step, a PATH or a BASH_ENV of its own.
    for (const run of [
      '|\n          echo "PATH=$PWD/ci-bin:$PATH" >> "$GITHUB_ENV"',
      "|\n          echo \"$PWD/ci-bin\" >> $GITHUB_PATH",
      "|\n          echo \"::add-path::$PWD/ci-bin\"",
      '|\n          export PATH="$PWD/ci-bin:$PATH"\n          pnpm check',
      "PATH=./ci-bin:/usr/bin pnpm check",
    ]) {
      expect(verify(changed(check, `        run: ${run}\n${check}`)), run).toThrow(/^environment changes: /);
    }
    for (const variable of ["PATH: ./ci-bin:/usr/bin", "BASH_ENV: ./ci-functions.sh", "ACTIONS_ALLOW_UNSECURE_COMMANDS: \"true\""]) {
      expect(verify(changed(env, `${env}      ${variable}\n`)), variable).toThrow(/^environment changes: /);
    }
    expect(verify(FIXTURE_WORKFLOW, { check: "PATH=./ci-bin:$PATH tsc --noEmit" })).toThrow(/^script "check": /);
    // Reading the PATH, or a setting that changes no script, is no change.
    expect(verify(changed(check, '        run: |\n          echo "$PATH"\n          pnpm check\n'))).not.toThrow();
    expect(verify(FIXTURE_WORKFLOW, {}, { ".npmrc": "engine-strict=true\nauto-install-peers=true\n" })).not.toThrow();
  });

  it("ne lance dans le job quality que les étapes listées, chacune telle quelle, et de package.json que les scripts listés, aucun lancé par pnpm de lui-même (CODE-14)", async () => {
    const [workflow, packageJson] = await Promise.all([read(".github/workflows/ci.yml"), read("package.json")]);
    expectQualityJobAsListed(workflow, packageJson);
  });

  it("refuse dans le job quality toute autre commande, variable ou clé, et tout autre script qu'il lance, là où la liste de refus ne voit rien (CODE-14)", async () => {
    const [workflow, packageJson] = await Promise.all([read(".github/workflows/ci.yml"), read("package.json")]);
    const check = "        run: pnpm check\n";
    const variable = '      RUN_EXTERNAL_SECURITY_TESTS: "false"\n';
    const edit = (from: string, to: string) => {
      expect(workflow).toContain(from);
      return workflow.replace(from, to);
    };
    const verify = (changedWorkflow: string, scripts: Record<string, string> = {}) => () => {
      const manifest = JSON.parse(packageJson) as { scripts: Record<string, string> };
      expectQualityJobAsListed(changedWorkflow, JSON.stringify({ ...manifest, scripts: { ...manifest.scripts, ...scripts } }));
    };
    expect(verify(workflow)).not.toThrow();
    // Before `pnpm check`, pnpm or tsc made into true by a builtin, an array of bash, a PATH or
    // a link of the step's own, a pnpm configuration in the home directory, another package.
    for (const line of [
      "shopt -s expand_aliases; builtin alias pnpm=true",
      "command alias pnpm=true",
      "BASH_ALIASES[pnpm]=true",
      "BASH_CMDS[pnpm]=/bin/true",
      "builtin hash -p /bin/true pnpm",
      'printf -v PATH %s "$PWD/ci-bin:$PATH"',
      'read -r PATH <<< "$PWD/ci-bin:$PATH"',
      "ln -sf /bin/true node_modules/.bin/tsc",
      'mkdir -p ~/.config/pnpm; echo "script""-shell=/bin/true" > ~/.config/pnpm/rc',
      "cd docs",
    ]) {
      expect(verify(edit(check, `        run: |\n          ${line}\n          pnpm check\n`)), line).toThrow(/^ci\.yml: steps of the quality job: /);
    }
    // A step's env, another with: (another commit checked out), another step, this check's step weakened.
    for (const changedWorkflow of [
      edit(check, `${check}        env:\n          FORCE_COLOR: "0"\n`),
      edit("        uses: actions/checkout@v4\n", "        uses: actions/checkout@v4\n        with:\n          ref: main\n"),
      edit(check, `${check}      - name: Prepare\n        run: ln -sf /bin/true node_modules/.bin/knip\n`),
    ]) {
      expect(verify(changedWorkflow)).toThrow(/^ci\.yml: steps of the quality job: /);
    }
    // This check's step weakened: vitest through pnpm (a script « vitest », pnpm's node-options), a digest
    // left out, the step after `pnpm check`, an install that runs the project's scripts or a pnpmfile.
    const guard = `          ${GUARD_COMMAND}\n`;
    const [lockfileDigest] = GUARD_STEP_RUN.split("\n");
    const install = `        run: ${INSTALL_COMMAND}\n`;
    const guardStep = `      - name: Check this workflow\n        run: |\n${GUARD_STEP_RUN.split("\n").map(line => `          ${line}\n`).join("")}`;
    for (const changedWorkflow of [
      edit(guard, `          ${GUARD_COMMAND.replace("node node_modules/vitest/vitest.mjs", "pnpm vitest")}\n`),
      edit(guard, `          ${GUARD_COMMAND.replace("node node_modules/vitest/vitest.mjs", "pnpm exec vitest")}\n`),
      edit(`          ${lockfileDigest}\n`, ""),
      edit(guardStep, "").replace(`${check}`, `${check}${guardStep}`),
      edit(install, "        run: pnpm install --frozen-lockfile\n"),
      edit(install, "        run: pnpm install --frozen-lockfile --ignore-pnpmfile\n"),
    ]) {
      expect(verify(changedWorkflow)).toThrow(/^ci\.yml: steps of the quality job: /);
    }
    // A variable of the job added, changed or removed; another key of the job.
    for (const changedWorkflow of [
      edit(variable, `${variable}      npm_config_script_shell: /bin/true\n`),
      edit(variable, '      RUN_EXTERNAL_SECURITY_TESTS: "true"\n'),
      edit(variable, ""),
      edit("    timeout-minutes: 20\n", "    timeout-minutes: 20\n    container: node:22\n"),
      edit("    timeout-minutes: 20\n", "    timeout-minutes: 20\n    defaults:\n      run:\n        shell: bash {0}\n"),
    ]) {
      expect(verify(changedWorkflow)).toThrow(/^ci\.yml: keys of the quality job: /);
    }
    // Variables or defaults of the whole workflow.
    for (const changedWorkflow of [edit("\njobs:\n", "\nenv:\n  npm_config_script_shell: /bin/true\n\njobs:\n"), edit("\njobs:\n", "\ndefaults:\n  run:\n    shell: bash {0}\n\njobs:\n")]) {
      expect(verify(changedWorkflow)).toThrow(/^ci\.yml: keys of the workflow: /);
    }
    // A script the steps run changed, or one pnpm runs by itself. A script « vitest » runs in no step:
    // this check runs vitest by its file.
    for (const scripts of [{ check: "ln -sf /bin/true node_modules/.bin/tsc && tsc --noEmit" }, { build: "vite build" }] as Array<Record<string, string>>) {
      expect(verify(workflow, scripts), JSON.stringify(scripts)).toThrow(/^package\.json: scripts the quality job runs: /);
    }
    expect(verify(workflow, { vitest: "node -e 0" })).not.toThrow();
    for (const hook of ["pnpm:devPreinstall", "postinstall", "prepare", "precheck", "posttest:ci"]) {
      expect(verify(workflow, { [hook]: "ln -sf /bin/true node_modules/.bin/tsc" }), hook).toThrow(/^package\.json: scripts pnpm runs by itself: /);
    }
    // A script no step runs is not read.
    expect(verify(workflow, { dev: "tsx watch server/_core/index.ts || true" })).not.toThrow();
  });

  it("ne laisse vitest.config.ts, tsconfig.json ni knip.json écarter un fichier de test ou un fichier source du dépôt (CODE-14)", async () => {
    const [tsconfig, knip, packageJson] = await Promise.all([read("tsconfig.json"), read("knip.json"), read("package.json")]);
    // The files these checks look for are there: tests of the client and the server, sources of all three.
    expect(repositoryTests()).toEqual(expect.arrayContaining(["server/ciWorkflow.test.ts", "server/recruitmentLanguages.test.ts", "client/src/components/RecruitmentTab.actions.test.ts"]));
    expect(repositorySources()).toEqual(expect.arrayContaining(["client/src/main.tsx", "server/_core/index.ts", "server/routers/admin/recruitment.ts", "shared/recruitmentLanguages.ts"]));
    await expectVitestRunsEveryTest();
    // Its own step reads neither vitest.config.ts nor a workspace file: only its configuration and its project.
    await expect(guardStepRun(), "Check this workflow").resolves.toEqual({ configFile: "scripts/ci-workflow.vitest.config.mjs", projects: ["ci-workflow"], files: ["server/ciWorkflow.test.ts"], passWithNoTests: false });
    expectTypeScriptChecksEverySource(tsconfig);
    expectKnipReadsEverySource(knip, (JSON.parse(packageJson) as { knip?: Record<string, unknown> }).knip);
  }, 30_000);

  it("ne laisse vitest exécuter que sa configuration listée, pnpm installer que les paquets du lockfile, ni un script lancé par son fichier réussir d'office (CODE-14)", async () => {
    const rootFiles = readdirSync(root);
    expectVitestConfigAsListed(await read("vitest.config.ts"), rootFiles);
    const optional = async (file: string) => (existsSync(path.join(root, file)) ? read(file) : undefined);
    expectPnpmInstallsTheLockedPackages({ packageJson: await read("package.json"), workspace: await optional("pnpm-workspace.yaml"), npmrc: await optional(".npmrc"), rootFiles });
    expect(SCRIPTS_RUN_BY_FILE).toEqual(["scripts/check-locked-packages.mjs", "scripts/check-performance-budgets.mjs", "scripts/smoke-built-server.mjs", "scripts/check-migrations-in-sync.mjs"]);
    expectScriptsRunByFileFinish(Object.fromEntries(await Promise.all(SCRIPTS_RUN_BY_FILE.map(async file => [file, await read(file)] as const))));
  });

  it.skipIf(spawnSync("sha256sum", ["--version"]).status !== 0)("vérifie, avant vitest, l'empreinte de ce qu'il lance : une configuration de ce contrôle ou un contrôle des paquets changés sans ci.yml fait échouer l'étape (CODE-14)", async () => {
    // The digest lines of the step, run by bash -e as GitHub runs a step, in a directory holding the files they pin.
    const digests = GUARD_STEP_RUN.split("\n").filter(line => line.startsWith("sha256sum "));
    expect(digests.map(line => line.split(" ").at(-1)!.replace(/"$/, ""))).toEqual(GUARD_PINNED_FILES);
    const directory = await mkdtemp(path.join(os.tmpdir(), "ci-guard-digests-"));
    try {
      const runDigests = async (changes: Record<string, string> = {}) => {
        for (const file of GUARD_PINNED_FILES) {
          await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
          await writeFile(path.join(directory, file), changes[file] ?? await read(file));
        }
        return spawnSync("bash", ["-e", "-c", digests.join("\n")], { cwd: directory, encoding: "utf8" }).status;
      };
      await expect(runDigests()).resolves.toBe(0);
      // A globalSetup exiting with 0 in this check's configuration, a lockfile check that refuses nothing.
      const config = await read("scripts/ci-workflow.vitest.config.mjs");
      await expect(runDigests({ "scripts/ci-workflow.vitest.config.mjs": config.replace("  test: {\n", '  test: {\n    globalSetup: ["./scripts/ci-guard-setup.mjs"],\n') })).resolves.toBe(1);
      const lockfileCheck = await read("scripts/check-locked-packages.mjs");
      await expect(runDigests({ "scripts/check-locked-packages.mjs": lockfileCheck.replace("  return problems;\n}", "  return [];\n}") })).resolves.toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("n'installe que des paquets du registre fixés par leur empreinte : refuse dans pnpm-lock.yaml un tarball, un dossier, un dépôt git, link: ou file:, un correctif ou un pnpmfile enregistré, un échappement, et un autre registre (CODE-14)", async () => {
    const [lockfile, workspace] = await Promise.all([read("pnpm-lock.yaml"), read("pnpm-workspace.yaml")]);
    const optional = async (file: string) => (existsSync(path.join(root, file)) ? read(file) : undefined);
    const configs = Object.fromEntries(Object.entries({ ".npmrc": await optional(".npmrc"), "pnpm-workspace.yaml": workspace }).filter((entry): entry is [string, string] => entry[1] !== undefined));
    expect(lockedPackagesProblems(lockfile, configs)).toEqual([]);
    // The step's command itself, as it runs before vitest.
    const run = spawnSync(process.execPath, ["scripts/check-locked-packages.mjs"], { cwd: root, encoding: "utf8" });
    expect({ status: run.status, stdout: run.stdout.trim() }).toEqual({ status: 0, stdout: LOCKED_PACKAGES_MESSAGE });

    // typescript@5.9.3 and its resolution, then one line of the lockfile changed.
    const header = "\n  typescript@5.9.3:\n";
    const resolution = lockfile.slice(lockfile.indexOf(header) + header.length).split("\n")[0]!;
    expect(resolution).toMatch(/^ {4}resolution: \{integrity: sha512-[A-Za-z0-9+/]+={0,2}\}$/);
    const lockfileWith = (from: string, to: string) => {
      expect(lockfile).toContain(from);
      return lockfile.replace(from, to);
    };
    const tarball = "https://ci-mirror.example.test/typescript-5.9.3.tgz";
    for (const [what, changed, problem] of [
      ["a tarball beside the integrity", lockfileWith(resolution, `    resolution: {integrity: sha512-FAKEFAKEFAKE==, tarball: ${tarball}}`), /: a resolution other than/],
      ["a tarball alone", lockfileWith(resolution, `    resolution: {tarball: ${tarball}}`), /: a resolution other than/],
      ["a directory", lockfileWith(resolution, "    resolution: {directory: ci/typescript, type: directory}"), /: a resolution other than/],
      ["a git commit", lockfileWith(resolution, "    resolution: {commit: 0123456789abcdef, repo: https://example.test/typescript.git, type: git}"), /: a resolution other than/],
      ["a resolution in block style", lockfileWith(resolution, `    resolution:\n      tarball: ${tarball}`), /: a resolution other than/],
      ["a key spelt with an escape", lockfileWith(resolution, `    "r\\x65solution": {tarball: ${tarball}}`), /: a double quote or a backslash/],
      ["a link to the repository", lockfileWith("      typescript:\n        specifier: 5.9.3\n        version: 5.9.3\n", "      typescript:\n        specifier: 5.9.3\n        version: link:ci/typescript\n"), /: a package of the repository/],
      ["a file of the repository", lockfileWith(header, "\n  typescript@file:ci/typescript.tgz:\n"), /: a package of the repository/],
      ["a patch recorded", lockfileWith("\nimporters:\n", "\npatchedDependencies:\n  vitest:\n    hash: 0123\n    path: patches/vitest.patch\n\nimporters:\n"), /: a key other than/],
      ["a pnpmfile recorded", lockfileWith("\nimporters:\n", "\npnpmfileChecksum: sha256-0123\n\nimporters:\n"), /: a key other than/],
      ["a second document", `${lockfile}\n---\nimporters: {}\n`, /: a key other than/],
    ] as const) {
      expect(lockedPackagesProblems(changed, configs), what).toEqual([expect.stringMatching(new RegExp(`^pnpm-lock\\.yaml:\\d+${problem.source}`))]);
    }
    // A registry that would serve a package of a rewritten integrity: in .npmrc, any scope, or pnpm-workspace.yaml.
    for (const [file, text] of [[".npmrc", "registry=https://ci-mirror.example.test/\n"], [".npmrc", "@vitest:registry=https://ci-mirror.example.test/\n"], ["pnpm-workspace.yaml", `${workspace}\nregistry: https://ci-mirror.example.test/\n`]] as const) {
      expect(lockedPackagesProblems(lockfile, { ...configs, [file]: text }), text).toEqual([expect.stringMatching(new RegExp(`^${file.replace(".", "\\.")}:\\d+: a registry setting`))]);
    }
    expect(lockedPackagesProblems(lockfile, { ...configs, ".npmrc": "engine-strict=true\n# registry=https://ci-mirror.example.test/\n" })).toEqual([]);
  });

  it("refuse setupFiles, globalSetup ou tout autre ajout à vitest.config.ts, un pnpmfile, un correctif ou une version hors du registre, un script qui réussit d'office et strict: false (CODE-14)", async () => {
    // vitest: the lines that neutralised `pnpm test:ci` while this check alone kept passing.
    const config = await read("vitest.config.ts");
    const include = '    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/**/*.test.ts", "client/**/*.spec.ts"],\n';
    expect(config).toContain(include);
    expect(() => expectVitestConfigAsListed(config, ["package.json", "vitest.config.ts"])).not.toThrow();
    for (const line of ['    setupFiles: ["server/testing/ciSetup.ts"],\n', '    globalSetup: ["server/testing/ciGlobalSetup.ts"],\n', '    environment: "./ci-environment.ts",\n', '    alias: { vitest: "./ci-vitest.ts" },\n']) {
      expect(() => expectVitestConfigAsListed(config.replace(include, `${include}${line}`), []), line).toThrow(/^vitest\.config\.ts: /);
    }
    expect(() => expectVitestConfigAsListed(`${config}process.on("exit", () => { process.exitCode = 0; });\n`, [])).toThrow(/^vitest\.config\.ts: /);
    for (const file of ["vitest.workspace.ts", "vitest.projects.json"]) {
      expect(() => expectVitestConfigAsListed(config, [file]), file).toThrow(/^vitest: workspace files/);
    }

    // pnpm: the project's files, then one of them changed.
    const [packageJson, workspace] = await Promise.all([read("package.json"), read("pnpm-workspace.yaml")]);
    const manifest = JSON.parse(packageJson) as Record<string, Record<string, unknown>>;
    const pnpmWith = (changes: { packageJson?: Record<string, unknown>; workspace?: string; npmrc?: string; rootFiles?: string[] }) => () =>
      expectPnpmInstallsTheLockedPackages({ packageJson: JSON.stringify({ ...manifest, ...changes.packageJson }), workspace: changes.workspace ?? workspace, npmrc: changes.npmrc, rootFiles: changes.rootFiles ?? ["package.json", "pnpm-workspace.yaml"] });
    expect(pnpmWith({})).not.toThrow();
    expect(pnpmWith({ npmrc: "engine-strict=true\nauto-install-peers=true\n" })).not.toThrow();
    for (const file of [".pnpmfile.cjs", ".pnpmfile.mjs"]) expect(pnpmWith({ rootFiles: ["package.json", file] }), file).toThrow(/^pnpm: pnpmfile/);
    for (const npmrc of ["pnpmfile=./ci/hooks.cjs\n", "global-pnpmfile=./ci/hooks.cjs\n"]) expect(pnpmWith({ npmrc }), npmrc).toThrow(/^\.npmrc: /);
    for (const setting of ["pnpmfile: ./ci/hooks.cjs", "patchedDependencies:\n  typescript: patches/typescript.patch", "packageExtensions:\n  knip:\n    dependencies:\n      ci-shim: 1.0.0"]) {
      expect(pnpmWith({ workspace: `${workspace}\n${setting}\n` }), setting).toThrow(/^pnpm-workspace\.yaml: /);
    }
    expect(pnpmWith({ workspace: `${workspace}\ncatalog:\n  vitest: 3.2.4\n` })).toThrow(/^pnpm-workspace\.yaml: settings/);
    expect(pnpmWith({ workspace: workspace.replace('  - "."\n', '  - "."\n  - "tools/*"\n') })).toThrow(/^pnpm-workspace\.yaml: packages/);
    for (const override of ["typescript: npm:ci-typescript@5.9.3", "vitest: file:./ci/vitest", "knip: link:./ci/knip", "'@vitejs/plugin-react': github:someone/plugin-react", "tsx: https://example.test/tsx.tgz", "typescript: -"]) {
      expect(pnpmWith({ workspace: workspace.replace("\noverrides:\n", `\noverrides:\n  ${override}\n`) }), override).toThrow(/^pnpm: versions other than the registry's/);
    }
    expect(pnpmWith({ workspace: workspace.replace(/\noverrides:\n(?: {2}.*\n)+/, '\noverrides: { typescript: "npm:ci-typescript@5.9.3" }\n') })).toThrow(/^pnpm-workspace\.yaml: overrides, one a line/);
    const pnpmField = manifest.pnpm as Record<string, Record<string, string>>;
    for (const field of [
      { pnpm: { ...pnpmField, patchedDependencies: { typescript: "patches/typescript.patch" } } },
      { pnpm: { ...pnpmField, packageExtensions: { knip: { dependencies: { "ci-shim": "1.0.0" } } } } },
    ]) {
      expect(pnpmWith({ packageJson: field }), JSON.stringify(field)).toThrow(/^package\.json: pnpm: /);
    }
    expect(pnpmWith({ packageJson: { pnpm: { ...pnpmField, neverBuiltDependencies: [] } } })).toThrow(/^package\.json: pnpm settings/);
    for (const field of [
      { pnpm: { overrides: { ...pnpmField.overrides, typescript: "npm:ci-typescript@5.9.3" } } },
      { resolutions: { vitest: "file:./ci/vitest" } },
      { devDependencies: { ...manifest.devDependencies, typescript: "file:./ci/typescript" } },
      { dependencies: { ...manifest.dependencies, zod: "git+https://example.test/zod.git" } },
    ]) {
      expect(pnpmWith({ packageJson: field }), JSON.stringify(field).slice(0, 80)).toThrow(/^pnpm: versions other than the registry's/);
    }

    // The scripts run by their file: an exit with 0 forced, the next steps' PATH changed.
    const budgets = await read("scripts/check-performance-budgets.mjs");
    expect(() => expectScriptsRunByFileFinish({ "scripts/check-performance-budgets.mjs": budgets })).not.toThrow();
    for (const [line, reason] of [
      ["process.exit(0);", "forced success"],
      ["process.exit();", "forced success"],
      ["process.on(\"exit\", () => { process.exitCode = 0; });", "forced success"],
      ["process.reallyExit(0);", "forced success"],
      ['appendFileSync(process.env.GITHUB_PATH, "ci-bin\\n");', "environment changes"],
      ['console.log("::add-path::ci-bin");', "environment changes"],
      ['process.env.NODE_OPTIONS = "--require ./ci.cjs";', "NODE_OPTIONS"],
    ]) {
      expect(() => expectScriptsRunByFileFinish({ "scripts/check-performance-budgets.mjs": `${line}\n${budgets}` }), line).toThrow(new RegExp(`^scripts/check-performance-budgets\\.mjs: ${reason}`));
    }

    // TypeScript: strict mode, and each of its checks, kept.
    const tsconfig = readJsonWithComments("tsconfig.json", await read("tsconfig.json"));
    const strictWith = (compilerOptions: Record<string, unknown>) => () => expectTypeScriptChecksEverySource(JSON.stringify({ ...tsconfig, compilerOptions: { ...(tsconfig.compilerOptions as object), ...compilerOptions } }));
    expect(strictWith({})).not.toThrow();
    expect(strictWith({ strict: false })).toThrow(/^tsconfig\.json: strict/);
    for (const option of ["strictNullChecks", "noImplicitAny", "useUnknownInCatchVariables"]) {
      expect(strictWith({ [option]: false }), option).toThrow(/^tsconfig\.json: strict checks turned off/);
    }
  }, 30_000);

  it("refuse une configuration de vitest, de TypeScript ou de knip qui écarte des tests ou des sources : exclude '**', include vide, ce contrôle écarté, ignore '**', entrées élargies, ignoreIssues (CODE-14)", async () => {
    // vitest: a configuration of plain values beside the project, with its include, then weakened.
    const directory = await mkdtemp(path.join(os.tmpdir(), "ci-vitest-config-"));
    try {
      const vitestConfig = async (name: string, test: Record<string, unknown>) => {
        const file = path.join(directory, `${name}.config.mjs`);
        await writeFile(file, `export default ${JSON.stringify({ test })};\n`);
        return file;
      };
      const include = ["server/**/*.test.ts", "client/**/*.test.ts"];
      await expect(expectVitestRunsEveryTest(await vitestConfig("project", { include }))).resolves.toBeUndefined();
      for (const [name, test] of [
        ["exclude-all", { include, exclude: ["**"] }],
        ["include-none", { include: [] }],
        ["server-only", { include: ["server/**/*.test.ts"] }],
        ["client-excluded", { include, exclude: ["client/**"] }],
        ["no-test-name", { include, testNamePattern: "^$" }],
        ["pass-with-no-tests", { include, passWithNoTests: true }],
      ] as const) {
        await expect(expectVitestRunsEveryTest(await vitestConfig(name, test)), name).rejects.toThrow(/^vitest: /);
      }
      // This check alone left out, told to pass with none: never run in the suite, refused here; its own
      // step, which reads a configuration of its own, runs it all the same (see guardStepRun).
      const withoutGuard = await vitestConfig("without-guard", { include, exclude: ["**/node_modules/**", "server/ciWorkflow.test.ts"], passWithNoTests: true });
      await expect(expectVitestRunsEveryTest(withoutGuard)).rejects.toThrow(/^vitest: test files left out/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }

    // TypeScript: the project's tsconfig.json with one of its keys changed.
    const tsconfig = readJsonWithComments("tsconfig.json", await read("tsconfig.json"));
    const tsconfigWith = (changes: Record<string, unknown>, compilerOptions: Record<string, unknown> = {}) =>
      JSON.stringify({ ...tsconfig, ...changes, compilerOptions: { ...(tsconfig.compilerOptions as object), ...compilerOptions } });
    expect(() => expectTypeScriptChecksEverySource(tsconfigWith({}))).not.toThrow();
    for (const [what, changes, compilerOptions] of [
      ["include []", { include: [] }, {}],
      ["files [] and include []", { files: [], include: [] }, {}],
      ["client/src only", { include: ["client/src/**/*"] }, {}],
      ["server excluded", { exclude: [...(tsconfig.exclude as string[]), "server/**"] }, {}],
      ["tests excluded, as until CODE-03", { exclude: [...(tsconfig.exclude as string[]), "**/*.test.ts"] }, {}],
      ["noCheck", {}, { noCheck: true }],
    ] as const) {
      expect(() => expectTypeScriptChecksEverySource(tsconfigWith(changes, compilerOptions)), what).toThrow(/^tsconfig\.json: /);
    }

    // knip: the project's knip.json with one of its keys changed; an ignore of files that are no sources passes.
    const knip = readJsonWithComments("knip.json", await read("knip.json"));
    const knipWith = (changes: Record<string, unknown>) => JSON.stringify({ ...knip, ...changes });
    expect(() => expectKnipReadsEverySource(knipWith({ ignore: ["**/*.generated.mjs", "dist/**"] }))).not.toThrow();
    for (const [what, changes] of [
      ["ignore **", { ignore: ["**"] }],
      ["ignore server", { ignore: ["server/**"] }],
      ["ignoreFiles client/src", { ignoreFiles: ["client/src/**"] }],
      ["project without shared", { project: ["client/src/**/*.{ts,tsx,css}", "server/**/*.ts"] }],
      ["root workspace's project", { workspaces: { ".": { project: ["scripts/**/*.mjs"] } } }],
      ["root workspace ignored", { ignoreWorkspaces: ["."] }],
      ["files off", { rules: { ...(knip.rules as object), files: "off" } }],
      ["dependencies as warnings", { rules: { ...(knip.rules as object), dependencies: "warn" } }],
      ["files and dependencies excluded", { exclude: ["files", "dependencies"] }],
      ["exports only", { include: ["exports"] }],
      ["files ignored in server", { ignoreIssues: { "server/**": ["files"] } }],
      ["dependencies ignored in the root workspace", { workspaces: { ".": { ignoreIssues: { "package.json": ["dependencies"] } } } }],
      ["entry of every source", { entry: ["server/**/*.ts", "client/src/**/*.{ts,tsx}", "shared/**/*.ts"] }],
      ["entry of the server in production mode", { entry: [...(knip.entry as string[]), "server/**/*.ts!"] }],
      ["a plugin's own entries", { vitest: { entry: ["server/**/*.ts"] } }],
      ["paths", { paths: { "@/*": ["client/src/*"] } }],
      ["every dependency ignored", { ignoreDependencies: [".*"] }],
      ["every import left unresolved ignored", { ignoreUnresolved: ["^.+$"] }],
      ["another workspace", { workspaces: { server: { project: ["**/*.ts"] } } }],
    ] as const) {
      expect(() => expectKnipReadsEverySource(knipWith(changes)), what).toThrow(/^knip\.json: /);
    }
    // An ignoreIssues of other issue types, the ignore of a dependency by its name, and the same as package.json's `knip`.
    expect(() => expectKnipReadsEverySource(knipWith({ ignoreIssues: { "client/src/generated/**": ["exports", "types"] }, ignoreDependencies: ["@fontsource/playfair-display", "@types/node"] }))).not.toThrow();
    expect(() => expectKnipReadsEverySource(knipWith({}), { ignoreIssues: { "server/**": ["files"] } })).toThrow(/^knip\.json: issue types ignored/);
  }, 30_000);

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

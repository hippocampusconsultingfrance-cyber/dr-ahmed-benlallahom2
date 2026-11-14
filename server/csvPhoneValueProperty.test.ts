import { readFileSync } from "node:fs";
import { delimiter } from "node:path";
import { describe, expect, it } from "vitest";
import { csvPhoneValue } from "./routers/admin/recruitment";

/**
 * ADM-26: the property every phone the exports rewrite holds, a value a spreadsheet keeps as text leaving as typed: the
 * digits of the typed value in the same order, a « + » written « 00 », and every sign typed between two digits still
 * there between the same two digits, a space between two groups of one number aside. For an honest value, made of a
 * number and what follows it (its extension, its variant, another number, up to three items), what is typed between
 * each two items stays too, a space as a space.
 */

/** The digits of a phone and what is typed between each two of them, a « + » after signs only read « 00 », as the export writes it. */
function digitsAndGaps(value: string) {
  const written = value.replace(/^(\D*)\+\D*/, "$100");
  return {
    digits: written.replace(/\D/g, ""),
    gaps: written
      .replace(/^\D+|\D+$/g, "")
      .split(/\d/)
      .slice(1, -1),
  };
}

let rewritten = 0;

/** What the export of a phone loses of it, if it rewrites it: its digits, a sign typed between two digits, the space or the sign between two of its items (`limits`, the gaps between them). */
function lost(input: string, limits: number[] = []) {
  const trimmed = input.trim();
  const typed = trimmed.startsWith("+") ? `00${trimmed.slice(1)}` : trimmed;
  const exported = csvPhoneValue(input)!;
  if (exported === typed) return [];
  rewritten++;
  const before = digitsAndGaps(typed),
    after = digitsAndGaps(exported.replace(/^'/, ""));
  if (after.digits !== before.digits)
    return [
      `digits: ${JSON.stringify(input)} gives ${JSON.stringify(exported)}`,
    ];
  const signs = (gap: string) => gap.replace(/\s/g, "");
  return before.gaps.flatMap((gap, index) => {
    const kept = after.gaps[index]!;
    if (signs(gap) !== signs(kept))
      return [
        `sign ${JSON.stringify(gap)}: ${JSON.stringify(input)} gives ${JSON.stringify(exported)}`,
      ];
    if (limits.includes(index) && /\s/.test(gap) && !/\s/.test(kept))
      return [
        `space: ${JSON.stringify(input)} gives ${JSON.stringify(exported)}`,
      ];
    return [];
  });
}

/** A seeded generator, so that a failure can be replayed (mulberry32). */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const next = random(26);
const pick = <T>(items: ArrayLike<T>) =>
  items[Math.floor(next() * items.length)]!;
const digits = (count: number, first = "123456789") =>
  Array.from({ length: count }, (_, index) =>
    pick(index === 0 ? first : "0123456789")
  ).join("");

/** Values of digits and of every sign a phone is typed with, in any order: the fuzz of the earlier checks. */
function fuzz(count: number) {
  const signs = [" ", " ", " ", " ", ".", ",", "-", "−", "/", "(", ")", "+"];
  return Array.from({ length: count }, () =>
    Array.from({ length: 1 + Math.floor(next() * 24) }, () =>
      next() < 0.6 ? pick("0123456789") : pick(signs)
    ).join("")
  );
}

/** National plans: the country code, the digits of a national number, its trunk prefix. Six digits in New Caledonia, Wallis and Futuna, Saint Pierre and Miquelon, Andorra, Luxembourg. */
const PLANS = [
  ["33", 9, "0"],
  ["32", 9, "0"],
  ["41", 9, "0"],
  ["212", 9, "0"],
  ["213", 9, "0"],
  ["216", 8, ""],
  ["961", 7, "0"],
  ["961", 8, ""],
  ["974", 8, ""],
  ["973", 8, ""],
  ["965", 8, ""],
  ["968", 8, ""],
  ["971", 9, "0"],
  ["966", 9, "0"],
  ["34", 9, ""],
  ["351", 9, ""],
  ["39", 10, ""],
  ["49", 10, "0"],
  ["44", 10, "0"],
  ["1", 10, ""],
  ["20", 10, "0"],
  ["354", 7, ""],
  ["687", 6, ""],
  ["681", 6, ""],
  ["508", 6, ""],
  ["376", 6, ""],
  ["352", 6, ""],
  ["352", 9, ""],
] as const;

/** A number's digits written as people type them: in one run, by pairs, by groups of three from the start or from the end, 4-3-3. */
function grouped(number: string) {
  const sep = pick([" ", " ", ".", "-", " "]);
  const cut = (sizes: number[]) => {
    const parts: string[] = [];
    let at = 0;
    for (const size of sizes) {
      parts.push(number.slice(at, at + size));
      at += size;
    }
    if (at < number.length) parts.push(number.slice(at));
    return parts.filter(Boolean).join(sep);
  };
  const fromEnd = (size: number) =>
    number.replace(new RegExp(`\\B(?=(?:\\d{${size}})+$)`, "g"), sep);
  return pick([
    () => number,
    () => fromEnd(2),
    () => fromEnd(3),
    () => cut([3, 3, 3, 3]),
    () => cut([4, 3, 3]),
    () => cut([2, 3, 3, 3]),
    () => cut([2, 2, 2, 2, 2]),
  ])();
}

/** A whole number, national or international, written in one of the ways people type it. */
function phone() {
  const [code, length, trunk] = pick(PLANS);
  const national = digits(length);
  if (next() < 0.6) return trunk + grouped(national);
  return `${pick(["+", "00", "(+", "+ "])}${code}${pick(["", " ", ".", "-", ") "])}${grouped(national)}`.replace(
    /^\(\+(\d+)$/,
    "(+$1)"
  );
}

/**
 * Honest values: a number alone or followed by one or two items, each its extension, its variant or another number
 * (« 0612345678 5/6 », « +97444123712 55123456/7 »), the gap between each two items recorded, signs around them or not.
 */
function honest(count: number) {
  return Array.from({ length: count }, () => {
    const [before, after] = pick([
      ["", ""],
      ["", ""],
      ["(", ")"],
      ["( ", " )"],
      ["-", ""],
      ["", "-"],
      ["", "."],
      ["", ","],
    ]);
    let input = `${before}${phone()}`;
    const limits: number[] = [];
    for (let items = pick([1, 2, 2, 3, 3]); items > 1; items--) {
      limits.push(digitsAndGaps(input).digits.length - 1);
      input +=
        pick([
          " ",
          " ",
          ",",
          ", ",
          ".",
          " . ",
          "/",
          " / ",
          " /",
          "/ ",
          " - ",
          "  ",
        ]) +
        (next() < 0.6
          ? digits(1 + Math.floor(next() * 5), "0123456789")
          : phone());
    }
    return { input: `${input}${after}`, limits };
  });
}

/**
 * The fuzz and the honest corpora of the earlier checks (1 584 004 values, and 60 000 of three items), too large for the
 * repository: a list of JSON files of values, of { input, number, rest } and { input, number, joiner, rest } records, or
 * of { input, before } records, `before` what precedes each item after the first, given by ADM26_PHONE_CORPORA (paths
 * separated as in PATH).
 */
const CORPORA = (process.env.ADM26_PHONE_CORPORA ?? "")
  .split(delimiter)
  .filter(Boolean);

describe("export des téléphones (ADM-26)", () => {
  it("ne perd, dans une valeur réécrite, aucun chiffre ni aucun signe saisi entre deux chiffres, et garde ce qui sépare un numéro de ce qui le suit", () => {
    rewritten = 0;
    const failures = [
      ...fuzz(40_000).flatMap(value => lost(value)),
      ...honest(40_000).flatMap(({ input, limits }) => lost(input, limits)),
    ];
    expect(failures.slice(0, 20)).toEqual([]);
    // Not a vacuous property: a good share of the values is read as a number, a date or a fraction, and rewritten.
    expect(rewritten).toBeGreaterThan(5_000);
  });

  it.skipIf(CORPORA.length === 0)(
    "tient la même propriété sur le fuzz et les corpus honnêtes des vérifications précédentes",
    () => {
      const failures: string[] = [];
      const seen = new Set<string>();
      rewritten = 0;
      for (const file of CORPORA) {
        for (const entry of JSON.parse(readFileSync(file, "utf8")) as Array<
          | string
          | { input: string; number?: string; rest?: string; before?: string[] }
        >) {
          const input = typeof entry === "string" ? entry : entry.input;
          if (seen.has(input)) continue;
          seen.add(input);
          const before =
            typeof entry === "string"
              ? []
              : (entry.before ??
                (entry.number !== undefined && /\d/.test(entry.rest ?? "")
                  ? [entry.number]
                  : []));
          failures.push(
            ...lost(
              input,
              before.map(items => digitsAndGaps(items).digits.length - 1)
            )
          );
        }
      }
      expect({ values: seen.size, failures: failures.slice(0, 20) }).toEqual({
        values: seen.size,
        failures: [],
      });
      console.info(
        `ADM-26: ${seen.size} values, ${rewritten} rewritten, none losing a digit or a sign typed between two digits`
      );
    },
    600_000
  );
});

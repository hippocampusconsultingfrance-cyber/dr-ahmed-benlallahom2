/**
 * TEST-ONLY in-memory PostgreSQL stand-in for behavioural unit tests.
 *
 * It plugs into drizzle's `pg-proxy` driver and executes the small SQL subset
 * drizzle generates for the queries of this code base (single-table SELECT /
 * INSERT / UPDATE / DELETE with AND/OR/IN/IS NULL predicates, lower(), ORDER BY, LIMIT,
 * RETURNING, ON CONFLICT DO NOTHING / DO UPDATE). Anything else throws, so a
 * test never passes on a silently ignored statement. DDL statements sent with
 * `db.execute` (CREATE ... IF NOT EXISTS, ALTER ... IF NOT EXISTS) are recorded
 * and treated as no-ops. Never imported by production code.
 */
import { drizzle } from "drizzle-orm/pg-proxy";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { is, SQL } from "drizzle-orm";

type Value = string | number | boolean | null;
type Row = Record<string, Value>;
type Token = { kind: "ident" | "param" | "number" | "word" | "op" | "punct" | "string"; text: string };

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** PostgreSQL `timestamp without time zone` text, which drizzle parses back with "+0000". */
export function pgTimestamp(date: Date) {
  return date.toISOString().replace("T", " ").replace("Z", "");
}

function normalize(value: unknown): Value {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return pgTimestamp(value);
  if (typeof value === "string" && ISO_INSTANT.test(value)) return pgTimestamp(new Date(value));
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function tokenize(sqlText: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sqlText.length) {
    const char = sqlText[i]!;
    if (/\s/.test(char)) { i += 1; continue; }
    if (char === '"') {
      const end = sqlText.indexOf('"', i + 1);
      tokens.push({ kind: "ident", text: sqlText.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (char === "'") {
      let end = i + 1;
      let text = "";
      while (end < sqlText.length) {
        if (sqlText[end] === "'" && sqlText[end + 1] === "'") { text += "'"; end += 2; continue; }
        if (sqlText[end] === "'") break;
        text += sqlText[end];
        end += 1;
      }
      tokens.push({ kind: "string", text });
      i = end + 1;
      continue;
    }
    if (char === "$") {
      const match = /^\$(\d+)/.exec(sqlText.slice(i))!;
      tokens.push({ kind: "param", text: match[1]! });
      i += match[0].length;
      continue;
    }
    const number = /^\d+(\.\d+)?/.exec(sqlText.slice(i));
    if (number) { tokens.push({ kind: "number", text: number[0] }); i += number[0].length; continue; }
    const op = /^(<>|<=|>=|!=|::|=|<|>|\+|-|\*)/.exec(sqlText.slice(i));
    if (op) { tokens.push({ kind: "op", text: op[0] }); i += op[0].length; continue; }
    if ("(),.;".includes(char)) { tokens.push({ kind: "punct", text: char }); i += 1; continue; }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sqlText.slice(i));
    if (word) { tokens.push({ kind: "word", text: word[0].toLowerCase() }); i += word[0].length; continue; }
    throw new Error(`memoryPgProxy: unexpected character ${char} in ${sqlText}`);
  }
  return tokens;
}

type Expr =
  | { type: "param"; index: number }
  | { type: "literal"; value: Value }
  | { type: "column"; name: string }
  | { type: "binary"; op: string; left: Expr; right: Expr }
  | { type: "isNull"; expr: Expr; negated: boolean }
  | { type: "in"; expr: Expr; list: Expr[]; negated: boolean }
  | { type: "like"; expr: Expr; pattern: Expr; negated: boolean; caseInsensitive: boolean }
  | { type: "and" | "or"; items: Expr[] }
  | { type: "not"; expr: Expr }
  | { type: "now" }
  | { type: "lower"; expr: Expr }
  | { type: "count" }
  | { type: "case"; whens: Array<[Expr, Expr]>; otherwise: Expr | null };

class Parser {
  private position = 0;
  constructor(private readonly tokens: Token[], private readonly sqlText: string) {}

  peek(offset = 0) { return this.tokens[this.position + offset]; }
  done() { return this.position >= this.tokens.length || this.peek()?.text === ";"; }
  next() {
    const token = this.tokens[this.position];
    if (!token) throw new Error(`memoryPgProxy: unexpected end of ${this.sqlText}`);
    this.position += 1;
    return token;
  }
  isWord(...words: string[]) {
    return words.every((word, offset) => this.peek(offset)?.kind === "word" && this.peek(offset)?.text === word);
  }
  acceptWord(...words: string[]) {
    if (!this.isWord(...words)) return false;
    this.position += words.length;
    return true;
  }
  expectWord(...words: string[]) {
    if (!this.acceptWord(...words)) throw new Error(`memoryPgProxy: expected "${words.join(" ")}" near token ${this.position} of ${this.sqlText}`);
  }
  acceptPunct(text: string) {
    if (this.peek()?.kind === "punct" && this.peek()?.text === text) { this.position += 1; return true; }
    return false;
  }
  expectPunct(text: string) {
    if (!this.acceptPunct(text)) throw new Error(`memoryPgProxy: expected "${text}" near token ${this.position} of ${this.sqlText}`);
  }
  ident() {
    const token = this.next();
    if (token.kind !== "ident") throw new Error(`memoryPgProxy: expected identifier, got ${token.text} in ${this.sqlText}`);
    return token.text;
  }
  /** `"col"` or `"table"."col"` → column name. */
  columnRef() {
    const first = this.ident();
    if (this.acceptPunct(".")) return this.ident();
    return first;
  }

  expression(): Expr { return this.orExpr(); }
  private orExpr(): Expr {
    const items = [this.andExpr()];
    while (this.acceptWord("or")) items.push(this.andExpr());
    return items.length === 1 ? items[0]! : { type: "or", items };
  }
  private andExpr(): Expr {
    const items = [this.notExpr()];
    while (this.acceptWord("and")) items.push(this.notExpr());
    return items.length === 1 ? items[0]! : { type: "and", items };
  }
  private notExpr(): Expr {
    if (this.acceptWord("not")) return { type: "not", expr: this.notExpr() };
    return this.predicate();
  }
  private predicate(): Expr {
    const left = this.additive();
    if (this.acceptWord("is", "not", "null")) return { type: "isNull", expr: left, negated: true };
    if (this.acceptWord("is", "null")) return { type: "isNull", expr: left, negated: false };
    const negated = this.acceptWord("not");
    if (this.acceptWord("in")) {
      this.expectPunct("(");
      const list: Expr[] = [];
      if (!this.acceptPunct(")")) {
        do list.push(this.additive()); while (this.acceptPunct(","));
        this.expectPunct(")");
      }
      return { type: "in", expr: left, list, negated };
    }
    if (this.isWord("like") || this.isWord("ilike")) {
      const caseInsensitive = this.next().text === "ilike";
      return { type: "like", expr: left, pattern: this.additive(), negated, caseInsensitive };
    }
    if (negated) throw new Error(`memoryPgProxy: unsupported NOT predicate in ${this.sqlText}`);
    const token = this.peek();
    if (token?.kind === "op" && ["=", "<>", "!=", "<", ">", "<=", ">="].includes(token.text)) {
      this.next();
      return { type: "binary", op: token.text, left, right: this.additive() };
    }
    return left;
  }
  additive(): Expr {
    let left = this.primary();
    while (this.peek()?.kind === "op" && ["+", "-"].includes(this.peek()!.text)) {
      const op = this.next().text;
      left = { type: "binary", op, left, right: this.primary() };
    }
    return left;
  }
  private primary(): Expr {
    const token = this.peek();
    if (!token) throw new Error(`memoryPgProxy: unexpected end of ${this.sqlText}`);
    let expr: Expr;
    if (token.kind === "punct" && token.text === "(") {
      this.next();
      expr = this.expression();
      this.expectPunct(")");
    } else if (token.kind === "param") {
      this.next();
      expr = { type: "param", index: Number(token.text) - 1 };
    } else if (token.kind === "number") {
      this.next();
      expr = { type: "literal", value: Number(token.text) };
    } else if (token.kind === "string") {
      this.next();
      expr = { type: "literal", value: token.text };
    } else if (token.kind === "ident") {
      expr = { type: "column", name: this.columnRef() };
    } else if (token.kind === "word" && token.text === "null") {
      this.next();
      expr = { type: "literal", value: null };
    } else if (token.kind === "word" && (token.text === "true" || token.text === "false")) {
      this.next();
      expr = { type: "literal", value: token.text === "true" };
    } else if (token.kind === "word" && token.text === "now") {
      this.next();
      this.expectPunct("(");
      this.expectPunct(")");
      expr = { type: "now" };
    } else if (token.kind === "word" && token.text === "lower" && this.peek(1)?.text === "(") {
      this.next();
      this.expectPunct("(");
      expr = { type: "lower", expr: this.expression() };
      this.expectPunct(")");
    } else if (token.kind === "word" && token.text === "case") {
      this.next();
      const whens: Array<[Expr, Expr]> = [];
      while (this.acceptWord("when")) {
        const condition = this.expression();
        this.expectWord("then");
        whens.push([condition, this.expression()]);
      }
      const otherwise = this.acceptWord("else") ? this.expression() : null;
      this.expectWord("end");
      expr = { type: "case", whens, otherwise };
    } else if (token.kind === "word" && token.text === "count") {
      this.next();
      this.expectPunct("(");
      if (this.peek()?.text === "*") this.next(); else this.expression();
      this.expectPunct(")");
      expr = { type: "count" };
    } else {
      throw new Error(`memoryPgProxy: unsupported token ${token.text} in ${this.sqlText}`);
    }
    // Ignore casts such as ::int.
    while (this.peek()?.kind === "op" && this.peek()?.text === "::") { this.next(); this.next(); }
    return expr;
  }
}

function compare(a: Value, b: Value) {
  if (typeof a === "number" && typeof b === "string" && b.trim() !== "" && !Number.isNaN(Number(b))) return a - Number(b);
  if (typeof a === "string" && typeof b === "number" && a.trim() !== "" && !Number.isNaN(Number(a))) return Number(a) - b;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function evaluate(expr: Expr, row: Row, params: unknown[], now: string): Value {
  switch (expr.type) {
    case "param": return normalize(params[expr.index]);
    case "literal": return expr.value;
    case "column": {
      if (!(expr.name in row)) throw new Error(`memoryPgProxy: unknown column ${expr.name}`);
      return row[expr.name] ?? null;
    }
    case "now": return now;
    case "lower": {
      const value = evaluate(expr.expr, row, params, now);
      return typeof value === "string" ? value.toLowerCase() : value;
    }
    case "count": throw new Error("memoryPgProxy: count(*) is only supported as a select expression");
    case "case": {
      for (const [condition, value] of expr.whens) {
        if (evaluate(condition, row, params, now) === true) return evaluate(value, row, params, now);
      }
      return expr.otherwise ? evaluate(expr.otherwise, row, params, now) : null;
    }
    case "isNull": {
      const value = evaluate(expr.expr, row, params, now);
      return expr.negated ? value !== null : value === null;
    }
    case "in": {
      const value = evaluate(expr.expr, row, params, now);
      if (value === null) return null;
      const found = expr.list.some(item => compare(value, evaluate(item, row, params, now)) === 0);
      return expr.negated ? !found : found;
    }
    case "like": {
      const value = evaluate(expr.expr, row, params, now);
      const pattern = evaluate(expr.pattern, row, params, now);
      if (value === null || pattern === null) return null;
      const source = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
      const matched = new RegExp(`^${source}$`, expr.caseInsensitive ? "is" : "s").test(String(value));
      return expr.negated ? !matched : matched;
    }
    case "and": return expr.items.every(item => evaluate(item, row, params, now) === true);
    case "or": return expr.items.some(item => evaluate(item, row, params, now) === true);
    case "not": return evaluate(expr.expr, row, params, now) !== true;
    case "binary": {
      const left = evaluate(expr.left, row, params, now);
      const right = evaluate(expr.right, row, params, now);
      if (expr.op === "+" || expr.op === "-") {
        if (left === null || right === null) return null;
        return expr.op === "+" ? Number(left) + Number(right) : Number(left) - Number(right);
      }
      if (left === null || right === null) return null;
      const order = compare(left, right);
      switch (expr.op) {
        case "=": return order === 0;
        case "<>": case "!=": return order !== 0;
        case "<": return order < 0;
        case ">": return order > 0;
        case "<=": return order <= 0;
        case ">=": return order >= 0;
      }
    }
  }
  throw new Error("memoryPgProxy: unsupported expression");
}

type TableMeta = {
  columns: string[];
  defaults: Record<string, () => Value>;
  serial: string[];
  uniqueSets: string[][];
};

export type MemoryPg = ReturnType<typeof createMemoryPg>;

export function createMemoryPg(tables: PgTable[], options: { now?: () => Date } = {}) {
  const clock = options.now ?? (() => new Date());
  const meta = new Map<string, TableMeta>();
  const data = new Map<string, Row[]>();
  const sequences = new Map<string, number>();
  const statements: Array<{ sql: string; params: unknown[] }> = [];

  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => column.name);
    const defaults: TableMeta["defaults"] = {};
    const serial: string[] = [];
    const uniqueSets: string[][] = [];
    for (const column of config.columns) {
      if (column.columnType === "PgSerial") serial.push(column.name);
      else if (column.hasDefault && column.default !== undefined) {
        const fallback = column.default;
        defaults[column.name] = is(fallback, SQL) ? () => pgTimestamp(clock()) : () => normalize(fallback);
      }
      if (column.isUnique || column.primary) uniqueSets.push([column.name]);
    }
    for (const index of config.indexes) {
      if (index.config.unique) uniqueSets.push(index.config.columns.map(column => (column as { name: string }).name));
    }
    for (const constraint of config.uniqueConstraints) uniqueSets.push(constraint.columns.map(column => column.name));
    meta.set(config.name, { columns, defaults, serial, uniqueSets });
    data.set(config.name, []);
  }

  function tableMeta(name: string) {
    const found = meta.get(name);
    if (!found) throw new Error(`memoryPgProxy: table ${name} is not registered in this test`);
    return found;
  }

  function nextId(table: string) {
    const value = (sequences.get(table) ?? 0) + 1;
    sequences.set(table, value);
    return value;
  }

  function project(parser: Parser) {
    const columns: string[] = [];
    do columns.push(parser.columnRef()); while (parser.acceptPunct(","));
    return columns;
  }

  function returning(parser: Parser, rows: Row[]) {
    if (!parser.acceptWord("returning")) return null;
    const columns = project(parser);
    return rows.map(row => columns.map(column => row[column] ?? null));
  }

  function conflicts(table: string, candidate: Row) {
    const { uniqueSets } = tableMeta(table);
    return (data.get(table) ?? []).find(existing => uniqueSets.some(set => set.every(column => candidate[column] !== null && candidate[column] !== undefined && compare(existing[column] ?? null, candidate[column] ?? null) === 0)));
  }

  function execute(sqlText: string, params: unknown[]) {
    statements.push({ sql: sqlText, params });
    const now = pgTimestamp(clock());
    const tokens = tokenize(sqlText);
    const parser = new Parser(tokens, sqlText);
    const first = tokens[0]?.text;

    if (first === "create" || first === "alter" || first === "comment" || first === "do") return { rows: [] as Value[][], rowCount: 0 };

    if (parser.acceptWord("select")) {
      const selections: Array<{ count: true } | { expr: Expr }> = [];
      do {
        if (parser.isWord("count")) {
          parser.additive();
          selections.push({ count: true });
        } else {
          selections.push({ expr: parser.expression() });
        }
      } while (parser.acceptPunct(","));
      parser.expectWord("from");
      const table = parser.ident();
      if (parser.isWord("left") || parser.isWord("inner") || parser.isWord("join")) throw new Error(`memoryPgProxy: joins are not supported (${sqlText})`);
      const where = parser.acceptWord("where") ? parser.expression() : null;
      tableMeta(table);
      let rows = data.get(table)!.filter(row => !where || evaluate(where, row, params, now) === true);
      if (parser.acceptWord("order", "by")) {
        const orders: Array<{ expr: Expr; desc: boolean }> = [];
        do {
          const expr = parser.additive();
          const desc = parser.acceptWord("desc");
          if (!desc) parser.acceptWord("asc");
          orders.push({ expr, desc });
        } while (parser.acceptPunct(","));
        rows = [...rows].sort((a, b) => {
          for (const order of orders) {
            const left = evaluate(order.expr, a, params, now);
            const right = evaluate(order.expr, b, params, now);
            if (left === right) continue;
            if (left === null) return order.desc ? -1 : 1;
            if (right === null) return order.desc ? 1 : -1;
            const result = compare(left, right);
            if (result !== 0) return order.desc ? -result : result;
          }
          return 0;
        });
      }
      let limit = Infinity;
      let offset = 0;
      while (!parser.done()) {
        if (parser.acceptWord("limit")) limit = Number(evaluate(parser.additive(), {}, params, now));
        else if (parser.acceptWord("offset")) offset = Number(evaluate(parser.additive(), {}, params, now));
        else if (parser.acceptWord("for", "update")) continue;
        else throw new Error(`memoryPgProxy: unsupported select clause in ${sqlText}`);
      }
      if (selections.some(selection => "count" in selection)) {
        return { rows: [selections.map(selection => "count" in selection ? rows.length : null)], rowCount: 1 };
      }
      const page = rows.slice(offset, offset + limit);
      return { rows: page.map(row => selections.map(selection => evaluate((selection as { expr: Expr }).expr, row, params, now))), rowCount: page.length };
    }

    if (parser.acceptWord("insert", "into")) {
      const table = parser.ident();
      const { columns: knownColumns, defaults, serial } = tableMeta(table);
      parser.expectPunct("(");
      const columns: string[] = [];
      do columns.push(parser.ident()); while (parser.acceptPunct(","));
      parser.expectPunct(")");
      parser.expectWord("values");
      const tuples: Array<Array<Expr | "default">> = [];
      do {
        parser.expectPunct("(");
        const values: Array<Expr | "default"> = [];
        do {
          if (parser.acceptWord("default")) values.push("default");
          else values.push(parser.additive());
        } while (parser.acceptPunct(","));
        parser.expectPunct(")");
        tuples.push(values);
      } while (parser.acceptPunct(","));
      let onConflict: null | { action: "nothing" } | { action: "update"; target: string[]; set: Array<[string, Expr]> } = null;
      if (parser.acceptWord("on", "conflict")) {
        const target: string[] = [];
        if (parser.acceptPunct("(")) {
          do target.push(parser.ident()); while (parser.acceptPunct(","));
          parser.expectPunct(")");
        }
        parser.expectWord("do");
        if (parser.acceptWord("nothing")) onConflict = { action: "nothing" };
        else {
          parser.expectWord("update", "set");
          const set: Array<[string, Expr]> = [];
          do {
            const column = parser.ident();
            if (parser.next().text !== "=") throw new Error(`memoryPgProxy: expected = in ${sqlText}`);
            set.push([column, parser.additive()]);
          } while (parser.acceptPunct(","));
          onConflict = { action: "update", target, set };
        }
      }
      const affected: Row[] = [];
      for (const tuple of tuples) {
        const row: Row = Object.fromEntries(knownColumns.map(column => [column, null]));
        columns.forEach((column, index) => {
          const value = tuple[index]!;
          if (value === "default") row[column] = serial.includes(column) ? null : defaults[column]?.() ?? null;
          else row[column] = evaluate(value, row, params, now);
        });
        for (const column of knownColumns) {
          if (!columns.includes(column) && !serial.includes(column)) row[column] = defaults[column]?.() ?? null;
        }
        const existing = conflicts(table, row);
        if (existing) {
          if (!onConflict) throw new Error(`memoryPgProxy: duplicate key in ${table}`);
          if (onConflict.action === "nothing") continue;
          for (const [column, expr] of onConflict.set) existing[column] = evaluate(expr, existing, params, now);
          affected.push(existing);
          continue;
        }
        for (const column of serial) if (row[column] === null) row[column] = nextId(table);
        data.get(table)!.push(row);
        affected.push(row);
      }
      const returned = returning(parser, affected);
      return { rows: returned ?? [], rowCount: affected.length };
    }

    if (parser.acceptWord("update")) {
      const table = parser.ident();
      tableMeta(table);
      parser.expectWord("set");
      const set: Array<[string, Expr]> = [];
      do {
        const column = parser.ident();
        if (parser.next().text !== "=") throw new Error(`memoryPgProxy: expected = in ${sqlText}`);
        set.push([column, parser.additive()]);
      } while (parser.acceptPunct(","));
      const where = parser.acceptWord("where") ? parser.expression() : null;
      const affected = data.get(table)!.filter(row => !where || evaluate(where, row, params, now) === true);
      for (const row of affected) {
        const next = Object.fromEntries(set.map(([column, expr]) => [column, evaluate(expr, row, params, now)]));
        Object.assign(row, next);
      }
      const returned = returning(parser, affected);
      return { rows: returned ?? [], rowCount: affected.length };
    }

    if (parser.acceptWord("delete", "from")) {
      const table = parser.ident();
      tableMeta(table);
      const where = parser.acceptWord("where") ? parser.expression() : null;
      const rows = data.get(table)!;
      const affected = rows.filter(row => !where || evaluate(where, row, params, now) === true);
      data.set(table, rows.filter(row => !affected.includes(row)));
      const returned = returning(parser, affected);
      return { rows: returned ?? [], rowCount: affected.length };
    }

    throw new Error(`memoryPgProxy: unsupported statement ${sqlText}`);
  }

  const db = drizzle(async (sqlText, params, method) => {
    const result = execute(sqlText, params);
    if (method === "execute") {
      // Statements without RETURNING resolve to the driver result object, like
      // drizzle-orm/neon-http ({ rows, rowCount }).
      return { rows: { rows: result.rows, rowCount: result.rowCount } as any };
    }
    return { rows: result.rows as any };
  });

  return {
    db,
    statements,
    rows(table: PgTable | string) {
      const name = typeof table === "string" ? table : getTableConfig(table).name;
      tableMeta(name);
      return data.get(name)!;
    },
    /** Inserts raw rows (database column names); serial ids and defaults are filled in. */
    seed(table: PgTable, rows: Array<Record<string, unknown>>) {
      const name = getTableConfig(table).name;
      const { columns, defaults, serial } = tableMeta(name);
      return rows.map(input => {
        const unknown = Object.keys(input).filter(column => !columns.includes(column));
        if (unknown.length) throw new Error(`memoryPgProxy: unknown column(s) ${unknown.join(", ")} for ${name}`);
        const row: Row = Object.fromEntries(columns.map(column => [column, null]));
        for (const column of columns) {
          if (column in input) row[column] = normalize(input[column]);
          else if (serial.includes(column)) row[column] = nextId(name);
          else row[column] = defaults[column]?.() ?? null;
        }
        for (const column of serial) {
          const value = row[column];
          if (typeof value === "number" && value > (sequences.get(name) ?? 0)) sequences.set(name, value);
        }
        data.get(name)!.push(row);
        return row;
      });
    },
  };
}

/**
 * TEST-ONLY in-memory stand-in for the drizzle `neon-http` database used by the
 * candidate portal tests. It renders drizzle conditions and SQL fragments with
 * the real PgDialect, then evaluates the resulting SQL expression on in-memory
 * rows. It supports the query shapes used by the candidate code paths:
 * select/from/innerJoin/leftJoin/where/orderBy/limit, insert/values/returning,
 * onConflictDoUpdate/onConflictDoNothing, update/set/where/returning and
 * delete/where. Each statement executes atomically (like a single SQL
 * statement), and every `await` yields, so read-modify-write races in the
 * application code are reproducible with concurrent calls.
 *
 * Never import this module from production code.
 */
import { Column, SQL, Table, getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";

type Row = Record<string, unknown>;
type Context = Record<string, Row | null>;
type AnyTable = Table;

const dialect = new PgDialect();

class InMemorySqlError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Tiny SQL expression evaluator (the subset drizzle renders for this codebase)
// ---------------------------------------------------------------------------

type Token = { kind: "ident" | "param" | "number" | "string" | "op" | "word"; value: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index += 1; continue; }
    if (char === '"') {
      const end = source.indexOf('"', index + 1);
      tokens.push({ kind: "ident", value: source.slice(index + 1, end) });
      index = end + 1;
      continue;
    }
    if (char === "'") {
      let end = index + 1;
      let value = "";
      while (end < source.length) {
        if (source[end] === "'" && source[end + 1] === "'") { value += "'"; end += 2; continue; }
        if (source[end] === "'") break;
        value += source[end];
        end += 1;
      }
      tokens.push({ kind: "string", value });
      index = end + 1;
      continue;
    }
    if (char === "$") {
      const match = /^\$(\d+)/.exec(source.slice(index));
      if (!match) throw new InMemorySqlError(`unsupported token at ${source.slice(index)}`);
      tokens.push({ kind: "param", value: match[1] });
      index += match[0].length;
      continue;
    }
    const number = /^\d+(?:\.\d+)?/.exec(source.slice(index));
    if (number) { tokens.push({ kind: "number", value: number[0] }); index += number[0].length; continue; }
    const op = /^(<>|!=|>=|<=|::|=|>|<|\+|-|\*|\/|\(|\)|,|\.)/.exec(source.slice(index));
    if (op) { tokens.push({ kind: "op", value: op[0] }); index += op[0].length; continue; }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index));
    if (word) { tokens.push({ kind: "word", value: word[0].toLowerCase() }); index += word[0].length; continue; }
    throw new InMemorySqlError(`unsupported character ${char} in ${source}`);
  }
  return tokens;
}

type Interval = { intervalMs: number };

function isInterval(value: unknown): value is Interval {
  return typeof value === "object" && value !== null && "intervalMs" in value;
}

function parseInterval(text: string): Interval {
  const match = /^\s*(\d+)\s*(second|minute|hour|day)s?\s*$/i.exec(text);
  if (!match) throw new InMemorySqlError(`unsupported interval ${text}`);
  const unit = match[2].toLowerCase();
  const factor = unit === "second" ? 1000 : unit === "minute" ? 60_000 : unit === "hour" ? 3_600_000 : 86_400_000;
  return { intervalMs: Number(match[1]) * factor };
}

function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return Date.parse(value);
  return value;
}

class ExpressionParser {
  private position = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly params: unknown[],
    private readonly resolveColumn: (table: string | null, column: string) => unknown,
  ) {}

  evaluate(): unknown {
    const value = this.orExpression();
    if (this.position < this.tokens.length) throw new InMemorySqlError(`unexpected token ${this.tokens[this.position].value}`);
    return value;
  }

  private peek(offset = 0) { return this.tokens[this.position + offset]; }
  private isWord(value: string, offset = 0) { const token = this.peek(offset); return token?.kind === "word" && token.value === value; }
  private isOp(value: string, offset = 0) { const token = this.peek(offset); return token?.kind === "op" && token.value === value; }
  private expectWord(value: string) { if (!this.isWord(value)) throw new InMemorySqlError(`expected ${value}`); this.position += 1; }
  private expectOp(value: string) { if (!this.isOp(value)) throw new InMemorySqlError(`expected ${value} near ${this.peek()?.value}`); this.position += 1; }

  private orExpression(): unknown {
    let left = this.andExpression();
    while (this.isWord("or")) {
      this.position += 1;
      const right = this.andExpression();
      left = left === true || right === true ? true : left === null || right === null ? null : false;
    }
    return left;
  }

  private andExpression(): unknown {
    let left = this.notExpression();
    while (this.isWord("and")) {
      this.position += 1;
      const right = this.notExpression();
      left = left === false || right === false ? false : left === null || right === null ? null : true;
    }
    return left;
  }

  private notExpression(): unknown {
    if (this.isWord("not")) {
      this.position += 1;
      const value = this.notExpression();
      return value === null ? null : !value;
    }
    return this.comparison();
  }

  private comparison(): unknown {
    const left = this.additive();
    const token = this.peek();
    if (token?.kind === "op" && ["=", "<>", "!=", ">", "<", ">=", "<="].includes(token.value)) {
      this.position += 1;
      const right = this.additive();
      if (left === null || left === undefined || right === null || right === undefined) return null;
      const a = comparable(left) as number | string;
      const b = comparable(right) as number | string;
      switch (token.value) {
        case "=": return a === b;
        case "<>": case "!=": return a !== b;
        case ">": return a > b;
        case "<": return a < b;
        case ">=": return a >= b;
        default: return a <= b;
      }
    }
    if (this.isWord("is")) {
      this.position += 1;
      const negate = this.isWord("not");
      if (negate) this.position += 1;
      this.expectWord("null");
      const isNullValue = left === null || left === undefined;
      return negate ? !isNullValue : isNullValue;
    }
    const negateIn = this.isWord("not") && this.isWord("in", 1);
    if (negateIn || this.isWord("in")) {
      this.position += negateIn ? 2 : 1;
      this.expectOp("(");
      const values: unknown[] = [];
      if (!this.isOp(")")) {
        values.push(this.orExpression());
        while (this.isOp(",")) { this.position += 1; values.push(this.orExpression()); }
      }
      this.expectOp(")");
      if (left === null || left === undefined) return null;
      const found = values.some(value => comparable(value) === comparable(left));
      return negateIn ? !found : found;
    }
    return left;
  }

  private additive(): unknown {
    let left = this.primary();
    while (this.isOp("+") || this.isOp("-")) {
      const operator = this.peek().value;
      this.position += 1;
      const right = this.primary();
      if (left === null || left === undefined || right === null || right === undefined) { left = null; continue; }
      if (left instanceof Date && isInterval(right)) {
        left = new Date(left.getTime() + (operator === "+" ? right.intervalMs : -right.intervalMs));
      } else {
        left = operator === "+" ? Number(left) + Number(right) : Number(left) - Number(right);
      }
    }
    return left;
  }

  private primary(): unknown {
    const token = this.peek();
    if (!token) throw new InMemorySqlError("unexpected end of expression");
    if (this.isOp("(")) {
      this.position += 1;
      const value = this.orExpression();
      this.expectOp(")");
      return this.cast(value);
    }
    if (this.isWord("case")) {
      this.position += 1;
      let result: unknown = null;
      let matched = false;
      while (this.isWord("when")) {
        this.position += 1;
        const condition = this.orExpression();
        this.expectWord("then");
        const value = this.orExpression();
        if (!matched && condition === true) { matched = true; result = value; }
      }
      if (this.isWord("else")) {
        this.position += 1;
        const value = this.orExpression();
        if (!matched) result = value;
      }
      this.expectWord("end");
      return this.cast(result);
    }
    if (token.kind === "param") { this.position += 1; return this.cast(this.params[Number(token.value) - 1]); }
    if (token.kind === "number") { this.position += 1; return this.cast(Number(token.value)); }
    if (token.kind === "string") { this.position += 1; return this.cast(token.value); }
    if (token.kind === "word") {
      if (token.value === "null") { this.position += 1; return null; }
      if (token.value === "true") { this.position += 1; return true; }
      if (token.value === "false") { this.position += 1; return false; }
      if (token.value === "interval") {
        this.position += 1;
        const literal = this.peek();
        if (literal?.kind !== "string") throw new InMemorySqlError("interval literal expected");
        this.position += 1;
        return parseInterval(literal.value);
      }
      if (this.isOp("(", 1)) return this.functionCall(token.value);
      if (token.value === "excluded" && this.isOp(".", 1)) {
        this.position += 2;
        const column = this.peek();
        this.position += 1;
        return this.resolveColumn("excluded", column.value);
      }
    }
    if (token.kind === "ident") {
      this.position += 1;
      if (this.isOp(".")) {
        this.position += 1;
        const column = this.peek();
        this.position += 1;
        return this.cast(this.resolveColumn(token.value, column.value));
      }
      return this.cast(this.resolveColumn(null, token.value));
    }
    throw new InMemorySqlError(`unsupported token ${token.value}`);
  }

  private cast(value: unknown): unknown {
    if (!this.isOp("::")) return value;
    this.position += 1;
    const type = this.peek();
    this.position += 1;
    if (type.value === "int" || type.value === "integer") return value === null ? null : Number(value);
    if (type.value === "timestamp") return value === null ? null : new Date(comparable(value) as number);
    return value;
  }

  private functionCall(name: string): unknown {
    this.position += 1;
    this.expectOp("(");
    const args: unknown[] = [];
    if (!this.isOp(")")) {
      args.push(this.orExpression());
      while (this.isOp(",")) { this.position += 1; args.push(this.orExpression()); }
    }
    this.expectOp(")");
    switch (name) {
      case "now": return new Date();
      case "lower": return typeof args[0] === "string" ? args[0].toLowerCase() : args[0];
      case "coalesce": return args.find(value => value !== null && value !== undefined) ?? null;
      case "greatest": return args.filter(value => value !== null && value !== undefined).reduce<unknown>((a, b) => a === null || (comparable(a) as number) >= (comparable(b) as number) ? (a ?? b) : b, null);
      case "least": return args.filter(value => value !== null && value !== undefined).reduce<unknown>((a, b) => a === null || (comparable(a) as number) <= (comparable(b) as number) ? (a ?? b) : b, null);
      default: throw new InMemorySqlError(`unsupported function ${name}`);
    }
  }
}

function evaluateSql(fragment: SQL, resolveColumn: (table: string | null, column: string) => unknown): unknown {
  const query = dialect.sqlToQuery(fragment);
  return new ExpressionParser(tokenize(query.sql), query.params, resolveColumn).evaluate();
}

// ---------------------------------------------------------------------------
// Tables and rows
// ---------------------------------------------------------------------------

type TableMeta = { name: string; columnsByDbName: Map<string, string>; columns: Record<string, Column>; uniqueKeys: string[][] };

function tableMeta(table: AnyTable): TableMeta {
  const columns = getTableColumns(table) as Record<string, Column>;
  const columnsByDbName = new Map<string, string>();
  for (const [key, column] of Object.entries(columns)) columnsByDbName.set(column.name, key);
  // Single-column unique/primary keys plus composite unique indexes (uniqueIndex(...).on(a, b)).
  const uniqueKeys: string[][] = Object.entries(columns).filter(([, column]) => column.isUnique || column.primary).map(([key]) => [key]);
  for (const index of getTableConfig(table as Parameters<typeof getTableConfig>[0]).indexes) {
    if (!index.config.unique) continue;
    // pg-core wraps index columns in IndexedColumn objects that only keep the database name.
    const keys = index.config.columns.map(column => (is(column, SQL) ? undefined : columnsByDbName.get((column as { name: string }).name)));
    if (keys.every((key): key is string => typeof key === "string")) uniqueKeys.push(keys);
  }
  return { name: getTableName(table), columnsByDbName, columns, uniqueKeys };
}

function sameKey(left: Row, right: Row, keys: string[]): boolean {
  return keys.every(key => left[key] !== null && left[key] !== undefined && comparable(left[key]) === comparable(right[key]));
}

function columnTableName(column: Column): string {
  return getTableName(column.table);
}

export class InMemoryDrizzle {
  readonly data = new Map<string, Row[]>();
  readonly statements: Array<{ op: "select" | "insert" | "update" | "delete"; table: string }> = [];
  private readonly sequences = new Map<string, number>();
  private readonly metas = new Map<string, TableMeta>();

  /** Rows of a table (live array; tests may inspect or seed it). */
  rows(table: AnyTable): Row[] {
    const name = getTableName(table);
    this.metas.set(name, this.metas.get(name) ?? tableMeta(table));
    if (!this.data.has(name)) this.data.set(name, []);
    return this.data.get(name)!;
  }

  /** Inserts a row directly, applying defaults, and returns it. */
  seed(table: AnyTable, values: Row): Row {
    return this.insertRow(table, values);
  }

  meta(name: string): TableMeta {
    const meta = this.metas.get(name);
    if (!meta) throw new InMemorySqlError(`unknown table ${name}`);
    return meta;
  }

  resolver(context: Context) {
    return (table: string | null, column: string): unknown => {
      const tableNames = table ? [table] : Object.keys(context);
      for (const name of tableNames) {
        const row = context[name];
        if (row === undefined) continue;
        if (name === "excluded") { if (row && column in row) return row[column]; continue; }
        const meta = this.metas.get(name);
        const key = meta?.columnsByDbName.get(column);
        if (key) return row ? row[key] ?? null : null;
      }
      throw new InMemorySqlError(`unknown column ${table ?? "?"}.${column}`);
    };
  }

  evaluate(fragment: SQL | undefined, context: Context): unknown {
    if (!fragment) return true;
    return evaluateSql(fragment, this.resolver(context));
  }

  value(input: unknown, context: Context): unknown {
    if (is(input, SQL)) return this.evaluate(input, context);
    if (is(input, Column)) return this.evaluate(sql`${input}`, context);
    return input;
  }

  insertRow(table: AnyTable, values: Row): Row {
    const meta = tableMeta(table);
    this.metas.set(meta.name, meta);
    const rows = this.rows(table);
    const row: Row = {};
    for (const [key, column] of Object.entries(meta.columns)) {
      let value = values[key];
      if (value === undefined) {
        if (column.columnType === "PgSerial") {
          const next = (this.sequences.get(meta.name) ?? 0) + 1;
          this.sequences.set(meta.name, next);
          value = next;
        } else if (column.hasDefault && column.default !== undefined) {
          value = is(column.default, SQL) ? this.value(column.default, {}) : column.default;
        } else if (column.defaultFn) {
          value = column.defaultFn();
        } else {
          value = null;
        }
      } else {
        value = this.value(value, { [meta.name]: row, excluded: values });
        if (key === "id" && typeof value === "number") this.sequences.set(meta.name, Math.max(this.sequences.get(meta.name) ?? 0, value));
      }
      if (value === null && column.notNull) throw new InMemorySqlError(`null value in column "${column.name}" of relation "${meta.name}" violates not-null constraint`, "23502");
      row[key] = value;
    }
    for (const keys of meta.uniqueKeys) {
      if (rows.some(existing => sameKey(existing, row, keys))) {
        throw new InMemorySqlError(`duplicate key value violates unique constraint on ${meta.name}(${keys.join(", ")})`, "23505");
      }
    }
    rows.push(row);
    return row;
  }

  project(selection: Record<string, unknown> | undefined, context: Context, baseTable: string): Row {
    if (!selection) {
      const names = Object.keys(context);
      if (names.length === 1) return { ...(context[baseTable] ?? {}) };
      return Object.fromEntries(names.map(name => [name, context[name] ? { ...context[name] } : null]));
    }
    const result: Row = {};
    for (const [key, field] of Object.entries(selection)) {
      if (is(field, Table)) {
        const row = context[getTableName(field)];
        result[key] = row ? { ...row } : null;
      } else if (is(field, Column)) {
        const row = context[columnTableName(field)];
        const meta = this.meta(columnTableName(field));
        result[key] = row ? row[meta.columnsByDbName.get(field.name)!] ?? null : null;
      } else if (is(field, SQL)) {
        result[key] = this.evaluate(field, context);
      } else {
        throw new InMemorySqlError(`unsupported selection for ${key}`);
      }
    }
    return result;
  }

  select(selection?: Record<string, unknown>) { return new SelectQuery(this, selection); }
  insert(table: AnyTable) { return { values: (values: Row | Row[]) => new InsertQuery(this, table, Array.isArray(values) ? values : [values]) }; }
  update(table: AnyTable) { return { set: (values: Row) => new UpdateQuery(this, table, values) }; }
  delete(table: AnyTable) { return new DeleteQuery(this, table); }
}

abstract class Thenable<T> implements PromiseLike<T> {
  private promise: Promise<T> | null = null;
  protected abstract execute(): T;
  then<A = T, B = never>(onFulfilled?: ((value: T) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    // Yield once before executing so concurrent callers interleave between statements.
    this.promise ??= Promise.resolve().then(() => this.execute());
    return this.promise.then(onFulfilled, onRejected);
  }
  catch<B = never>(onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null) { return this.then(undefined, onRejected); }
  finally(onFinally?: (() => void) | null) { return this.then(value => { onFinally?.(); return value; }, reason => { onFinally?.(); throw reason; }); }
}

type Join = { table: AnyTable; on: SQL; kind: "inner" | "left" };

class SelectQuery extends Thenable<Row[]> {
  private table: AnyTable | null = null;
  private joins: Join[] = [];
  private condition: SQL | undefined;
  private order: SQL[] = [];
  private maxRows: number | null = null;
  private skip = 0;

  constructor(private readonly db: InMemoryDrizzle, private readonly selection?: Record<string, unknown>) { super(); }

  from(table: AnyTable) { this.table = table; this.db.rows(table); return this; }
  innerJoin(table: AnyTable, on: SQL) { this.db.rows(table); this.joins.push({ table, on, kind: "inner" }); return this; }
  leftJoin(table: AnyTable, on: SQL) { this.db.rows(table); this.joins.push({ table, on, kind: "left" }); return this; }
  where(condition: SQL | undefined) { this.condition = condition; return this; }
  orderBy(...order: SQL[]) { this.order = order; return this; }
  limit(count: number) { this.maxRows = count; return this; }
  offset(count: number) { this.skip = count; return this; }
  for() { return this; }

  protected execute(): Row[] {
    if (!this.table) throw new InMemorySqlError("select without from");
    const baseName = getTableName(this.table);
    this.db.statements.push({ op: "select", table: baseName });
    let contexts: Context[] = this.db.rows(this.table).map(row => ({ [baseName]: row }));
    for (const join of this.joins) {
      const joinName = getTableName(join.table);
      const next: Context[] = [];
      for (const context of contexts) {
        const matches = this.db.rows(join.table).filter(row => this.db.evaluate(join.on, { ...context, [joinName]: row }) === true);
        if (matches.length) for (const row of matches) next.push({ ...context, [joinName]: row });
        else if (join.kind === "left") next.push({ ...context, [joinName]: null });
      }
      contexts = next;
    }
    contexts = contexts.filter(context => this.db.evaluate(this.condition, context) === true);
    for (const fragment of [...this.order].reverse()) {
      // A bare column (orderBy(table.column)) sorts ascending.
      const rendered = is(fragment, Column) ? "" : dialect.sqlToQuery(fragment).sql;
      const descending = /\sdesc$/i.test(rendered);
      const expression = is(fragment, Column) ? sql`${fragment}` : sql.raw(rendered.replace(/\s(asc|desc)$/i, ""));
      contexts = [...contexts].sort((a, b) => {
        const left = comparable(this.db.evaluate(expression, a)) as number;
        const right = comparable(this.db.evaluate(expression, b)) as number;
        if (left === right) return 0;
        const ascending = left === null ? 1 : right === null ? -1 : left < right ? -1 : 1;
        return descending ? -ascending : ascending;
      });
    }
    const sliced = contexts.slice(this.skip, this.maxRows === null ? undefined : this.skip + this.maxRows);
    return sliced.map(context => this.db.project(this.selection, context, baseName));
  }
}

type ConflictAction = { kind: "nothing" | "update"; target: Column[]; set?: Row; where?: SQL };

class InsertQuery extends Thenable<Row[] | { rowCount: number; rows: Row[] }> {
  private returningSelection: Record<string, unknown> | null | undefined;
  private conflict: ConflictAction | null = null;

  constructor(private readonly db: InMemoryDrizzle, private readonly table: AnyTable, private readonly values: Row[]) { super(); }

  returning(selection?: Record<string, unknown>) { this.returningSelection = selection ?? null; return this; }
  onConflictDoNothing(config?: { target?: Column | Column[] }) {
    this.conflict = { kind: "nothing", target: config?.target ? ([] as Column[]).concat(config.target) : [] };
    return this;
  }
  onConflictDoUpdate(config: { target: Column | Column[]; set: Row; where?: SQL; setWhere?: SQL }) {
    this.conflict = { kind: "update", target: ([] as Column[]).concat(config.target), set: config.set, where: config.setWhere ?? config.where };
    return this;
  }

  protected execute() {
    const name = getTableName(this.table);
    this.db.statements.push({ op: "insert", table: name });
    this.db.rows(this.table);
    const affected: Row[] = [];
    for (const values of this.values) {
      const existing = this.conflict ? this.findConflict(values) : undefined;
      if (existing && this.conflict) {
        if (this.conflict.kind === "nothing") continue;
        const context: Context = { [name]: existing, excluded: this.excludedRow(values) };
        if (this.conflict.where && this.db.evaluate(this.conflict.where, context) !== true) continue;
        const updates: Row = {};
        for (const [key, value] of Object.entries(this.conflict.set ?? {})) {
          if (value !== undefined) updates[key] = this.db.value(value, context);
        }
        Object.assign(existing, updates);
        affected.push(existing);
        continue;
      }
      affected.push(this.db.insertRow(this.table, values));
    }
    if (this.returningSelection === undefined) return { rowCount: affected.length, rows: [] };
    return affected.map(row => this.db.project(this.returningSelection ?? undefined, { [name]: row }, name));
  }

  private excludedRow(values: Row): Row {
    const meta = this.db.meta(getTableName(this.table));
    const excluded: Row = {};
    for (const [key, column] of Object.entries(meta.columns)) excluded[column.name] = this.db.value(values[key] ?? null, {});
    return excluded;
  }

  private findConflict(values: Row): Row | undefined {
    if (!this.conflict) return undefined;
    const name = getTableName(this.table);
    const meta = this.db.meta(name);
    const candidate: Row = {};
    for (const key of Object.keys(meta.columns)) candidate[key] = this.db.value(values[key], {});
    // An explicit target names one constraint; without one, any unique constraint conflicts.
    const constraints = this.conflict.target.length
      ? [this.conflict.target.map(column => meta.columnsByDbName.get(column.name)!)]
      : meta.uniqueKeys.filter(keys => !(keys.length === 1 && meta.columns[keys[0]].columnType === "PgSerial" && candidate[keys[0]] === undefined));
    return this.db.rows(this.table).find(row => constraints.some(keys => sameKey(row, candidate, keys)));
  }
}

class UpdateQuery extends Thenable<Row[] | { rowCount: number; rows: Row[] }> {
  private condition: SQL | undefined;
  private returningSelection: Record<string, unknown> | null | undefined;

  constructor(private readonly db: InMemoryDrizzle, private readonly table: AnyTable, private readonly values: Row) { super(); }

  where(condition: SQL | undefined) { this.condition = condition; return this; }
  returning(selection?: Record<string, unknown>) { this.returningSelection = selection ?? null; return this; }

  protected execute() {
    const name = getTableName(this.table);
    this.db.statements.push({ op: "update", table: name });
    const matched = this.db.rows(this.table).filter(row => this.db.evaluate(this.condition, { [name]: row }) === true);
    for (const row of matched) {
      // All right-hand sides see the row as it was before this statement (SQL semantics).
      const before = { ...row };
      const updates: Row = {};
      for (const [key, value] of Object.entries(this.values)) {
        if (value !== undefined) updates[key] = this.db.value(value, { [name]: before });
      }
      Object.assign(row, updates);
    }
    if (this.returningSelection === undefined) return { rowCount: matched.length, rows: [] };
    return matched.map(row => this.db.project(this.returningSelection ?? undefined, { [name]: row }, name));
  }
}

class DeleteQuery extends Thenable<Row[] | { rowCount: number; rows: Row[] }> {
  private condition: SQL | undefined;
  private returningSelection: Record<string, unknown> | null | undefined;

  constructor(private readonly db: InMemoryDrizzle, private readonly table: AnyTable) { super(); }

  where(condition: SQL | undefined) { this.condition = condition; return this; }
  returning(selection?: Record<string, unknown>) { this.returningSelection = selection ?? null; return this; }

  protected execute() {
    const name = getTableName(this.table);
    this.db.statements.push({ op: "delete", table: name });
    const rows = this.db.rows(this.table);
    const removed = rows.filter(row => this.db.evaluate(this.condition, { [name]: row }) === true);
    for (const row of removed) rows.splice(rows.indexOf(row), 1);
    if (this.returningSelection === undefined) return { rowCount: removed.length, rows: [] };
    return removed.map(row => this.db.project(this.returningSelection ?? undefined, { [name]: row }, name));
  }
}

export function createInMemoryDrizzle(tables: AnyTable[] = []): InMemoryDrizzle {
  const db = new InMemoryDrizzle();
  for (const table of tables) db.rows(table);
  return db;
}

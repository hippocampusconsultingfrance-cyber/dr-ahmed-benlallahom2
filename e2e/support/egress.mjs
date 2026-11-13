// Loaded before the built server by the end-to-end tests (`node --import`, CODE-22), never
// by `pnpm start` nor on Vercel. The built server runs as in production; only its exits
// change, so that no real service is reached:
//  - every connection to another machine fails at once, without a DNS request, and is
//    written to the server's output, which the tests read (as in scripts/smoke-built-server.mjs);
//  - a request to Cloudflare, the AI Gateway, Google, Clerk, Have I Been Pwned or the Blob
//    store goes to its double, at E2E_DOUBLES_ORIGIN/<host>/<path> (e2e/support/doubles.ts);
//  - Stripe's API goes to the Checkout double at E2E_DOUBLES_ORIGIN/v1/…;
//  - the Neon HTTP driver's queries run on the local PostgreSQL of DATABASE_URL through
//    node-postgres, as in the local mode (answerNeonQueriesLocally, server/db.ts), rewritten
//    here in JavaScript for the built server.
import net from "node:net";
import { neonConfig } from "@neondatabase/serverless";
import pg from "pg";
import Stripe from "stripe";

const doubles = new URL(process.env.E2E_DOUBLES_ORIGIN ?? "");
const loopback = host => !host || /^(?:localhost|127(?:\.\d+){3}|::1|::ffff:127(?:\.\d+){3})$/i.test(host);
if (!loopback(doubles.hostname) || !loopback(new URL(process.env.DATABASE_URL ?? "").hostname)) {
  throw new Error("e2e: the doubles and the database must be on this machine (E2E_DOUBLES_ORIGIN, DATABASE_URL)");
}

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = first !== null && typeof first === "object" ? first : { port: first, host: typeof args[1] === "string" ? args[1] : undefined };
  const ipc = Boolean(options.path) || (typeof first === "string" && !/^\d+$/.test(first));
  if (ipc || loopback(options.host)) return connect.apply(this, args);
  const target = `${options.host}:${options.port}`;
  process.stderr.write(`[e2e] outbound connection refused: ${target}\n`);
  const error = Object.assign(new Error(`connect ECONNREFUSED ${target} (e2e: network limited to this machine)`), { code: "ECONNREFUSED", syscall: "connect" });
  process.nextTick(() => this.destroy(error));
  return this;
};

const REDIRECTED_HOSTS = /^(?:challenges\.cloudflare\.com|ai-gateway\.vercel\.sh|oauth2\.googleapis\.com|www\.googleapis\.com|api\.pwnedpasswords\.com|api\.clerk\.com|[a-z0-9-]+\.private\.blob\.vercel-storage\.com)$/;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.protocol !== "https:" || !REDIRECTED_HOSTS.test(url.hostname)) return fetchOriginal(input, init);
  const target = `${doubles.origin}/${url.hostname}${url.pathname}${url.search}`;
  return fetchOriginal(input instanceof Request ? new Request(target, input) : target, init);
};

const stripeClient = Object.getPrototypeOf(Stripe.createNodeHttpClient());
const makeRequest = stripeClient.makeRequest;
stripeClient.makeRequest = function (_host, _port, path, method, headers, body, _protocol, timeout) {
  return makeRequest.call(this, doubles.hostname, doubles.port, path, method, headers, body, "http", timeout);
};

const POSTGRES_ERROR_FIELDS = ["severity", "code", "detail", "hint", "position", "internalPosition", "internalQuery", "where", "schema", "table", "column", "dataType", "constraint", "file", "line", "routine"];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const asText = { getTypeParser: () => value => value };
const run = (client, { query, params }) => client.query({ text: query, values: params ?? [], rowMode: "array", types: asText }).then(result => ({
  fields: result.fields.map(field => ({ name: field.name, dataTypeID: field.dataTypeID })),
  rows: result.rows,
  command: result.command,
  rowCount: result.rowCount,
}));
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
neonConfig.fetchEndpoint = () => "http://localhost/sql";
neonConfig.fetchFunction = async (_url, init) => {
  const body = JSON.parse(init.body);
  const client = await pool.connect();
  try {
    if (!Array.isArray(body.queries)) return reply(200, await run(client, body));
    const level = init.headers["Neon-Batch-Isolation-Level"]?.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
    const readOnly = init.headers["Neon-Batch-Read-Only"] === "true" ? " READ ONLY" : "";
    const deferrable = init.headers["Neon-Batch-Deferrable"] === "true" ? " DEFERRABLE" : "";
    await client.query(`BEGIN${level ? ` ISOLATION LEVEL ${level}` : ""}${readOnly}${deferrable}`);
    try {
      const results = [];
      for (const query of body.queries) results.push(await run(client, query));
      await client.query("COMMIT");
      return reply(200, { results });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (!(error instanceof pg.DatabaseError)) throw error;
    return reply(400, Object.fromEntries([["message", error.message], ...POSTGRES_ERROR_FIELDS.map(field => [field, error[field]])]));
  } finally {
    client.release();
  }
};

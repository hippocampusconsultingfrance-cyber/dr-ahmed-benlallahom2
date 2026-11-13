import { createHmac, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Doubles locaux de Resend et de Stripe Checkout, sans compte ni réseau :
 *  - en mode local (CODE-15, `pnpm dev` sans RESEND_API_KEY ni STRIPE_SECRET_KEY),
 *    startServer les démarre sur cette machine et chaque email, chaque paiement est
 *    écrit dans la console (printLocalServiceEvent) ;
 *  - les tests de bout en bout (e2e/, CODE-22) les servent avec les autres doubles
 *    et relisent ce qu'ils ont reçu.
 * Resend : POST /emails et /emails/batch, comme api.resend.com (RESEND_BASE_URL).
 * Stripe : les sessions Checkout (/v1/checkout/sessions…, comme api.stripe.com), et une
 * page de paiement de test (/checkout/<id>) : « Payer » envoie au site l'évènement
 * checkout.session.completed signé avec stripeWebhookSecret, comme Stripe, puis revient
 * sur l'adresse de succès ; « Annuler » revient sur celle d'annulation.
 */
export type LocalEmail = {
  from?: string;
  to?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename?: string; content?: string }>;
  [key: string]: unknown;
};

export type LocalCheckoutSession = {
  id: string;
  object: "checkout.session";
  url: string;
  status: "open" | "complete" | "expired";
  payment_status: "unpaid" | "paid";
  amount_total: number;
  currency: string;
  customer_email: string | null;
  metadata: Record<string, string>;
  success_url: string;
  cancel_url: string;
  expires_at: number | null;
  payment_intent: string | null;
  mode: "payment";
};

export type LocalServiceEvent =
  | { service: "resend"; email: LocalEmail }
  | { service: "stripe"; kind: "checkout_created" | "checkout_expired" | "checkout_cancelled"; session: LocalCheckoutSession }
  | { service: "stripe"; kind: "checkout_paid"; session: LocalCheckoutSession; webhookStatus: number | null };

export type LocalServicesOptions = {
  /** Where the browser and the API reach these doubles (the payment page's address). */
  origin: string;
  /** The application: Stripe's events are posted to its /api/stripe/webhook. */
  appOrigin: string;
  stripeWebhookSecret: string;
  onEvent: (event: LocalServiceEvent) => void;
};

/** A request's body as text. */
export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);

/** A Stripe-Signature header as Stripe computes it: HMAC-SHA256 of « t.payload » with the endpoint's secret. */
export function stripeSignature(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
}

const stripeError = (res: ServerResponse, status: number, message: string) =>
  sendJson(res, status, { error: { type: "invalid_request_error", code: status === 404 ? "resource_missing" : "local_double", message } });

/**
 * The handler of both doubles: true when it answered the request, false when the path is
 * none of theirs (the caller answers it).
 */
export function localServicesHandler({ origin, appOrigin, stripeWebhookSecret, onEvent }: LocalServicesOptions) {
  const sessions = new Map<string, LocalCheckoutSession>();
  let emailCount = 0;
  const emailId = () => `local_email_${++emailCount}`;

  async function payCheckout(session: LocalCheckoutSession) {
    session.status = "complete";
    session.payment_status = "paid";
    session.payment_intent = `pi_local_${randomBytes(8).toString("hex")}`;
    const payload = JSON.stringify({ id: `evt_local_${randomBytes(8).toString("hex")}`, object: "event", type: "checkout.session.completed", created: Math.floor(Date.now() / 1000), livemode: false, data: { object: session } });
    let webhookStatus: number | null = null;
    try {
      const response = await fetch(`${appOrigin}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": stripeSignature(payload, stripeWebhookSecret) }, body: payload });
      webhookStatus = response.status;
    } catch {
      // The application did not answer: the payment stays recorded here, as Stripe would retry it.
    }
    onEvent({ service: "stripe", kind: "checkout_paid", session, webhookStatus });
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", origin);
    const method = req.method ?? "GET";

    if (method === "POST" && (url.pathname === "/emails" || url.pathname === "/emails/batch")) {
      const body = JSON.parse((await readBody(req)) || "null") as LocalEmail | LocalEmail[];
      const emails = Array.isArray(body) ? body : [body];
      const ids = emails.map(email => {
        onEvent({ service: "resend", email });
        return { id: emailId() };
      });
      sendJson(res, 200, Array.isArray(body) ? { data: ids } : ids[0]);
      return true;
    }

    if (url.pathname === "/v1/checkout/sessions" && method === "POST") {
      const form = new URLSearchParams(await readBody(req));
      const id = `cs_test_local_${randomBytes(12).toString("hex")}`;
      const metadata = Object.fromEntries([...form].flatMap(([key, value]) => {
        const name = /^metadata\[([^\]]+)\]$/.exec(key)?.[1];
        return name ? [[name, value]] : [];
      }));
      const unitAmount = Number(form.get("line_items[0][price_data][unit_amount]") ?? 0);
      const quantity = Number(form.get("line_items[0][quantity]") ?? 1);
      const session: LocalCheckoutSession = {
        id,
        object: "checkout.session",
        url: `${origin}/checkout/${id}`,
        status: "open",
        payment_status: "unpaid",
        amount_total: unitAmount * quantity,
        currency: form.get("line_items[0][price_data][currency]") ?? "eur",
        customer_email: form.get("customer_email"),
        metadata,
        success_url: form.get("success_url") ?? appOrigin,
        cancel_url: form.get("cancel_url") ?? appOrigin,
        expires_at: form.has("expires_at") ? Number(form.get("expires_at")) : null,
        payment_intent: null,
        mode: "payment",
      };
      sessions.set(id, session);
      onEvent({ service: "stripe", kind: "checkout_created", session });
      sendJson(res, 200, session);
      return true;
    }

    const api = /^\/v1\/checkout\/sessions\/([\w-]+)(\/expire)?$/.exec(url.pathname);
    if (api) {
      const session = sessions.get(api[1]!);
      if (!session) return stripeError(res, 404, `No such checkout.session: '${api[1]}'`), true;
      if (api[2] && method === "POST") {
        if (session.status !== "open") return stripeError(res, 400, "Only Checkout Sessions with a status in [\"open\"] can be expired."), true;
        session.status = "expired";
        onEvent({ service: "stripe", kind: "checkout_expired", session });
      }
      sendJson(res, 200, session);
      return true;
    }
    if (url.pathname.startsWith("/v1/")) return stripeError(res, 404, `${method} ${url.pathname} is not simulated locally`), true;

    const page = /^\/checkout\/([\w-]+)(?:\/(pay|cancel))?$/.exec(url.pathname);
    if (page) {
      const session = sessions.get(page[1]!);
      if (!session) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Session de paiement inconnue.");
        return true;
      }
      if (page[2] && method === "POST") {
        if (page[2] === "pay" && session.status === "open") await payCheckout(session);
        if (page[2] === "cancel") onEvent({ service: "stripe", kind: "checkout_cancelled", session });
        const target = page[2] === "pay" && session.payment_status === "paid" ? session.success_url : session.cancel_url;
        res.writeHead(303, { location: target.replace("{CHECKOUT_SESSION_ID}", session.id) }).end();
        return true;
      }
      const amount = new Intl.NumberFormat("fr-FR", { style: "currency", currency: session.currency.toUpperCase() }).format(session.amount_total / 100);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Paiement de test local</title></head>
<body><main><h1>Paiement de test local</h1><p>Aucun paiement réel : ce double remplace Stripe Checkout sur cette machine.</p>
<p>Montant : <strong>${escapeHtml(amount)}</strong> — ${escapeHtml(session.customer_email ?? "")}</p>
${session.status === "open" ? `<form method="post" action="/checkout/${session.id}/pay"><button type="submit">Payer</button></form>` : `<p>Session ${escapeHtml(session.status)}.</p>`}
<form method="post" action="/checkout/${session.id}/cancel"><button type="submit">Annuler</button></form></main></body></html>`);
      return true;
    }
    return false;
  };
}

/** The console line of an email or a payment, in local development. */
export function printLocalServiceEvent(event: LocalServiceEvent, log: (line: string) => void = line => console.log(line)) {
  if (event.service === "resend") {
    const { email } = event;
    const attachments = (email.attachments ?? []).map(attachment => attachment.filename).filter(Boolean);
    const body = (email.text ?? email.html?.replace(/<style[\s\S]*?<\/style>|<[^>]+>/g, " ") ?? "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    log([
      `[Email local] À : ${[email.to ?? []].flat().join(", ")} — Objet : ${email.subject ?? ""}${attachments.length ? ` — Pièces jointes : ${attachments.join(", ")}` : ""}`,
      ...body.split("\n").slice(0, 20).map(line => `  ${line}`),
    ].join("\n"));
    return;
  }
  const { session } = event;
  const amount = `${(session.amount_total / 100).toFixed(2).replace(".", ",")} ${session.currency.toUpperCase()}`;
  if (event.kind === "checkout_created") log(`[Paiement local] ${amount} pour ${session.customer_email ?? "?"} (${session.metadata.trackingId ?? session.id}) : payer ou annuler sur ${session.url}`);
  else if (event.kind === "checkout_paid") log(`[Paiement local] ${session.metadata.trackingId ?? session.id} payé ; évènement checkout.session.completed envoyé au site (réponse ${event.webhookStatus ?? "aucune"})`);
  else log(`[Paiement local] ${session.metadata.trackingId ?? session.id} ${event.kind === "checkout_expired" ? "expiré" : "annulé"}`);
}

/**
 * Local development only (startServer, console_emails or console_payments): the doubles on
 * an ephemeral port of this machine, every email and payment written to the console.
 */
export async function startLocalServices({ appOrigin, onEvent = event => printLocalServiceEvent(event) }: { appOrigin: string; onEvent?: (event: LocalServiceEvent) => void }) {
  const stripeWebhookSecret = `whsec_local_${randomBytes(16).toString("hex")}`;
  // eslint-disable-next-line prefer-const -- set once the doubles listen, from the port they got; the handler above reads it
  let handle: ReturnType<typeof localServicesHandler> | undefined;
  const server = createServer((req, res) => {
    handle!(req, res).then(handled => {
      if (!handled) res.writeHead(404).end();
    }, error => {
      console.error("[Local services]", error);
      if (!res.headersSent) res.writeHead(500).end();
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  handle = localServicesHandler({ origin, appOrigin, stripeWebhookSecret, onEvent });
  return { origin, stripeWebhookSecret, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { serveStatic } from "./static";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { clerkMiddleware } from "@clerk/express";
import { assertCriticalProductionEnvironment, clerkPublishableKey } from "./env";
import { registerHealthRoute } from "./health";
import { contentSecurityPolicyHeaders, registerCspReportRoute } from "./contentSecurityPolicy";
import { registerGoogleDriveOAuthRoutes } from "../googleDriveOAuthRoutes";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerCandidateDocumentRoutes } from "../routes/candidateDocuments";
import { registerClientBriefRoute } from "../routes/clientBriefs";
import { registerRecruitmentApplyRoute } from "../routes/recruitmentApply";
import { registerResendWebhookRoute } from "../routes/resendWebhook";
import { PUBLIC_APP_ORIGIN } from "../routes/routeHelpers";
import { registerScheduledJobRoutes } from "../routes/scheduled";
import { registerStripeWebhookRoute } from "../routes/stripeWebhook";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * The application: global middlewares, then every route, in an order that
 * matters (see each comment). The business routes live in server/routes.
 */
export async function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  const server = createServer(app);

  // Browser-side defense in depth (same values as vercel.json, see contentSecurityPolicy.ts).
  const cspHeaders = Object.entries(contentSecurityPolicyHeaders());
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    for (const [name, value] of cspHeaders) res.setHeader(name, value);
    next();
  });

  // Public uptime probe (SELECT 1 + configuration status; names only with the
  // cron secret). Mounted before clerkMiddleware so that it still answers when
  // a Clerk misconfiguration makes every other /api route fail.
  registerHealthRoute(app);
  // Reports of the report-only CSP (SECU-02), before clerkMiddleware for the same reason.
  registerCspReportRoute(app);

  app.use(clerkMiddleware({
    publishableKey: clerkPublishableKey(),
    authorizedParties: [PUBLIC_APP_ORIGIN, "http://localhost:3000", "http://127.0.0.1:3000"],
  }));

  // Stripe and Resend webhooks (MUST be before express.json() to receive raw body)
  registerStripeWebhookRoute(app);
  registerResendWebhookRoute(app);

  // Configure body parser with larger size limit for file uploads (after Stripe webhook)
  // Binary uploads have dedicated Multer routes and limits. Keep generic bodies
  // small to prevent an arbitrary JSON/form payload from exhausting memory.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  registerClientBriefRoute(app);
  registerRecruitmentApplyRoute(app);
  registerCandidateDocumentRoutes(app);

  // /sitemap.xml is generated at build time into dist/public by
  // scripts/prerender-route-seo.ts from the prerendered routes (served by the
  // Vercel CDN, or by express.static outside Vercel): a single source of truth.
  registerStorageProxy(app);
  registerGoogleDriveOAuthRoutes(app);

  // tRPC API. A query is also accepted as POST, its input in the body: the
  // client sends the administration's queries and the candidate links' that
  // way (client/src/lib/trpcLinks.ts), so that the names, emails and tokens
  // they carry are not in the API calls' URLs, which Vercel and its log
  // drains record (a candidate link's own page URL still carries its email
  // and token). Like a mutation, such a POST needs a JSON body and the
  // SameSite cookies. A query sent as GET still answers: refusing it would
  // not keep its URL out of the logs (the request is recorded before the
  // function answers) and would break an admin tab opened before a
  // deployment until it is reloaded.
  // A JSON body cannot come from a cross-site form without a CORS preflight,
  // never granted. tRPC itself would also take a multipart/form-data body,
  // which such a form can send, and run a query with it: no procedure takes
  // one and the client always sends JSON, so any other POST body is refused
  // here, before tRPC.
  app.use("/api/trpc", (req, res, next) => {
    const contentType = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (req.method === "POST" && contentType !== "application/json") {
      return res.status(415).json({ error: "Format de requête non pris en charge." });
    }
    next();
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      allowMethodOverride: true,
    })
  );

  // GET /api/scheduled/*, called by Vercel Cron.
  registerScheduledJobRoutes(app);

  // Development uses Vite. On Vercel, public files are served by the CDN and
  // only /api requests reach this Express application.
  if (process.env.NODE_ENV === "development") {
    // Keep the development toolchain out of the Vercel server bundle.
    const viteModulePath = "./vite";
    const { setupVite } = await import(viteModulePath);
    await setupVite(app, server);
  } else if (process.env.VERCEL !== "1") {
    serveStatic(app);
  }

  return app;
}

async function startServer() {
  assertCriticalProductionEnvironment();
  const app = await createApp();
  const server = createServer(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

if (process.env.VERCEL !== "1") {
  startServer().catch(console.error);
}

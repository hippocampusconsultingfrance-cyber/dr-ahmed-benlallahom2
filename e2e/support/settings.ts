import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

/**
 * Where the scenarios run: E2E_DATABASE_URL (the CI's PostgreSQL service, or a local one:
 * README, « Mode local »), emptied by every run, so never a database that holds data:
 * only one of this machine is accepted. E2E_APP_PORT and E2E_DOUBLES_PORT if the default
 * ports are taken.
 */
export function e2eSettings(environment: NodeJS.ProcessEnv = process.env) {
  const databaseUrl = environment.E2E_DATABASE_URL?.trim() || "postgresql://postgres:postgres@127.0.0.1:5432/e2e";
  if (!/^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(new URL(databaseUrl).hostname)) {
    throw new Error("e2e: E2E_DATABASE_URL must name a PostgreSQL of this machine, which every run empties");
  }
  const appPort = Number(environment.E2E_APP_PORT || 4310);
  return {
    databaseUrl,
    appPort,
    appOrigin: `http://127.0.0.1:${appPort}`,
    doublesPort: Number(environment.E2E_DOUBLES_PORT || 4311),
    serverLog: path.join(root, "tmp/e2e/server.log"),
  };
}

/**
 * The built server's environment, as in production (NODE_ENV=production): every variable
 * the server requires (server/_core/env.ts), dummy, the tests' own secrets, and the
 * administrator the admin scenario signs in as.
 */
export const E2E_ENVIRONMENT = Object.freeze({
  NODE_ENV: "production",
  VERCEL: "",
  VERCEL_ENV: "",
  JWT_SECRET: "e2e_jwt_secret_for_the_end_to_end_scenarios",
  STRIPE_SECRET_KEY: "sk_test_e2e",
  // Form of the keys of a production Clerk instance (base64 of « clerk.example.com$ »), without
  // a real instance: a development key would send every page to Clerk for its handshake.
  CLERK_SECRET_KEY: "sk_live_e2e",
  CLERK_PUBLISHABLE_KEY: "pk_live_Y2xlcmsuZXhhbXBsZS5jb20k",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_Y2xlcmsuZXhhbXBsZS5jb20k",
  CLERK_OWNER_USER_ID: "user_e2e_owner",
  RESEND_API_KEY: "re_e2e",
  RESEND_WEBHOOK_SECRET: "whsec_ZTJlX3Jlc2VuZF93ZWJob29rX3NlY3JldA==",
  OWNER_NOTIFICATION_EMAIL: "owner@e2e.test",
  // Cloudflare's test secret: the double answers for it.
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_e2estore_e2esecret",
  CANDIDATE_AUTH_PEPPER: "e2e_pepper_for_the_end_to_end_scenarios",
  CANDIDATE_DOCUMENT_ENCRYPTION_KEY: "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
  CRON_SECRET: "e2e_cron_secret_for_the_end_to_end_scenarios",
  AI_GATEWAY_API_KEY: "e2e_ai_gateway_key",
  GOOGLE_DRIVE_CLIENT_ID: "e2e-client-id.apps.googleusercontent.com",
  GOOGLE_DRIVE_CLIENT_SECRET: "e2e_client_secret",
  GOOGLE_DRIVE_CV_FOLDER_ID: "e2e_folder",
});

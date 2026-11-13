import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Contrôle manuel (CODE-11), que ni `pnpm test` ni la CI ne lancent, car il joint Google :
 * le point de terminaison OAuth reconnaît GOOGLE_DRIVE_CLIENT_ID et GOOGLE_DRIVE_CLIENT_SECRET
 * (de l'environnement, ou du .env local), sans qu'aucun jeton soit émis. Un code d'autorisation
 * volontairement invalide doit être refusé comme tel (invalid_grant), jamais comme un client
 * inconnu ou un secret faux (invalid_client).
 *   node scripts/check-google-drive-oauth.mjs
 * server/googleDriveOAuthCredentials.test.ts le vérifie contre un faux Google.
 */
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_DRIVE_OAUTH_REDIRECT_URI =
  "https://drahmedbenlallahom.com/api/google-drive/oauth/callback";
const PROBE_CODE = "credential-validation-probe";

/**
 * Le message ne donne jamais le secret : seulement le statut HTTP et le code d'erreur de Google.
 * @param {{ environment?: Record<string, string | undefined>, fetchImpl?: (url: string, init: RequestInit) => Promise<Response> }} [options]
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function checkGoogleDriveOAuthCredentials({
  environment = process.env,
  fetchImpl = fetch,
} = {}) {
  const clientId = environment.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = environment.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret)
    return {
      ok: false,
      message:
        "GOOGLE_DRIVE_CLIENT_ID et GOOGLE_DRIVE_CLIENT_SECRET sont requis.",
    };
  const response = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: PROBE_CODE,
      grant_type: "authorization_code",
      redirect_uri: GOOGLE_DRIVE_OAUTH_REDIRECT_URI,
    }),
  });
  const { error } = await response.json().catch(() => ({}));
  if (response.status === 400 && error === "invalid_grant") {
    return {
      ok: true,
      message:
        "Identifiants OAuth Google Drive reconnus : le code d'essai est refusé comme prévu, aucun jeton n'est émis.",
    };
  }
  return {
    ok: false,
    message: `Identifiants OAuth Google Drive refusés : HTTP ${response.status}, ${typeof error === "string" ? error : "réponse sans code d'erreur"}.`,
  };
}

async function main() {
  await import("dotenv/config");
  const result = await checkGoogleDriveOAuthCredentials();
  if (result.ok) console.log(result.message);
  else {
    console.error(result.message);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await main();

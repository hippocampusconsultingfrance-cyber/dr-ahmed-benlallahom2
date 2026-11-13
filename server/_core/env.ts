import { SITE_ORIGIN } from "../../shared/routeMetadata";

/**
 * Variables sans lesquelles une fonction de production cesse de marcher.
 * Vérifiées :
 *  - au démarrage du serveur Express hors Vercel (startServer refuse de démarrer) ;
 *  - au démarrage à froid de la fonction Vercel (api/index.js) : journal d'erreur
 *    bruyant, sans jamais faire planter la fonction ;
 *  - à la demande : bandeau du tableau de bord admin et GET /api/health (statut seul en
 *    public ; noms avec `Authorization: Bearer <CRON_SECRET>`).
 * Seuls les NOMS sont exposés, jamais les valeurs.
 */
export const PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES = [
  "JWT_SECRET",
  "DATABASE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CLERK_SECRET_KEY",
  // Clé publique Clerk : intégrée au navigateur au build, et lue par clerkMiddleware
  // côté serveur (CLERK_PUBLISHABLE_KEY, à défaut celle-ci : voir clerkPublishableKey).
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "RESEND_API_KEY",
  "TURNSTILE_SECRET_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "CANDIDATE_AUTH_PEPPER",
  "CANDIDATE_DOCUMENT_ENCRYPTION_KEY",
  // Sans elle, les 7 tâches /api/scheduled/* répondent 403 (Vercel Cron).
  "CRON_SECRET",
  // Sans elle, personne n'obtient le rôle administrateur (isConfiguredAdminOpenId).
  "CLERK_OWNER_USER_ID",
  // Sans elle, /api/webhooks/resend répond 503 et le suivi des campagnes est perdu.
  "RESEND_WEBHOOK_SECRET",
] as const;

export type ProductionRequiredEnvironmentVariable =
  (typeof PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES)[number];

/**
 * Clé publique Clerk du serveur. @clerk/express ne lit que CLERK_PUBLISHABLE_KEY ;
 * sans elle, chaque requête passant par clerkMiddleware répondait 500. La clé
 * publique du navigateur (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, même valeur) suffit.
 */
export function clerkPublishableKey(
  environment: NodeJS.ProcessEnv = process.env
): string | undefined {
  return (
    environment.CLERK_PUBLISHABLE_KEY?.trim() ||
    environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
    undefined
  );
}

/** Anciens noms encore acceptés à la place d'une variable requise. */
const PRODUCTION_ENVIRONMENT_ALIASES: Partial<
  Record<ProductionRequiredEnvironmentVariable, readonly string[]>
> = {
  CLERK_OWNER_USER_ID: ["OWNER_OPEN_ID"],
};

export function getMissingCriticalProductionEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): ProductionRequiredEnvironmentVariable[] {
  return PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES.filter(
    name =>
      ![name, ...(PRODUCTION_ENVIRONMENT_ALIASES[name] ?? [])].some(candidate =>
        environment[candidate]?.trim()
      )
  );
}

export function assertCriticalProductionEnvironment(
  environment: NodeJS.ProcessEnv = process.env
) {
  if (environment.NODE_ENV !== "production") return;
  const missing = getMissingCriticalProductionEnvironment(environment);
  if (missing.length > 0) {
    throw new Error(
      `Missing critical production configuration: ${missing.join(", ")}`
    );
  }
}

/**
 * Contrôles de cohérence (EXPL-20) selon VERCEL_ENV, en plus de la présence des
 * variables : en production, une clé Stripe ou Clerk de test, une clé Turnstile
 * de test (secrète ou de site) ou une PUBLIC_APP_ORIGIN qui n'est pas l'adresse du site ;
 * en préproduction (Preview), une clé live. Seuls ces CODES sont exposés (bandeau
 * admin, /api/health détaillé, journaux), jamais les valeurs. Sans VERCEL_ENV
 * (développement, serveur lancé hors de Vercel), rien ne distingue la production :
 * aucun avertissement.
 */
export const CONFIGURATION_WARNINGS = [
  "stripe_test_key_in_production",
  "clerk_test_key_in_production",
  "turnstile_test_key",
  "public_origin_mismatch",
  "live_key_in_preview",
] as const;

export type ConfigurationWarning = (typeof CONFIGURATION_WARNINGS)[number];

/** Clés secrètes de test publiées par Cloudflare : tout jeton y est accepté (1x), refusé (2x) ou dit déjà utilisé (3x). */
const TURNSTILE_TEST_SECRETS = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

/**
 * Clés de site de test publiées par Cloudflare : le widget n'y produit qu'un
 * jeton factice, que la clé secrète d'un vrai widget refuse. VITE_TURNSTILE_SITE_KEY
 * est intégrée au site au build, et Vercel la donne aussi au serveur.
 */
const TURNSTILE_TEST_SITE_KEYS = new Set([
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "1x00000000000000000000BB",
  "2x00000000000000000000BB",
  "3x00000000000000000000FF",
]);

const keyPrefixed = (value: string | undefined, prefixes: readonly string[]) =>
  prefixes.some(prefix => value?.trim().startsWith(prefix));
const clerkKeys = (environment: NodeJS.ProcessEnv) => [
  environment.CLERK_SECRET_KEY,
  environment.CLERK_PUBLISHABLE_KEY,
  environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
];

export function getConfigurationWarnings(
  environment: NodeJS.ProcessEnv = process.env
): ConfigurationWarning[] {
  const warnings: ConfigurationWarning[] = [];
  if (environment.VERCEL_ENV === "production") {
    if (keyPrefixed(environment.STRIPE_SECRET_KEY, ["sk_test_", "rk_test_"]))
      warnings.push("stripe_test_key_in_production");
    if (
      clerkKeys(environment).some(key =>
        keyPrefixed(key, ["sk_test_", "pk_test_"])
      )
    )
      warnings.push("clerk_test_key_in_production");
    if (
      TURNSTILE_TEST_SECRETS.has(
        environment.TURNSTILE_SECRET_KEY?.trim() ?? ""
      ) ||
      TURNSTILE_TEST_SITE_KEYS.has(
        environment.VITE_TURNSTILE_SITE_KEY?.trim() ?? ""
      )
    ) {
      warnings.push("turnstile_test_key");
    }
    // Lue telle quelle par les liens envoyés (`process.env.PUBLIC_APP_ORIGIN || …`) : vide, l'adresse du site s'applique.
    if (
      environment.PUBLIC_APP_ORIGIN &&
      environment.PUBLIC_APP_ORIGIN !== SITE_ORIGIN
    )
      warnings.push("public_origin_mismatch");
  } else if (environment.VERCEL_ENV === "preview") {
    if (
      keyPrefixed(environment.STRIPE_SECRET_KEY, ["sk_live_", "rk_live_"]) ||
      clerkKeys(environment).some(key =>
        keyPrefixed(key, ["sk_live_", "pk_live_"])
      )
    ) {
      warnings.push("live_key_in_preview");
    }
  }
  return warnings;
}

export type EnvironmentConfigurationStatus = {
  /** true quand aucune variable critique ne manque (ou hors production). */
  ok: boolean;
  /** Noms des variables manquantes, jamais leurs valeurs. */
  missing: ProductionRequiredEnvironmentVariable[];
  /** Le contrôle ne s'applique qu'en production. */
  enforced: boolean;
  /** Codes des incohérences relevées (EXPL-20), jamais les valeurs ; ne changent pas `ok`. */
  warnings: ConfigurationWarning[];
};

export function getEnvironmentConfigurationStatus(
  environment: NodeJS.ProcessEnv = process.env
): EnvironmentConfigurationStatus {
  const enforced = environment.NODE_ENV === "production";
  const missing = enforced
    ? getMissingCriticalProductionEnvironment(environment)
    : [];
  return {
    ok: missing.length === 0,
    missing,
    enforced,
    warnings: getConfigurationWarnings(environment),
  };
}

/**
 * Contrôle non bloquant pour la fonction Vercel : journalise bruyamment (console.error,
 * visible dans les journaux Vercel) la liste des variables manquantes, sans lever
 * d'exception, pour que le site public et les autres routes continuent de répondre.
 */
export function reportCriticalProductionEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  log: (message: string) => void = message => console.error(message)
): EnvironmentConfigurationStatus {
  const status = getEnvironmentConfigurationStatus(environment);
  if (!status.ok) {
    log(
      `[Config] CRITICAL: ${status.missing.length} production environment variable(s) missing: ${status.missing.join(", ")}. ` +
        "Set them in Vercel > Settings > Environment Variables (Production), then redeploy. The /admin banner lists them too."
    );
  }
  if (status.warnings.length > 0) {
    log(
      `[Config] WARNING: configuration inconsistent with VERCEL_ENV=${environment.VERCEL_ENV}: ${status.warnings.join(", ")}. The /admin banner says what to change.`
    );
  }
  return status;
}

/**
 * Mode local (CODE-15) : raccourcis qui laissent lancer le site sur un poste sans les
 * comptes de production. Seulement avec NODE_ENV=development (`pnpm dev`) et hors de
 * Vercel (ni VERCEL ni VERCEL_ENV), quelle que soit la configuration : `pnpm start`, le
 * serveur construit et la fonction Vercel n'en activent aucun.
 *  - local_database : DATABASE_URL vise cette machine (localhost, 127.x.x.x, [::1]) ; le
 *    pilote Neon y passe par node-postgres (server/db.ts) ;
 *  - clerk_optional : sans les clés Clerk, le site public répond sans clerkMiddleware et
 *    personne n'est administrateur (/admin fermé) ;
 *  - console_emails : sans RESEND_API_KEY, chaque email est écrit dans la console ;
 *  - console_payments : sans STRIPE_SECRET_KEY, un paiement de test écrit dans la
 *    console remplace Stripe Checkout (server/_core/localServices.ts).
 */
export const LOCAL_DEVELOPMENT_SHORTCUTS = [
  "local_database",
  "clerk_optional",
  "console_emails",
  "console_payments",
] as const;

export type LocalDevelopmentShortcut =
  (typeof LOCAL_DEVELOPMENT_SHORTCUTS)[number];

export function isLocalDevelopment(
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    environment.NODE_ENV === "development" &&
    !environment.VERCEL?.trim() &&
    !environment.VERCEL_ENV?.trim()
  );
}

/** Machine locale, par son nom ou son adresse de bouclage, telle que l'écrit une URL. */
const LOOPBACK_HOSTNAME = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;

export function isLoopbackUrl(url: string | undefined): boolean {
  try {
    return LOOPBACK_HOSTNAME.test(new URL(url?.trim() ?? "").hostname);
  } catch {
    return false;
  }
}

export function localDevelopmentShortcuts(
  environment: NodeJS.ProcessEnv = process.env
): LocalDevelopmentShortcut[] {
  if (!isLocalDevelopment(environment)) return [];
  const active: Record<LocalDevelopmentShortcut, boolean> = {
    local_database: isLoopbackUrl(environment.DATABASE_URL),
    clerk_optional:
      !clerkPublishableKey(environment) ||
      !environment.CLERK_SECRET_KEY?.trim(),
    console_emails: !environment.RESEND_API_KEY?.trim(),
    console_payments: !environment.STRIPE_SECRET_KEY?.trim(),
  };
  return LOCAL_DEVELOPMENT_SHORTCUTS.filter(shortcut => active[shortcut]);
}

/**
 * Adresse du paiement de test local, posée par startServer quand console_payments est
 * actif : le client Stripe s'y adresse au lieu de api.stripe.com. Ignorée hors du mode
 * local, ou si elle ne vise pas cette machine.
 */
export const LOCAL_STRIPE_API_URL_VARIABLE = "LOCAL_STRIPE_API_URL";

export function localStripeApiOptions(
  environment: NodeJS.ProcessEnv = process.env
): { host: string; port: number; protocol: "http" } | undefined {
  const url = environment[LOCAL_STRIPE_API_URL_VARIABLE]?.trim();
  if (!isLocalDevelopment(environment) || !url || !isLoopbackUrl(url))
    return undefined;
  const { hostname, port, protocol } = new URL(url);
  if (protocol !== "http:" || !port) return undefined;
  return {
    host: hostname.replace(/^\[|\]$/g, ""),
    port: Number(port),
    protocol: "http",
  };
}

export function isConfiguredAdminOpenId(
  openId: string,
  environment: NodeJS.ProcessEnv = process.env
) {
  const ownerOpenId =
    environment.CLERK_OWNER_USER_ID?.trim() ||
    environment.OWNER_OPEN_ID?.trim();
  return Boolean(ownerOpenId && openId === ownerOpenId);
}

export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId:
    process.env.CLERK_OWNER_USER_ID ?? process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
  googleDriveClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
  googleDriveCvFolderId: process.env.GOOGLE_DRIVE_CV_FOLDER_ID ?? "",
};

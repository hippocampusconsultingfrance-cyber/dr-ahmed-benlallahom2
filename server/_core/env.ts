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

export type ProductionRequiredEnvironmentVariable = (typeof PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES)[number];

/**
 * Clé publique Clerk du serveur. @clerk/express ne lit que CLERK_PUBLISHABLE_KEY ;
 * sans elle, chaque requête passant par clerkMiddleware répondait 500. La clé
 * publique du navigateur (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, même valeur) suffit.
 */
export function clerkPublishableKey(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  return environment.CLERK_PUBLISHABLE_KEY?.trim() || environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || undefined;
}

/** Anciens noms encore acceptés à la place d'une variable requise. */
const PRODUCTION_ENVIRONMENT_ALIASES: Partial<Record<ProductionRequiredEnvironmentVariable, readonly string[]>> = {
  CLERK_OWNER_USER_ID: ["OWNER_OPEN_ID"],
};

export function getMissingCriticalProductionEnvironment(environment: NodeJS.ProcessEnv = process.env): ProductionRequiredEnvironmentVariable[] {
  return PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES.filter(name =>
    ![name, ...(PRODUCTION_ENVIRONMENT_ALIASES[name] ?? [])].some(candidate => environment[candidate]?.trim())
  );
}

export function assertCriticalProductionEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== "production") return;
  const missing = getMissingCriticalProductionEnvironment(environment);
  if (missing.length > 0) {
    throw new Error(`Missing critical production configuration: ${missing.join(", ")}`);
  }
}

export type EnvironmentConfigurationStatus = {
  /** true quand aucune variable critique ne manque (ou hors production). */
  ok: boolean;
  /** Noms des variables manquantes, jamais leurs valeurs. */
  missing: ProductionRequiredEnvironmentVariable[];
  /** Le contrôle ne s'applique qu'en production. */
  enforced: boolean;
};

export function getEnvironmentConfigurationStatus(environment: NodeJS.ProcessEnv = process.env): EnvironmentConfigurationStatus {
  const enforced = environment.NODE_ENV === "production";
  const missing = enforced ? getMissingCriticalProductionEnvironment(environment) : [];
  return { ok: missing.length === 0, missing, enforced };
}

/**
 * Contrôle non bloquant pour la fonction Vercel : journalise bruyamment (console.error,
 * visible dans les journaux Vercel) la liste des variables manquantes, sans lever
 * d'exception, pour que le site public et les autres routes continuent de répondre.
 */
export function reportCriticalProductionEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  log: (message: string) => void = message => console.error(message),
): EnvironmentConfigurationStatus {
  const status = getEnvironmentConfigurationStatus(environment);
  if (!status.ok) {
    log(
      `[Config] CRITICAL: ${status.missing.length} production environment variable(s) missing: ${status.missing.join(", ")}. ` +
        "Set them in Vercel > Settings > Environment Variables (Production), then redeploy. The /admin banner lists them too."
    );
  }
  return status;
}

export function isConfiguredAdminOpenId(
  openId: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const ownerOpenId = environment.CLERK_OWNER_USER_ID?.trim() || environment.OWNER_OPEN_ID?.trim();
  return Boolean(ownerOpenId && openId === ownerOpenId);
}

export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.CLERK_OWNER_USER_ID ?? process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
  googleDriveClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
  googleDriveCvFolderId: process.env.GOOGLE_DRIVE_CV_FOLDER_ID ?? "",
};

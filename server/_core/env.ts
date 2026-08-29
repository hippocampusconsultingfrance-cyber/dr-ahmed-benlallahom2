export const PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES = [
  "JWT_SECRET",
  "DATABASE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "RESEND_API_KEY",
  "TURNSTILE_SECRET_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "CANDIDATE_AUTH_PEPPER",
  "CANDIDATE_DOCUMENT_ENCRYPTION_KEY",
] as const;

export function getMissingCriticalProductionEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  return PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES.filter(name => !environment[name]?.trim());
}

export function assertCriticalProductionEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== "production") return;
  const missing = getMissingCriticalProductionEnvironment(environment);
  if (missing.length > 0) {
    throw new Error(`Missing critical production configuration: ${missing.join(", ")}`);
  }
}

export function isConfiguredAdminOpenId(
  openId: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const ownerOpenId = environment.CLERK_OWNER_USER_ID?.trim() || environment.OWNER_OPEN_ID?.trim();
  return Boolean(ownerOpenId && openId === ownerOpenId);
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.CLERK_OWNER_USER_ID ?? process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
  googleDriveClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
  googleDriveCvFolderId: process.env.GOOGLE_DRIVE_CV_FOLDER_ID ?? "",
};

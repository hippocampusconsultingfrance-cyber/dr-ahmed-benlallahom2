import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { createContext } from "./_core/context";
import { notifyOwner } from "./_core/notification";
import { logSecurityEvent, requestIpHash } from "./candidateSecurity";
import { buildGoogleDriveAuthorizationUrl, createGoogleDriveOAuthState, exchangeGoogleDriveAuthorizationCode, googleDriveExportStatus, saveGoogleDriveConnection, verifyGoogleDriveOAuthState } from "./googleDriveExport";

const STATE_COOKIE = "__Host-google_drive_oauth_state";

export const GOOGLE_DRIVE_ADMIN_REQUIRED_MESSAGE = "Accès administrateur requis.";
export const GOOGLE_DRIVE_MFA_REQUIRED_MESSAGE = "Double authentification administrateur requise. Validez le code de sécurité dans l’administration, puis relancez la connexion Google Drive.";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

type GoogleDriveOAuthAuthorization =
  | { allowed: true; openId: string }
  | { allowed: false; status: 403; message: string };

/**
 * The Drive connection replaces the token used to copy every CV: it is an
 * administrative action and therefore requires the same verified server MFA
 * as the tRPC admin procedures and the document download route.
 */
async function authorizeGoogleDriveOAuthRequest(req: Request, res: Response, step: "connect" | "callback"): Promise<GoogleDriveOAuthAuthorization> {
  const context = await createContext({ req, res, info: {} as any });
  if (!context.user || context.user.role !== "admin") return { allowed: false, status: 403, message: GOOGLE_DRIVE_ADMIN_REQUIRED_MESSAGE };
  if (!context.mfaVerified) {
    await logSecurityEvent({
      actorKind: "admin",
      actorReference: context.user.openId,
      category: "google_drive_oauth_mfa_required",
      outcome: "blocked",
      severity: "warning",
      ipHash: requestIpHash(req.headers as Record<string, unknown>),
      metadata: { step },
    }).catch(() => undefined);
    return { allowed: false, status: 403, message: GOOGLE_DRIVE_MFA_REQUIRED_MESSAGE };
  }
  return { allowed: true, openId: context.user.openId };
}

async function recordGoogleDriveConnection(input: { openId: string; req: Request; reconnection: boolean; grantedScopes?: string }) {
  const at = new Date();
  try {
    await logSecurityEvent({
      actorKind: "admin",
      actorReference: input.openId,
      category: input.reconnection ? "google_drive_reconnected" : "google_drive_connected",
      outcome: "allowed",
      severity: "warning",
      ipHash: requestIpHash(input.req.headers as Record<string, unknown>),
      metadata: { grantedScopes: input.grantedScopes ?? null, connectedAt: at.toISOString() },
    });
  } catch {
    console.error("[GoogleDrive] Unable to record the connection security event");
  }
  await notifyOwner({
    title: input.reconnection ? "Sécurité : Google Drive reconnecté à l’administration" : "Sécurité : Google Drive connecté à l’administration",
    content: [
      `Le compte Google Drive utilisé pour copier les CV vient d’être ${input.reconnection ? "remplacé" : "connecté"} depuis l’administration (${at.toISOString()}).`,
      "L’opération a été réalisée par une session administrateur ayant validé la double authentification.",
      "Si vous n’êtes pas à l’origine de cette action, révoquez l’accès de l’application dans votre compte Google et reconnectez le Drive du cabinet depuis l’onglet Candidatures.",
    ].join("\n\n"),
  }).catch(() => false);
}

export function registerGoogleDriveOAuthRoutes(app: Express) {
  app.get("/api/google-drive/oauth/connect", async (req, res) => {
    const authorization = await authorizeGoogleDriveOAuthRequest(req, res, "connect");
    if (!authorization.allowed) return res.status(authorization.status).send(authorization.message);
    try {
      const state = createGoogleDriveOAuthState();
      res.cookie(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 10 * 60_000 });
      return res.redirect(302, buildGoogleDriveAuthorizationUrl(state));
    } catch (error) {
      console.error("[GoogleDrive] OAuth start failed", error);
      return res.status(500).send("La connexion Google Drive n’a pas pu être démarrée.");
    }
  });

  app.get("/api/google-drive/oauth/callback", async (req, res) => {
    const authorization = await authorizeGoogleDriveOAuthRequest(req, res, "callback");
    if (!authorization.allowed) return res.status(authorization.status).send(authorization.message);
    const state = getQueryParam(req, "state");
    const code = getQueryParam(req, "code");
    const returnedError = getQueryParam(req, "error");
    const expectedState = parseCookieHeader(req.headers.cookie ?? "")[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: "/", secure: true, sameSite: "lax" });
    if (returnedError) return res.status(400).send("L’autorisation Google Drive a été refusée ou interrompue.");
    if (!code || !state || state !== expectedState || !verifyGoogleDriveOAuthState(state)) return res.status(403).send("La vérification de sécurité Google Drive a expiré. Recommencez la connexion depuis l’administration.");
    try {
      const tokens = await exchangeGoogleDriveAuthorizationCode(code);
      const reconnection = await googleDriveExportStatus().then(status => status.connected).catch(() => false);
      await saveGoogleDriveConnection({ authorizedByOpenId: authorization.openId, refreshToken: tokens.refresh_token!, grantedScopes: tokens.scope });
      await recordGoogleDriveConnection({ openId: authorization.openId, req, reconnection, grantedScopes: tokens.scope });
      return res.redirect(302, "/admin?googleDrive=connected");
    } catch (error) {
      console.error("[GoogleDrive] OAuth callback failed", error);
      return res.status(500).send("La connexion Google Drive n’a pas pu être finalisée. Vérifiez l’URI de redirection et que l’API Google Drive est activée.");
    }
  });
}

import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { createContext } from "./_core/context";
import { buildGoogleDriveAuthorizationUrl, createGoogleDriveOAuthState, exchangeGoogleDriveAuthorizationCode, saveGoogleDriveConnection, verifyGoogleDriveOAuthState } from "./googleDriveExport";

const STATE_COOKIE = "__Host-google_drive_oauth_state";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

async function requireAdmin(req: Request, res: Response) {
  const context = await createContext({ req, res, info: {} as any });
  if (!context.user || context.user.role !== "admin") return null;
  return context.user;
}

export function registerGoogleDriveOAuthRoutes(app: Express) {
  app.get("/api/google-drive/oauth/connect", async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return res.status(403).send("Accès administrateur requis.");
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
    const user = await requireAdmin(req, res);
    if (!user) return res.status(403).send("Accès administrateur requis.");
    const state = getQueryParam(req, "state");
    const code = getQueryParam(req, "code");
    const returnedError = getQueryParam(req, "error");
    const expectedState = parseCookieHeader(req.headers.cookie ?? "")[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: "/", secure: true, sameSite: "lax" });
    if (returnedError) return res.status(400).send("L’autorisation Google Drive a été refusée ou interrompue.");
    if (!code || !state || state !== expectedState || !verifyGoogleDriveOAuthState(state)) return res.status(403).send("La vérification de sécurité Google Drive a expiré. Recommencez la connexion depuis l’administration.");
    try {
      const tokens = await exchangeGoogleDriveAuthorizationCode(code);
      await saveGoogleDriveConnection({ authorizedByOpenId: user.openId, refreshToken: tokens.refresh_token!, grantedScopes: tokens.scope });
      return res.redirect(302, "/admin?googleDrive=connected");
    } catch (error) {
      console.error("[GoogleDrive] OAuth callback failed", error);
      return res.status(500).send("La connexion Google Drive n’a pas pu être finalisée. Vérifiez l’URI de redirection et que l’API Google Drive est activée.");
    }
  });
}

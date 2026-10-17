import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: { user: null as null | { openId: string; role: "admin" | "user" }, mfaVerified: false },
  connected: false,
  logSecurityEvent: vi.fn(async (_event: Record<string, unknown>) => undefined),
  notifyOwner: vi.fn(async (_payload: { title: string; content: string }) => true),
  saveGoogleDriveConnection: vi.fn(async (_input: Record<string, unknown>) => undefined),
  exchangeGoogleDriveAuthorizationCode: vi.fn(async (_code: string) => ({ refresh_token: "refresh-token", scope: "https://www.googleapis.com/auth/drive.file" })),
}));

vi.mock("./_core/context", () => ({ createContext: vi.fn(async () => mocks.context) }));
vi.mock("./_core/notification", () => ({ notifyOwner: mocks.notifyOwner }));
vi.mock("./candidateSecurity", () => ({ logSecurityEvent: mocks.logSecurityEvent, requestIpHash: () => "ip-hash" }));
vi.mock("./googleDriveExport", () => ({
  buildGoogleDriveAuthorizationUrl: (state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  createGoogleDriveOAuthState: () => "signed-state",
  verifyGoogleDriveOAuthState: (state: string) => state === "signed-state",
  exchangeGoogleDriveAuthorizationCode: mocks.exchangeGoogleDriveAuthorizationCode,
  saveGoogleDriveConnection: mocks.saveGoogleDriveConnection,
  googleDriveExportStatus: async () => ({ connected: mocks.connected }),
}));

import { GOOGLE_DRIVE_MFA_REQUIRED_MESSAGE, registerGoogleDriveOAuthRoutes } from "./googleDriveOAuthRoutes";

type Handler = (req: any, res: any) => Promise<unknown>;
const handlers = new Map<string, Handler>();
registerGoogleDriveOAuthRoutes({ get: (path: string, handler: Handler) => handlers.set(path, handler) } as any);

function fakeResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    redirectedTo: undefined as string | undefined,
    cookies: [] as string[],
    status(code: number) { response.statusCode = code; return response; },
    send(body: unknown) { response.body = body; return response; },
    redirect(code: number, location: string) { response.statusCode = code; response.redirectedTo = location; return response; },
    cookie(name: string) { response.cookies.push(name); return response; },
    clearCookie() { return response; },
  };
  return response;
}

async function call(path: string, query: Record<string, string> = {}, cookie = "") {
  const res = fakeResponse();
  await handlers.get(path)!({ query, headers: { cookie } }, res);
  return res;
}

describe("connexion Google Drive : double authentification administrateur", () => {
  beforeEach(() => {
    mocks.context = { user: null, mfaVerified: false };
    mocks.connected = false;
    mocks.logSecurityEvent.mockClear();
    mocks.notifyOwner.mockClear();
    mocks.saveGoogleDriveConnection.mockClear();
    mocks.exchangeGoogleDriveAuthorizationCode.mockClear();
  });

  it("refuse un visiteur ou un membre non administrateur", async () => {
    expect((await call("/api/google-drive/oauth/connect")).statusCode).toBe(403);
    mocks.context = { user: { openId: "member", role: "user" }, mfaVerified: true };
    expect((await call("/api/google-drive/oauth/callback", { code: "c", state: "signed-state" }, "__Host-google_drive_oauth_state=signed-state")).statusCode).toBe(403);
    expect(mocks.saveGoogleDriveConnection).not.toHaveBeenCalled();
  });

  it("refuse l’administrateur Clerk sans MFA serveur sur connect et callback, et journalise le refus", async () => {
    mocks.context = { user: { openId: "owner", role: "admin" }, mfaVerified: false };
    const connect = await call("/api/google-drive/oauth/connect");
    expect(connect.statusCode).toBe(403);
    expect(connect.body).toBe(GOOGLE_DRIVE_MFA_REQUIRED_MESSAGE);
    expect(connect.redirectedTo).toBeUndefined();
    expect(connect.cookies).toEqual([]);

    const callback = await call("/api/google-drive/oauth/callback", { code: "c", state: "signed-state" }, "__Host-google_drive_oauth_state=signed-state");
    expect(callback.statusCode).toBe(403);
    expect(mocks.exchangeGoogleDriveAuthorizationCode).not.toHaveBeenCalled();
    expect(mocks.saveGoogleDriveConnection).not.toHaveBeenCalled();
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ category: "google_drive_oauth_mfa_required", outcome: "blocked" }));
  });

  it("autorise l’administrateur vérifié, journalise la (re)connexion et prévient le propriétaire", async () => {
    mocks.context = { user: { openId: "owner", role: "admin" }, mfaVerified: true };
    const connect = await call("/api/google-drive/oauth/connect");
    expect(connect.statusCode).toBe(302);
    expect(connect.redirectedTo).toContain("accounts.google.com");

    mocks.connected = true;
    const callback = await call("/api/google-drive/oauth/callback", { code: "c", state: "signed-state" }, "__Host-google_drive_oauth_state=signed-state");
    expect(callback.statusCode).toBe(302);
    expect(callback.redirectedTo).toBe("/admin?googleDrive=connected");
    expect(mocks.saveGoogleDriveConnection).toHaveBeenCalledWith(expect.objectContaining({ authorizedByOpenId: "owner" }));
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ category: "google_drive_reconnected", outcome: "allowed", actorReference: "owner" }));
    expect(mocks.notifyOwner).toHaveBeenCalledTimes(1);
    const notification = mocks.notifyOwner.mock.calls[0]![0];
    expect(notification.title).toContain("Google Drive reconnecté");
    expect(notification.content).not.toContain("refresh-token");
  });
});

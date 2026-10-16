import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { googleDriveConnections } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";

const state = vi.hoisted(() => {
  process.env.GOOGLE_DRIVE_CLIENT_ID ||= "client-id";
  process.env.GOOGLE_DRIVE_CLIENT_SECRET ||= "client-secret";
  process.env.GOOGLE_DRIVE_CV_FOLDER_ID ||= "folder-id";
  process.env.CANDIDATE_DOCUMENT_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  return { memory: null as null | { db: unknown } };
});
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));

import { deleteCvCopiesFromGoogleDrive, encryptGoogleDriveRefreshToken } from "./googleDriveExport";

let memory: MemoryPg;
let driveFiles: Map<string, string>;
let tokenFails: boolean;
const deleteCalls: string[] = [];

function seedConnection() {
  const encrypted = encryptGoogleDriveRefreshToken("refresh-token");
  memory.seed(googleDriveConnections, [{
    connection_key: "recruitment_cv_export", authorized_by_open_id: "owner", folder_id: "folder-id",
    refresh_token_ciphertext: encrypted.ciphertext, refresh_token_iv: encrypted.iv, refresh_token_auth_tag: encrypted.authTag,
  }]);
}

describe("suppression des copies Google Drive d’un CV", () => {
  beforeEach(() => {
    memory = createMemoryPg([googleDriveConnections]);
    state.memory = memory;
    driveFiles = new Map([["known", "CVTRACK00001"], ["orphan", "CVTRACK00001"], ["other", "CVOTHER00001"]]);
    tokenFails = false;
    deleteCalls.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "oauth2.googleapis.com") {
        return tokenFails
          ? new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
          : new Response(JSON.stringify({ access_token: "access" }), { status: 200 });
      }
      if (init?.method === "DELETE") {
        const id = decodeURIComponent(url.pathname.split("/").pop()!);
        deleteCalls.push(id);
        return driveFiles.delete(id) ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ error: { message: "File not found" } }), { status: 404 });
      }
      const tracking = /value='([^']+)'/.exec(url.searchParams.get("q") ?? "")?.[1];
      const files = Array.from(driveFiles).filter(([, value]) => value === tracking).map(([id]) => ({ id }));
      return new Response(JSON.stringify({ files: files.slice(0, 1) }), { status: 200 });
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("supprime le fichier connu puis les autres copies portant le même identifiant de dossier", async () => {
    seedConnection();
    await expect(deleteCvCopiesFromGoogleDrive({ trackingId: "CVTRACK00001", knownFileIds: ["known"] })).resolves.toEqual({ status: "deleted", deleted: 2, error: null });
    expect(Array.from(driveFiles.keys())).toEqual(["other"]);
  });

  it("considère un fichier déjà absent comme supprimé", async () => {
    seedConnection();
    driveFiles.clear();
    await expect(deleteCvCopiesFromGoogleDrive({ trackingId: "CVTRACK00001", knownFileIds: ["gone"] })).resolves.toEqual({ status: "none", deleted: 0, error: null });
    expect(deleteCalls).toEqual(["gone"]);
  });

  it("signale l’échec (autorisation révoquée) sans lever d’exception et le note sur la connexion", async () => {
    seedConnection();
    tokenFails = true;
    const result = await deleteCvCopiesFromGoogleDrive({ trackingId: "CVTRACK00001", knownFileIds: ["known"] });
    expect(result).toMatchObject({ status: "failed", deleted: 0, error: "google_drive_token_invalid_grant" });
    expect(memory.rows(googleDriveConnections)[0]!.last_error).toBe("google_drive_token_invalid_grant");
    expect(driveFiles.has("known")).toBe(true);
  });

  it("sans connexion Drive : rien à faire si aucune copie n’est connue, sinon suppression en attente", async () => {
    await expect(deleteCvCopiesFromGoogleDrive({ trackingId: "CVTRACK00001", knownFileIds: [] })).resolves.toMatchObject({ status: "none" });
    await expect(deleteCvCopiesFromGoogleDrive({ trackingId: "CVTRACK00001", knownFileIds: ["known"] })).resolves.toMatchObject({ status: "not_connected" });
  });
});

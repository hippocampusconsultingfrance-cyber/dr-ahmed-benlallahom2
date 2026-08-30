import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@vercel/blob", () => blob);

import { classifyStorageError, storageGetSignedUrl, storagePut } from "./storage";

describe("private Vercel Blob storage", () => {
  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-test-token");
    blob.issueSignedToken.mockResolvedValue({
      clientSigningToken: "client-signing-token",
      delegationToken: "delegation-token",
      validUntil: Date.now() + 300_000,
    });
    blob.presignUrl.mockResolvedValue({ presignedUrl: "https://private.blob.example/file?signature=test" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("uploads with private access and keeps only the returned pathname", async () => {
    blob.put.mockImplementation(async (pathname: string) => ({ pathname, url: `https://private.blob.example/${pathname}` }));

    const result = await storagePut("/candidate-documents/file.pdf", new Uint8Array([1, 2, 3]), "application/pdf");

    expect(result.key).toMatch(/^candidate-documents\/file_[a-f0-9]{8}\.pdf$/);
    expect(blob.put).toHaveBeenCalledWith(
      result.key,
      expect.any(Buffer),
      expect.objectContaining({ access: "private", addRandomSuffix: false, token: "blob-test-token" }),
    );
  });

  it("creates a five-minute read-only URL for one private pathname", async () => {
    const url = await storageGetSignedUrl("/recruitment/cv/example.pdf");

    expect(url).toContain("signature=test");
    expect(blob.issueSignedToken).toHaveBeenCalledWith(expect.objectContaining({
      pathname: "recruitment/cv/example.pdf",
      operations: ["get"],
      token: "blob-test-token",
    }));
    expect(blob.presignUrl).toHaveBeenCalledWith(
      expect.objectContaining({ delegationToken: "delegation-token" }),
      expect.objectContaining({ access: "private", operation: "get", pathname: "recruitment/cv/example.pdf" }),
    );
  });

  it("fails closed when the private store credential is missing", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    await expect(storagePut("documents/file.txt", "data", "text/plain")).rejects.toMatchObject({ code: "storage_config_missing" });
  });

  it("classifies Blob failures without exposing their raw message", () => {
    expect(classifyStorageError(new Error("Vercel Blob: Access denied, please provide a valid token for this resource."))).toBe("storage_access_denied");
    expect(classifyStorageError(new TypeError("fetch failed"))).toBe("storage_network_error");
    expect(classifyStorageError(new Error("Vercel Blob: This store has been suspended."))).toBe("storage_store_suspended");
  });
});

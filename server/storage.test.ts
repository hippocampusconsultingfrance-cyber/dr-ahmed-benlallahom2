import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
  BlobNotFoundError: class BlobNotFoundError extends Error {},
  del: vi.fn(),
  head: vi.fn(),
  issueSignedToken: vi.fn(),
  list: vi.fn(),
  presignUrl: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@vercel/blob", () => blob);

import { classifyStorageError, storageDelete, storageGetSignedUrl, storageListKeys, storageListObjects, storagePut, storagePutOnce } from "./storage";

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

  it("stores a rebuilt document once under its exact key, then keeps the stored copy without uploading it again", async () => {
    // A private store held in memory: head() finds what put() stored.
    const stored = new Map<string, Buffer>();
    blob.head.mockImplementation(async (pathname: string) => {
      if (!stored.has(pathname)) throw new blob.BlobNotFoundError("Vercel Blob: The requested blob does not exist");
      return { pathname, url: `https://private.blob.example/${pathname}` };
    });
    blob.put.mockImplementation(async (pathname: string, body: Buffer) => {
      stored.set(pathname, body);
      return { pathname, url: `https://private.blob.example/${pathname}` };
    });
    const pdf = Buffer.from("%PDF-1.3 invoice");

    const first = await storagePutOnce("/invoices/FAC-2026-000001-APTTEST000001.pdf", pdf, "application/pdf");
    const retries = [];
    for (let attempt = 2; attempt <= 8; attempt += 1) retries.push(await storagePutOnce("invoices/FAC-2026-000001-APTTEST000001.pdf", pdf, "application/pdf"));

    expect(first).toEqual({ key: "invoices/FAC-2026-000001-APTTEST000001.pdf", url: "https://private.blob.example/invoices/FAC-2026-000001-APTTEST000001.pdf", uploaded: true });
    expect(retries.every(retry => retry.key === first.key && !retry.uploaded)).toBe(true);
    expect(blob.put).toHaveBeenCalledTimes(1);
    expect(blob.put).toHaveBeenCalledWith(first.key, pdf, expect.objectContaining({ access: "private", addRandomSuffix: false, allowOverwrite: false, token: "blob-test-token" }));
    expect(Array.from(stored.keys())).toEqual([first.key]);
  });

  it("uploads nothing when the store cannot say whether the document is already there", async () => {
    blob.head.mockRejectedValue(new Error("Vercel Blob: This store has been suspended."));
    await expect(storagePutOnce("invoices/FAC-2026-000002-APTTEST000002.pdf", "pdf", "application/pdf")).rejects.toMatchObject({ code: "storage_store_suspended" });
    expect(blob.put).not.toHaveBeenCalled();
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

  it("deletes private objects by pathname, deduplicated and in batches of 100", async () => {
    blob.del.mockResolvedValue(undefined);
    const keys = Array.from({ length: 150 }, (_, index) => `/recruitment/cv/CV${index}.pdf`);
    await expect(storageDelete([...keys, keys[0]!])).resolves.toBe(150);
    expect(blob.del).toHaveBeenCalledTimes(2);
    expect(blob.del.mock.calls[0]![0]).toHaveLength(100);
    expect(blob.del.mock.calls[0]![0][0]).toBe("recruitment/cv/CV0.pdf");
    expect(blob.del).toHaveBeenCalledWith(expect.any(Array), { token: "blob-test-token" });
  });

  it("lists every page of a dossier prefix and refuses a store-wide listing", async () => {
    blob.list
      .mockResolvedValueOnce({ blobs: [{ pathname: "recruitment/cv/CVX-a.pdf" }], hasMore: true, cursor: "next" })
      .mockResolvedValueOnce({ blobs: [{ pathname: "recruitment/cv/CVX-b.pdf" }], hasMore: false });
    await expect(storageListKeys("recruitment/cv/CVX-")).resolves.toEqual(["recruitment/cv/CVX-a.pdf", "recruitment/cv/CVX-b.pdf"]);
    expect(blob.list).toHaveBeenLastCalledWith(expect.objectContaining({ prefix: "recruitment/cv/CVX-", cursor: "next", token: "blob-test-token" }));
    await expect(storageListKeys("recruitment")).rejects.toThrow("storage_list_prefix_too_broad");
  });

  it("lists objects with their upload date, for the orphan CV cleanup (DATA-02)", async () => {
    blob.list.mockResolvedValueOnce({ blobs: [{ pathname: "recruitment/quarantine/CVX-cv.pdf", uploadedAt: new Date("2026-10-25T08:00:00Z") }], hasMore: false });
    await expect(storageListObjects("recruitment/quarantine/", 20_000)).resolves.toEqual([{ key: "recruitment/quarantine/CVX-cv.pdf", uploadedAt: new Date("2026-10-25T08:00:00Z") }]);
    expect(blob.list).toHaveBeenLastCalledWith(expect.objectContaining({ prefix: "recruitment/quarantine/", limit: 1000 }));
  });

  it("classifies Blob failures without exposing their raw message", () => {
    expect(classifyStorageError(new Error("Vercel Blob: Access denied, please provide a valid token for this resource."))).toBe("storage_access_denied");
    expect(classifyStorageError(new TypeError("fetch failed"))).toBe("storage_network_error");
    expect(classifyStorageError(new Error("Vercel Blob: This store has been suspended."))).toBe("storage_store_suspended");
  });
});

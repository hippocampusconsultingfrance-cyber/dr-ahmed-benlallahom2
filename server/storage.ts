import { BlobNotFoundError, del, head, issueSignedToken, list, presignUrl, put } from "@vercel/blob";

const PRIVATE_BLOB_ACCESS = "private" as const;
const SIGNED_URL_LIFETIME_MS = 5 * 60 * 1000;

function getBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error("Private storage config missing: set BLOB_READ_WRITE_TOKEN");
  }
  return token;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export function classifyStorageError(error: unknown): string {
  if (!error || typeof error !== "object") return "storage_unknown";
  const candidate = error as { constructor?: { name?: string }; message?: unknown; code?: unknown };
  const constructorName = candidate.constructor?.name || "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  const code = typeof candidate.code === "string" ? candidate.code.toLowerCase() : "";

  if (constructorName === "BlobAccessError" || message.includes("access denied") || message.includes("invalid token")) return "storage_access_denied";
  if (constructorName === "BlobStoreNotFoundError" || message.includes("store does not exist")) return "storage_store_not_found";
  if (constructorName === "BlobStoreSuspendedError" || message.includes("store has been suspended")) return "storage_store_suspended";
  if (constructorName === "BlobServiceRateLimited" || message.includes("too many requests")) return "storage_rate_limited";
  if (constructorName === "BlobServiceNotAvailable" || message.includes("service is currently not available")) return "storage_service_unavailable";
  if (constructorName === "BlobFileTooLargeError" || message.includes("file is too large")) return "storage_file_too_large";
  if (constructorName === "BlobContentTypeNotAllowedError" || message.includes("content type mismatch")) return "storage_content_type_rejected";
  if (message.includes("no blob credentials") || message.includes("no read-write token") || message.includes("config missing")) return "storage_config_missing";
  if (constructorName === "TypeError" || code.startsWith("econn") || code === "fetch_failed" || message.includes("fetch failed")) return "storage_network_error";
  if (constructorName.startsWith("Blob") || message.startsWith("vercel blob:")) return "storage_blob_error";
  return "storage_unknown";
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const body = typeof data === "string" || Buffer.isBuffer(data) ? data : Buffer.from(data);
  let uploaded;
  try {
    uploaded = await put(key, body, {
      access: PRIVATE_BLOB_ACCESS,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
      contentType,
      token: getBlobToken(),
    });
  } catch (error) {
    const wrapped = new Error("storage_upload_failed", { cause: error }) as Error & { code: string };
    wrapped.code = classifyStorageError(error);
    throw wrapped;
  }

  return { key: uploaded.pathname, url: uploaded.url };
}

/**
 * Stores an object under this exact key, once: when the key already holds an
 * object (a document rebuilt byte for byte on a retry, such as an invoice),
 * nothing is uploaded and the stored copy is kept. Without a random suffix
 * and with overwriting refused, a second copy cannot be created.
 */
export async function storagePutOnce(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string; uploaded: boolean }> {
  const key = normalizeKey(relKey);
  const body = typeof data === "string" || Buffer.isBuffer(data) ? data : Buffer.from(data);
  let uploaded;
  try {
    const token = getBlobToken();
    try {
      const stored = await head(key, { token });
      return { key: stored.pathname, url: stored.url, uploaded: false };
    } catch (error) {
      if (!(error instanceof BlobNotFoundError)) throw error;
    }
    uploaded = await put(key, body, {
      access: PRIVATE_BLOB_ACCESS,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
      contentType,
      token,
    });
  } catch (error) {
    const wrapped = new Error("storage_upload_failed", { cause: error }) as Error & { code: string };
    wrapped.code = classifyStorageError(error);
    throw wrapped;
  }

  return { key: uploaded.pathname, url: uploaded.url, uploaded: true };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: await storageGetSignedUrl(key) };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const token = getBlobToken();
  const validUntil = Date.now() + SIGNED_URL_LIFETIME_MS;
  const signedToken = await issueSignedToken({
    pathname: key,
    operations: ["get"],
    validUntil,
    token,
  });
  const { presignedUrl } = await presignUrl(signedToken, {
    access: PRIVATE_BLOB_ACCESS,
    operation: "get",
    pathname: key,
    useCache: false,
    validUntil,
  });
  return presignedUrl;
}

/**
 * Permanently deletes private objects (GDPR erasure, retention). Vercel Blob
 * ignores pathnames that no longer exist, so a retried erasure is idempotent.
 */
export async function storageDelete(relKeys: string[]): Promise<number> {
  const keys = Array.from(new Set(relKeys.map(normalizeKey).filter(key => key.length > 0)));
  const token = getBlobToken();
  for (let index = 0; index < keys.length; index += 100) {
    await del(keys.slice(index, index + 100), { token });
  }
  return keys.length;
}

/** Lists object pathnames under a prefix (for copies of one dossier). */
export async function storageListKeys(prefix: string, maxKeys = 500): Promise<string[]> {
  const normalized = normalizeKey(prefix);
  if (!normalized.includes("/")) throw new Error("storage_list_prefix_too_broad");
  const token = getBlobToken();
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: normalized, cursor, limit: Math.min(1000, maxKeys - keys.length), token });
    keys.push(...page.blobs.map(blob => blob.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor && keys.length < maxKeys);
  return keys;
}

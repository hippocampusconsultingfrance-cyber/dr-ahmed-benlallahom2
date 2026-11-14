/**
 * TEST-ONLY: the tRPC context a procedure receives, with every field createContext
 * fills (CODE-03): a visitor without an account by default, the administrator's
 * double authentication not verified. `req` and `res` hold only what the procedures
 * read; what a test gives is added to them. Never import this module from production code.
 */
import { vi } from "vitest";
import type { TrpcContext } from "../_core/context";

type TestContextOptions = {
  user?: TrpcContext["user"];
  mfaVerified?: boolean;
  req?: Record<string, unknown>;
  res?: Record<string, unknown>;
};

export function createTestContext({
  user = null,
  mfaVerified = false,
  req,
  res,
}: TestContextOptions = {}): TrpcContext {
  return {
    user,
    mfaVerified,
    req: {
      protocol: "https",
      headers: {},
      ...req,
    } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn(), ...res } as unknown as TrpcContext["res"],
  };
}

import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { clerkClient, getAuth } from "@clerk/express";
import * as db from "../db";
import { isAdminMfaVerified } from "../adminMfa";
import { isConfiguredAdminOpenId } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  mfaVerified: boolean;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let mfaVerified = false;

  const auth = getAuth(opts.req);
  if (auth.isAuthenticated && auth.userId) {
    try {
      const clerkUser = await clerkClient.users.getUser(auth.userId);
      const primaryEmail = clerkUser.emailAddresses.find(address => address.id === clerkUser.primaryEmailAddressId);
      const verifiedEmail = primaryEmail?.verification?.status === "verified" ? primaryEmail.emailAddress : null;
      const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || verifiedEmail || "Administrateur";

      await db.upsertUser({
        openId: auth.userId,
        name,
        email: verifiedEmail,
        loginMethod: "clerk",
        lastSignedIn: new Date(),
      });
      const synchronizedUser = (await db.getUserByOpenId(auth.userId)) ?? null;
      user = synchronizedUser
        ? { ...synchronizedUser, role: isConfiguredAdminOpenId(auth.userId) ? "admin" : "user" }
        : null;

      mfaVerified = await isAdminMfaVerified(opts.req, auth.userId);
    } catch (error) {
      console.error("[Clerk] Unable to synchronize authenticated user", error);
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    mfaVerified,
  };
}

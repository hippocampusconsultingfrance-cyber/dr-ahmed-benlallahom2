import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const { isLoaded, isSignedIn } = useClerkAuth();
  const clerk = useClerk();
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: Boolean(isLoaded && isSignedIn),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const serverLogout = trpc.auth.logout.useMutation();

  const logout = useCallback(async () => {
    // Revoke the server-side admin MFA session (and its cookie) before Clerk
    // ends the first factor; a network failure must not block the sign-out.
    try {
      await serverLogout.mutateAsync();
    } catch {
      // The MFA session still expires on its own; Clerk sign-out proceeds.
    }
    await clerk.signOut({ redirectUrl: "/" });
    utils.auth.me.setData(undefined, null);
    await utils.auth.me.invalidate();
  }, [clerk, serverLogout, utils]);

  const state = useMemo(() => {
    const user = isSignedIn ? meQuery.data ?? null : null;
    return {
      user,
      loading: !isLoaded || (Boolean(isSignedIn) && meQuery.isLoading),
      error: meQuery.error ?? null,
      isAuthenticated: Boolean(isSignedIn && user),
      mfaVerified: Boolean(user?.mfaVerified),
    };
  }, [
    isLoaded,
    isSignedIn,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (!isLoaded || meQuery.isLoading) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;

    window.location.href = redirectPath ?? "/admin";
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    isLoaded,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}

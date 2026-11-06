import { MutationCache, QueryClient, type Mutation } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * The administration's procedures: their mutation key starts with the tRPC
 * path (["admin", "contacts", "markRead"]…), as in lib/trpcLinks.ts.
 */
function isAdminMutation(mutation: Mutation<unknown, unknown, unknown>) {
  const path = mutation.options.mutationKey?.[0];
  if (!Array.isArray(path)) return false;
  const [root, child] = path as string[];
  return root === "admin" || root === "adminSecurity" || (root === "medicalQuestions" && child === "admin");
}

/**
 * ADM-10: an admin action that fails says so, even when its screen has no
 * error handler of its own. A mutation with its own onError keeps its own
 * message alone (no second toast). The public pages tell their visitors in
 * their own language and place (EN-06), never with the server's French text:
 * they are left out. The refusal of an expired security session (10003) is
 * only shown here; the error stays as it came, for a recovery that would take
 * it up before this toast (ADM-05).
 */
export function createQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        if (mutation.options.onError || !isAdminMutation(mutation)) return;
        toast.error(error.message);
      },
    }),
  });
}

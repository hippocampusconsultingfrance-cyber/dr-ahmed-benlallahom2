import { httpBatchLink, splitLink, type TRPCLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";

/**
 * Queries whose input can name a person or carry a secret: everything the
 * administration reads (searches by name or email, the GDPR screen's email,
 * a question santé's author) and the candidate links' email and token. A GET
 * puts the input in the URL, which Vercel and its log drains record with each
 * request: these queries are sent as POST, their input in the request body
 * (the server accepts it, see allowMethodOverride in server/_core/index.ts).
 * The public pages' queries stay GET.
 * For the candidate links, this only keeps the email and token out of the API
 * call's URL: the emailed link itself (/candidate/verify, /candidate/
 * reset-password, /candidate/access?invite=) still carries them in the page's
 * URL, which is recorded when the page loads.
 */
const QUERIES_SENT_AS_POST = [
  /^admin\./,
  /^adminSecurity\./,
  /^medicalQuestions\.admin\./,
  /^candidatePortal\.(activationDetails|resolveInvitation)$/,
];

export function querySentAsPost(path: string): boolean {
  return QUERIES_SENT_AS_POST.some(pattern => pattern.test(path));
}

/** Links of the site's tRPC client: cookies sent with every call, private queries as POST. */
export function createTrpcLinks(url = "/api/trpc"): TRPCLink<AppRouter>[] {
  const options = {
    url,
    transformer: superjson,
    fetch(input: RequestInfo | URL, init?: RequestInit) {
      return globalThis.fetch(input, {
        ...(init ?? {}),
        credentials: "include",
      });
    },
  };
  return [
    splitLink({
      condition: operation => operation.type === "query" && querySentAsPost(operation.path),
      true: httpBatchLink({ ...options, methodOverride: "POST" }),
      false: httpBatchLink(options),
    }),
  ];
}

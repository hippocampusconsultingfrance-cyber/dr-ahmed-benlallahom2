// Public address of the site, for the links sent by the API (Stripe return pages, candidate invitations, campaign unsubscribe links).

// Secret-bearing URLs must never be assembled from browser-controlled headers.
export const DEFAULT_PUBLIC_ORIGIN = process.env.PUBLIC_APP_ORIGIN || "https://drahmedbenlallahom.com";

export function getSafeCheckoutOrigin(): string {
  return DEFAULT_PUBLIC_ORIGIN;
}

/**
 * Per-tab memory of the booking flow (sessionStorage, cleared with the tab):
 * - the pending booking (held slot + open Stripe session), so that coming back
 *   from Stripe offers "Reprendre le paiement" or "Annuler et choisir un autre
 *   créneau" instead of a slot blocked by the patient's own hold;
 * - the form draft, so the patient does not type everything again.
 * Every access is guarded: private browsing or blocked storage simply disables
 * the feature.
 */
export type PendingBooking = {
  trackingId: string;
  checkoutSessionId: string;
  customerName: string;
  customerEmail: string;
  finalPrice: number;
  appointmentDate: string;
  holdExpiresAt: string;
};

export type BookingDraft = {
  name: string;
  email: string;
  phone: string;
  /** Start of the slot chosen in the grid (ISO instant), "" when none. */
  appointmentDate: string;
  details: string;
};

const PENDING_KEY = "booking:pending:v1";
const DRAFT_KEY = "booking:draft:v1";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable or full: the flow still works without it.
  }
}

function remove(key: string) {
  try {
    storage()?.removeItem(key);
  } catch {
    // ignore
  }
}

function isPendingBooking(value: unknown): value is PendingBooking {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.trackingId === "string"
    && typeof candidate.checkoutSessionId === "string"
    && typeof candidate.customerName === "string"
    && typeof candidate.customerEmail === "string"
    && typeof candidate.finalPrice === "number"
    && typeof candidate.appointmentDate === "string"
    && typeof candidate.holdExpiresAt === "string";
}

/** The pending booking, or null when none is stored or its hold has expired (then it is forgotten). */
export function loadPendingBooking(now = Date.now()): PendingBooking | null {
  const value = read<unknown>(PENDING_KEY);
  if (!isPendingBooking(value)) {
    if (value) remove(PENDING_KEY);
    return null;
  }
  const expiresAt = new Date(value.holdExpiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    remove(PENDING_KEY);
    return null;
  }
  return value;
}

export function savePendingBooking(value: PendingBooking) {
  write(PENDING_KEY, value);
}

/** Forgets the pending booking (all of them, or only the one with this reference / session). */
export function clearPendingBooking(match?: { trackingId?: string | null; checkoutSessionId?: string | null }) {
  if (match && (match.trackingId || match.checkoutSessionId)) {
    const value = read<PendingBooking>(PENDING_KEY);
    if (value && value.trackingId !== match.trackingId && value.checkoutSessionId !== match.checkoutSessionId) return;
  }
  remove(PENDING_KEY);
}

export function loadBookingDraft(): BookingDraft | null {
  const value = read<Partial<BookingDraft>>(DRAFT_KEY);
  if (!value || typeof value !== "object") return null;
  const field = (key: keyof BookingDraft) => (typeof value[key] === "string" ? (value[key] as string).slice(0, 5000) : "");
  return { name: field("name"), email: field("email"), phone: field("phone"), appointmentDate: field("appointmentDate"), details: field("details") };
}

export function saveBookingDraft(value: BookingDraft) {
  write(DRAFT_KEY, value);
}

export function clearBookingDraft() {
  remove(DRAFT_KEY);
}

import { randomUUID } from "node:crypto";
import { publicProcedure, PublicErrorReason, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import {
  appointments,
  availabilitySlots,
  blockedDates,
} from "../../drizzle/schema";
import { eq, and, or, sql, inArray } from "drizzle-orm";
import Stripe from "stripe";
import {
  hashSecurityValue,
  logSecurityEvent,
  requestIpHash,
} from "../candidateSecurity";
import { SITE_LANGUAGES, type SiteLanguage } from "../emailLanguage";
import { verifyCandidateTurnstile } from "../candidateTurnstile";
import { postgresErrorCode } from "../languageColumns";
import {
  BOOKING_INVALID_NAME_MESSAGE,
  BOOKING_INVALID_PHONE_MESSAGE,
  BOOKING_LOCALES,
  BOOKING_REQUEST_SUBJECT_MAX_LENGTH,
  BOOKING_TOO_FAR_MESSAGE,
  BOOKING_TOO_SOON_MESSAGE,
  CONSULTATION_DAY_RATE_CENTS,
  consultationPriceCents,
  getBookingWindowIssue,
  hasVisibleNameCharacter,
  isBookingEmailAddress,
  isNightRateForParis,
  isPlausiblePhoneNumber,
  normalizePhoneInput,
  toE164PhoneNumber,
  type BookingRefusalReason,
} from "../../shared/bookingPolicy";
import {
  cleanTextInput,
  emailText,
  multiLineText,
  singleLineText,
  TEXT_INPUT_INVALID_CHARACTERS,
} from "../../shared/textInput";
import { localStripeApiOptions } from "../_core/env";
import { getSafeCheckoutOrigin } from "./publicOrigin";
import {
  enforcePublicFormRateLimit,
  givePublicFormAttemptBack,
  withinBookingGiveBackCap,
} from "./publicForms";
import {
  PARIS_TIME_ZONE,
  parisDateKey,
  parseAppointmentDate,
  isBookableAppointmentTime,
} from "./parisTime";

let stripeClient: Stripe | undefined;

/**
 * Shared Stripe client (also used by the hold cleanup job); throws when the key is not
 * configured. In local development only, it may target the local payment double (CODE-15).
 */
export function getStripeClient(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!apiKey)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Le service de paiement n’est pas configuré.",
    });
  stripeClient ??= new Stripe(apiKey, localStripeApiOptions());
  return stripeClient;
}

/** Nombre maximal de créneaux retenus (en attente de paiement) par adresse email. */
export const MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL = 2;
export const ACTIVE_APPOINTMENT_HOLDS_LIMIT_MESSAGE =
  "Vous avez déjà deux réservations en attente de paiement. Finalisez ou annulez l’un de ces paiements, ou patientez une trentaine de minutes avant de réserver un nouveau créneau.";

export const CONSULTATION_CHECKOUT_PRODUCT_NAME =
  "Consultation de conseil santé – 30 minutes";

export const BOOKING_PAYMENT_UNAVAILABLE_MESSAGE =
  "Le service de paiement est momentanément indisponible. Votre créneau n’a pas été réservé : veuillez réessayer dans quelques minutes ou nous contacter.";

export const BOOKING_SECURITY_CHECK_MESSAGE =
  "Pour finaliser cette réservation, effectuez la vérification anti-robot affichée au-dessus du bouton, puis cliquez de nouveau sur « Procéder au paiement ».";

export const BOOKING_SECURITY_CHECK_UNAVAILABLE_MESSAGE =
  "La vérification anti-robot est momentanément indisponible. Votre créneau n’a pas été réservé : veuillez réessayer dans quelques minutes ou nous contacter.";

/** Refus métier d’une réservation : message français et motif stable que la page traduit (EN-06). */
function bookingRefusal(
  code:
    | "BAD_REQUEST"
    | "CONFLICT"
    | "UNPROCESSABLE_CONTENT"
    | "TOO_MANY_REQUESTS"
    | "SERVICE_UNAVAILABLE"
    | "PRECONDITION_FAILED",
  reason: BookingRefusalReason,
  message: string
) {
  return new TRPCError({ code, message, cause: new PublicErrorReason(reason) });
}

/** Index unique de slot_key : un seul rendez-vous retient un créneau à la fois. */
const ACTIVE_SLOT_UNIQUE_INDEX = "appointments_active_slot_unique";

/**
 * Réservation simultanée du même créneau perdue sur son index unique (23505).
 * drizzle-orm enveloppe l’erreur PostgreSQL dans une DrizzleQueryError
 * (« Failed query: … ») : le code et le nom de la contrainte sont dans sa
 * cause, jamais dans son propre texte.
 */
function isActiveSlotConflict(error: unknown): boolean {
  if (postgresErrorCode(error) !== "23505") return false;
  for (
    let current: unknown = error, depth = 0;
    current && typeof current === "object" && depth < 4;
    depth += 1
  ) {
    const { code, constraint, message } = current as {
      code?: unknown;
      constraint?: unknown;
      message?: unknown;
    };
    if (typeof code === "string")
      return (
        constraint === ACTIVE_SLOT_UNIQUE_INDEX ||
        (typeof message === "string" &&
          message.includes(`"${ACTIVE_SLOT_UNIQUE_INDEX}"`))
      );
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Rendez-vous qui occupent leur créneau, pour la disponibilité publique et le
 * contrôle de chevauchement : réservation temporaire en cours, rendez-vous
 * confirmé ou payé. Un maintien expiré est proposé libre : le réserver le règle
 * d’abord avec Stripe (releaseExpiredAppointmentHolds), qui le libère, le
 * confirme s’il a été payé, ou le garde quand Stripe ne répond pas ; gardé, il
 * est prolongé de quelques minutes et reste pris (EXPL-01).
 */
export function occupiesSlot() {
  return or(
    and(
      eq(appointments.paymentStatus, "pending"),
      eq(appointments.appointmentStatus, "held"),
      sql`${appointments.holdExpiresAt} > NOW()`
    ),
    and(
      eq(appointments.paymentStatus, "pending"),
      eq(appointments.appointmentStatus, "confirmed")
    ),
    and(
      eq(appointments.paymentStatus, "completed"),
      inArray(appointments.appointmentStatus, ["confirmed", "completed"])
    )
  );
}

/**
 * Adresse du patient : la même règle à la réservation et à sa correction depuis
 * l’administration (EXPL-02), et sur la page de réservation (RES-10), une fois
 * retirés les espaces et marques invisibles qu’un copier-coller laisse aux
 * extrémités ; une marque invisible restée à l’intérieur est refusée avec le
 * motif invalid_characters (INTL-05).
 */
export const bookingCustomerEmail = emailText(
  z.string().max(320).refine(isBookingEmailAddress, "Adresse email invalide")
);

/**
 * Caractères de contrôle d’un numéro (NUL, saut de ligne, tabulation, C1) :
 * refusés avec le motif invalid_characters (INTL-05), et non avec le JSON de
 * la validation ; les marques de direction d’un numéro collé, elles, sont
 * retirées par normalizePhoneInput (INTL-09).
 */
// eslint-disable-next-line no-control-regex -- les caractères de contrôle sont ceux que l’on refuse
const PHONE_CONTROL_CHARACTERS = new RegExp(
  "[\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029]"
);

/**
 * Description de la ligne Stripe dans la langue de la page de réservation
 * (RES-14) : la référence, puis la date et l’heure de Paris du rendez-vous,
 * que le patient vérifie avant de payer, écrites dans la locale de la page
 * (BOOKING_LOCALES).
 */
const CHECKOUT_APPOINTMENT_DESCRIPTIONS: Record<
  SiteLanguage,
  (trackingId: string, slot: string) => string
> = {
  fr: (trackingId, slot) =>
    `Rendez-vous : ${trackingId} – ${slot}, heure de Paris`,
  en: (trackingId, slot) => `Appointment: ${trackingId} – ${slot}, Paris time`,
  de: (trackingId, slot) => `Termin: ${trackingId} – ${slot}, Pariser Zeit`,
  zh: (trackingId, slot) => `预约：${trackingId} – ${slot}，巴黎时间`,
};

/**
 * Libellé de la ligne Stripe Checkout, visible sur la page de paiement et le
 * reçu : « Rendez-vous : APT… – jeu. 29 oct. 2026, 19:00, heure de Paris ».
 * Une langue que le site ne propose pas reste en français.
 */
export function consultationCheckoutProductData(
  trackingId: string,
  appointmentDate: Date,
  language: string
) {
  const bookingLanguage = (SITE_LANGUAGES as readonly string[]).includes(
    language
  )
    ? (language as SiteLanguage)
    : "fr";
  const slot = new Intl.DateTimeFormat(BOOKING_LOCALES[bookingLanguage], {
    timeZone: PARIS_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(appointmentDate);
  return {
    name: CONSULTATION_CHECKOUT_PRODUCT_NAME,
    description: CHECKOUT_APPOINTMENT_DESCRIPTIONS[bookingLanguage](
      trackingId,
      slot
    ),
  };
}

/** Montant en centimes écrit comme les colonnes base_price et final_price (« 150.00 »). */
function decimalAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

const appointmentDateInput = z
  .string()
  .min(1, "La date de consultation est requise")
  .refine(value => {
    try {
      parseAppointmentDate(value);
      return true;
    } catch {
      return false;
    }
  }, "La date de consultation est invalide");

export const appointmentsRouter = router({
  calculatePrice: publicProcedure
    .input(
      z.object({
        appointmentDate: appointmentDateInput,
      })
    )
    .query(({ input }) => {
      // Le prix que la page affiche, celui que create envoie à Stripe (CODE-09).
      const date = parseAppointmentDate(input.appointmentDate);

      return {
        basePrice: CONSULTATION_DAY_RATE_CENTS / 100,
        finalPrice: consultationPriceCents(date) / 100,
        isNightRate: isNightRateForParis(date),
      };
    }),

  create: publicProcedure
    .input(
      z.object({
        // Sans caractère de contrôle (PostgreSQL refuse NUL dans un texte) ni
        // inversion du sens du texte (INTL-05) : refusé en 400, motif
        // invalid_characters. Vide une fois nettoyé, il est refusé plus bas
        // avec le motif invalid_name, que la page traduit.
        customerName: singleLineText(z.string().max(255)),
        customerEmail: bookingCustomerEmail,
        // Lu comme la page le vérifie (chiffres arabes, persans ou pleine
        // chasse en 0-9, sans marques de direction), puis enregistré au format
        // E.164 : « + », l’indicatif et les chiffres seuls (INTL-09).
        customerPhone: z
          .string()
          .refine(
            phone => !PHONE_CONTROL_CHARACTERS.test(phone),
            TEXT_INPUT_INVALID_CHARACTERS
          )
          .transform(normalizePhoneInput)
          .pipe(
            z
              .string()
              .min(1)
              .max(50)
              .refine(isPlausiblePhoneNumber, BOOKING_INVALID_PHONE_MESSAGE)
          )
          .transform(phone => toE164PhoneNumber(phone) ?? phone),
        appointmentDate: appointmentDateInput,
        // Objet de la demande, sans information médicale (minimisation) :
        // conservé pour le tableau de bord, jamais recopié dans un email.
        requestDetails: multiLineText(
          z.string().min(1).max(BOOKING_REQUEST_SUBJECT_MAX_LENGTH)
        ),
        // Langue affichée par la page de réservation : emails patients en
        // français pour « fr », en anglais sinon (EN-01).
        language: z.enum(SITE_LANGUAGES).optional().default("fr"),
        // Jeton anti-robot, envoyé seulement après un refus « security_check_required » (ABUS-02).
        turnstileToken: z.string().min(20).max(4096).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Nom sans lettre ni chiffre visible (espaces, caractères invisibles,
      // emoji seuls) : la facture n’aurait pas de nom lisible. Refusé comme
      // une saisie invalide, avant le compteur anti-abus, avec un motif que
      // la page traduit.
      if (!hasVisibleNameCharacter(input.customerName)) {
        throw bookingRefusal(
          "BAD_REQUEST",
          "invalid_name",
          BOOKING_INVALID_NAME_MESSAGE
        );
      }
      const date = parseAppointmentDate(input.appointmentDate);
      // Délai minimal (le passé compris) et horizon maximal : refus métier,
      // traduits par la page à partir de leur motif (UNPROCESSABLE_CONTENT).
      const bookingWindowIssue = getBookingWindowIssue(date);
      if (bookingWindowIssue) {
        throw bookingRefusal(
          "UNPROCESSABLE_CONTENT",
          bookingWindowIssue,
          bookingWindowIssue === "too_soon"
            ? BOOKING_TOO_SOON_MESSAGE
            : BOOKING_TOO_FAR_MESSAGE
        );
      }

      // Endpoint public sans Turnstile (parcours de paiement) : chaque appel
      // retient un créneau et ouvre une session Stripe, d’où un compteur
      // persistant par IP puis par email avant tout accès à l’agenda.
      const customerEmailKey = input.customerEmail.trim().toLowerCase();
      const rateLimitRequest = {
        email: customerEmailKey,
        headers: ctx.req.headers as Record<string, unknown>,
        remoteIp: ctx.req.ip,
      };
      const giveBackIpAttempt = await enforcePublicFormRateLimit({
        kind: "bookingIp",
        ...rateLimitRequest,
      });
      const giveBackEmailAttempt = await enforcePublicFormRateLimit({
        kind: "bookingEmail",
        ...rateLimitRequest,
      });
      const bookingIpHash =
        requestIpHash(rateLimitRequest.headers) ??
        (ctx.req.ip ? hashSecurityValue(ctx.req.ip) : null);
      const giveBackAttempts = () =>
        Promise.all([giveBackIpAttempt(), giveBackEmailAttempt()]).then(
          () => undefined,
          error =>
            console.error(
              "Booking attempt could not be given back:",
              error instanceof Error ? error.name : "UnknownError"
            )
        );
      // RES-08 : refus métier (créneau pris entre-temps, date fermée, hors
      // horaires, créneaux déjà retenus) ou paiement indisponible : le patient
      // n’y est pour rien et choisit un autre créneau sans perdre d’essai. Ces
      // essais rendus ont leur plafond par IP : au-delà, l’essai reste compté
      // (le refus, lui, ne change pas), et le compteur par IP arrête un script
      // qui viserait en boucle des créneaux pris.
      const refusedWithoutAttempt = async (refusal: TRPCError) => {
        if (await withinBookingGiveBackCap(rateLimitRequest))
          await giveBackAttempts();
        return refusal;
      };

      // Tarif de shared/bookingPolicy.ts, celui que calculatePrice donne à la page (CODE-09).
      const basePrice = decimalAmount(CONSULTATION_DAY_RATE_CENTS);
      const isNightRate = isNightRateForParis(date);
      const finalPriceCents = consultationPriceCents(date);
      const finalPrice = decimalAmount(finalPriceCents);

      const trackingId = `APT${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

      const db = await getDb();
      if (!db) {
        throw new Error("Database connection failed");
      }

      try {
        const {
          bookingHoldSettlementFulfillment,
          getAppointmentHoldExpiry,
          getExpiredAppointmentHoldUpdate,
          holdWithinCheckoutSession,
          releaseExpiredAppointmentHolds,
          stripeExpiresAt,
        } = await import("../appointmentHolds");
        // Un maintien expiré dont la session a pourtant été payée (webhook
        // absent) est confirmé au lieu d’être libéré pour cette réservation ;
        // la notification au médecin et la confirmation de ce patient partent
        // aussitôt, ce patient-ci ne les attend que quelques secondes au plus
        // (EXPL-01). Ce qui n’a pas pu partir dans ce délai reste dû pour le
        // traitement suivant (webhook, tâche planifiée, « Renvoyer »).
        await releaseExpiredAppointmentHolds(getStripeClient, new Date(), {
          fulfillmentTimeoutMs: bookingHoldSettlementFulfillment.timeoutMs,
        });

        // Plafond de créneaux retenus simultanément par une même adresse
        // (comparaison insensible à la casse) : un patient peut relancer un
        // paiement abandonné sans pouvoir verrouiller l’agenda en boucle. Un
        // maintien gardé faute de réponse de Stripe ne compte pas : le
        // patient n’y peut rien.
        const [activeHolds] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(appointments)
          .where(
            and(
              sql`LOWER(${appointments.customerEmail}) = ${customerEmailKey}`,
              eq(appointments.paymentStatus, "pending"),
              eq(appointments.appointmentStatus, "held"),
              sql`${appointments.holdExpiresAt} > NOW()`,
              holdWithinCheckoutSession()
            )
          );
        if (
          Number(activeHolds?.count ?? 0) >=
          MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL
        ) {
          throw await refusedWithoutAttempt(
            bookingRefusal(
              "TOO_MANY_REQUESTS",
              "too_many_holds",
              ACTIVE_APPOINTMENT_HOLDS_LIMIT_MESSAGE
            )
          );
        }

        const dateKey = parisDateKey(date);
        const blockedDate = await db
          .select({ id: blockedDates.id })
          .from(blockedDates)
          .where(eq(blockedDates.date, dateKey))
          .limit(1);

        if (blockedDate.length > 0) {
          throw await refusedWithoutAttempt(
            bookingRefusal(
              "CONFLICT",
              "date_blocked",
              "Cette date est indisponible"
            )
          );
        }

        const activeSlots = await db
          .select({
            dayOfWeek: availabilitySlots.dayOfWeek,
            startTime: availabilitySlots.startTime,
            endTime: availabilitySlots.endTime,
          })
          .from(availabilitySlots)
          .where(eq(availabilitySlots.isActive, 1));

        if (!isBookableAppointmentTime(date, activeSlots, 30)) {
          throw await refusedWithoutAttempt(
            activeSlots.length === 0
              ? bookingRefusal(
                  "CONFLICT",
                  "no_availability",
                  "Aucun créneau de consultation n’est actuellement ouvert"
                )
              : bookingRefusal(
                  "CONFLICT",
                  "outside_schedule",
                  "Ce créneau ne correspond pas aux disponibilités configurées"
                )
          );
        }

        const appointmentEnd = new Date(date.getTime() + 30 * 60 * 1000);
        // DATA-13 : les bornes partent en chaînes ISO-8601 UTC, comme la fin du
        // maintien plus bas. Des Date seraient envoyées à l’heure locale du
        // processus : en TZ=Europe/Paris, la fenêtre testée glisserait d’une à
        // deux heures, et le créneau libre juste avant un rendez-vous serait refusé.
        const existingAppointments = await db
          .select({ id: appointments.id })
          .from(appointments)
          .where(
            and(
              sql`appointment_date < ${appointmentEnd.toISOString()}`,
              sql`appointment_date + (duration * INTERVAL '1 minute') > ${date.toISOString()}`,
              occupiesSlot()
            )
          )
          .limit(1);

        if (existingAppointments.length > 0) {
          throw await refusedWithoutAttempt(
            bookingRefusal(
              "CONFLICT",
              "slot_taken",
              "Ce créneau chevauche une réservation existante"
            )
          );
        }

        const appointmentDateFormatted = date
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
        const slotKey = date.toISOString();
        // Le maintien (et donc l’expiration Stripe) ne dépasse jamais le début
        // du créneau ; s’il ne reste pas assez de temps pour une session Stripe
        // valide, la réservation est refusée avant toute écriture.
        const holdExpiresAt = getAppointmentHoldExpiry(new Date(), date);
        if (!holdExpiresAt) {
          throw await refusedWithoutAttempt(
            bookingRefusal(
              "UNPROCESSABLE_CONTENT",
              "too_soon",
              BOOKING_TOO_SOON_MESSAGE
            )
          );
        }
        // ABUS-02 : pas d’anti-robot sur le parcours normal. Il n’est demandé,
        // avant de retenir le créneau et d’ouvrir Stripe, que si beaucoup de
        // créneaux sont déjà retenus sans paiement ou si cette IP en retient deux.
        const { bookingChallengeRequired, recordBookingHold } = await import(
          "../appointmentHoldAbuse"
        );
        // Un jeton ne se vérifie qu’une fois ; un jeton refusé est journalisé.
        // « unavailable » : Cloudflare n’a pas pu juger le jeton (siteverify
        // injoignable ou en erreur, secret absent), le patient n’y est pour rien.
        const passBookingChallenge = async (): Promise<
          "passed" | "missing" | "refused" | "unavailable"
        > => {
          try {
            await verifyCandidateTurnstile({
              token: input.turnstileToken,
              remoteIp: ctx.req.ip,
            });
            return "passed";
          } catch (error) {
            if (!input.turnstileToken) return "missing";
            const refused =
              error instanceof Error &&
              error.message === "candidate_turnstile_invalid";
            await logSecurityEvent({
              actorKind: "anonymous",
              category: refused
                ? "public_booking_challenge"
                : "public_booking_challenge_unavailable",
              outcome: refused ? "blocked" : "failed",
              severity: "warning",
              ipHash: bookingIpHash,
            }).catch(() => undefined);
            return refused ? "refused" : "unavailable";
          }
        };
        // Vérification seulement demandée (pas de jeton) ou impossible : la
        // réservation ne consomme pas d’essai, le nouvel essai avec son jeton
        // compte une fois ; ces refus ont leur propre plafond, vérifié avant
        // de rendre l’essai : au-delà, il reste compté et le compteur par IP
        // arrête le script avant l’agenda. Un jeton refusé reste compté.
        // Service anti-robot en panne : refus distinct, pour ne pas renvoyer
        // en boucle vers la vérification.
        const challengeRefusal = async (
          outcome: "missing" | "refused" | "unavailable"
        ) => {
          if (outcome !== "refused") {
            await enforcePublicFormRateLimit({
              kind: "bookingChallengeIp",
              ...rateLimitRequest,
            });
            await giveBackAttempts();
          }
          return outcome === "unavailable"
            ? bookingRefusal(
                "SERVICE_UNAVAILABLE",
                "security_check_unavailable",
                BOOKING_SECURITY_CHECK_UNAVAILABLE_MESSAGE
              )
            : bookingRefusal(
                "PRECONDITION_FAILED",
                "security_check_required",
                BOOKING_SECURITY_CHECK_MESSAGE
              );
        };
        let bookingChallengePassed = false;
        if (await bookingChallengeRequired(db, bookingIpHash)) {
          const challenge = await passBookingChallenge();
          if (challenge !== "passed") throw await challengeRefusal(challenge);
          bookingChallengePassed = true;
        }
        // DATA-13 : la fin du maintien part en chaîne ISO-8601 UTC, comme dans
        // invoiceNumbering.ts. Une Date serait envoyée à l’heure locale du
        // processus, avec un décalage que PostgreSQL ignore pour une colonne
        // `timestamp` : en TZ=Europe/Paris, le maintien finirait 1 à 2 h trop tard.
        await db.execute(
          sql`INSERT INTO appointments (tracking_id, customer_name, customer_email, customer_phone, consultation_type, request_details, appointment_date, slot_key, duration, base_price, final_price, is_night_rate, payment_status, appointment_status, hold_expires_at, language) VALUES (${trackingId}, ${input.customerName}, ${input.customerEmail}, ${input.customerPhone}, ${"health_advice"}, ${input.requestDetails}, ${appointmentDateFormatted}, ${slotKey}, ${30}, ${basePrice}, ${finalPrice}, ${isNightRate ? 1 : 0}, ${"pending"}, ${"held"}, ${holdExpiresAt.toISOString()}, ${input.language})`
        );
        await recordBookingHold(bookingIpHash, trackingId).catch(error =>
          console.error(
            "Booking hold record failed:",
            error instanceof Error ? error.name : "UnknownError"
          )
        );
        // Réservations simultanées : chacune a pu lire l’état d’avant les
        // autres. Le contrôle est refait, ce maintien compris, avant Stripe ;
        // sans vérification passée, le créneau est aussitôt libéré.
        if (
          !bookingChallengePassed &&
          (await bookingChallengeRequired(db, bookingIpHash, {
            afterOwnHold: true,
          }))
        ) {
          const challenge = await passBookingChallenge();
          if (challenge !== "passed") {
            await db
              .update(appointments)
              .set(getExpiredAppointmentHoldUpdate())
              .where(
                and(
                  eq(appointments.trackingId, trackingId),
                  eq(appointments.paymentStatus, "pending"),
                  eq(appointments.appointmentStatus, "held")
                )
              );
            throw await challengeRefusal(challenge);
          }
        }

        let session: Stripe.Checkout.Session;
        try {
          session = await getStripeClient().checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
              {
                price_data: {
                  currency: "eur",
                  product_data: consultationCheckoutProductData(
                    trackingId,
                    date,
                    input.language
                  ),
                  unit_amount: finalPriceCents,
                },
                quantity: 1,
              },
            ],
            mode: "payment",
            customer_email: input.customerEmail,
            metadata: { trackingId, customerName: input.customerName },
            expires_at: stripeExpiresAt(holdExpiresAt),
            success_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=success&trackingId=${encodeURIComponent(trackingId)}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=canceled&session_id={CHECKOUT_SESSION_ID}`,
          });
          if (!session.id || !session.url)
            throw new Error("stripe_checkout_session_unavailable");
        } catch (stripeError) {
          // Paiement indisponible : le créneau est libéré et le patient reçoit
          // une consigne claire, jamais le texte technique de Stripe.
          await db
            .update(appointments)
            .set(getExpiredAppointmentHoldUpdate())
            .where(
              and(
                eq(appointments.trackingId, trackingId),
                eq(appointments.paymentStatus, "pending"),
                eq(appointments.appointmentStatus, "held")
              )
            );
          console.error(
            "Stripe checkout session creation failed:",
            stripeError instanceof Error ? stripeError.name : "UnknownError"
          );
          throw await refusedWithoutAttempt(
            bookingRefusal(
              "SERVICE_UNAVAILABLE",
              "payment_unavailable",
              BOOKING_PAYMENT_UNAVAILABLE_MESSAGE
            )
          );
        }
        await db
          .update(appointments)
          .set({ stripeSessionId: session.id })
          .where(
            and(
              eq(appointments.trackingId, trackingId),
              eq(appointments.appointmentStatus, "held")
            )
          );
        // La page de réservation garde la session et l’expiration du maintien
        // (sessionStorage) pour proposer « Reprendre le paiement » ou
        // « Annuler et choisir un autre créneau » après un retour arrière.
        return {
          success: true,
          trackingId,
          finalPrice: finalPriceCents / 100,
          checkoutUrl: session.url!,
          checkoutSessionId: session.id,
          holdExpiresAt: holdExpiresAt.toISOString(),
        };
      } catch (dbError) {
        if (dbError instanceof TRPCError) throw dbError;
        console.error(
          "Appointment creation failed:",
          dbError instanceof Error ? dbError.name : "UnknownError"
        );
        if (isActiveSlotConflict(dbError)) {
          throw await refusedWithoutAttempt(
            bookingRefusal(
              "CONFLICT",
              "slot_taken",
              "Ce créneau vient d’être réservé par un autre patient. Veuillez en choisir un autre."
            )
          );
        }
        // Jamais de requête SQL ni de message de fournisseur dans la réponse.
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "La réservation n’a pas pu être enregistrée. Veuillez réessayer dans quelques instants.",
        });
      }

      // Unreachable: the successful branch returns a Stripe Checkout URL.
    }),

  createCheckoutSession: publicProcedure
    .input(
      z.object({
        trackingId: z.string(),
        finalPrice: z.number(),
        // Gardée par la page telle que tapée, enregistrée nettoyée (INTL-05) : comparée nettoyée.
        customerEmail: emailText(z.string().email()),
        customerName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");

        const appointmentResult = await db
          .select({
            trackingId: appointments.trackingId,
            customerEmail: appointments.customerEmail,
            customerName: appointments.customerName,
            finalPrice: appointments.finalPrice,
            appointmentDate: appointments.appointmentDate,
            language: appointments.language,
            paymentStatus: appointments.paymentStatus,
            appointmentStatus: appointments.appointmentStatus,
            stripeSessionId: appointments.stripeSessionId,
            holdExpiresAt: appointments.holdExpiresAt,
          })
          .from(appointments)
          .where(eq(appointments.trackingId, input.trackingId))
          .limit(1);
        const appointment = appointmentResult[0];

        if (!appointment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Rendez-vous introuvable",
          });
        }
        if (
          appointment.paymentStatus !== "pending" ||
          appointment.appointmentStatus !== "held" ||
          !appointment.holdExpiresAt ||
          appointment.holdExpiresAt <= new Date()
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ce rendez-vous ne peut plus être payé",
          });
        }

        const expectedPrice = Number(appointment.finalPrice);
        if (
          !Number.isFinite(expectedPrice) ||
          Math.round(expectedPrice * 100) !== Math.round(input.finalPrice * 100)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Le montant du paiement ne correspond pas au rendez-vous",
          });
        }
        // Nom enregistré nettoyé (INTL-05), gardé tel que tapé par la page
        // (espace final, marque de direction) : comparés nettoyés tous deux,
        // ce qui vaut aussi pour un créneau retenu avant ce nettoyage.
        if (
          cleanTextInput(appointment.customerEmail) !== input.customerEmail ||
          cleanTextInput(appointment.customerName) !==
            cleanTextInput(input.customerName)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Les informations du paiement ne correspondent pas au rendez-vous",
          });
        }

        if (appointment.stripeSessionId) {
          const existingSession =
            await getStripeClient().checkout.sessions.retrieve(
              appointment.stripeSessionId
            );
          if (existingSession.status === "open" && existingSession.url)
            return { success: true, checkoutUrl: existingSession.url };
          throw new TRPCError({
            code: "CONFLICT",
            message: "La session de paiement a expiré",
          });
        }

        const amountInCents = Math.round(expectedPrice * 100);
        const { STRIPE_CHECKOUT_MIN_EXPIRY_MS, stripeExpiresAt } = await import(
          "../appointmentHolds"
        );
        // Stripe refuse une expiration à moins de 30 min : un maintien presque
        // écoulé ne peut plus ouvrir de session valide.
        if (
          appointment.holdExpiresAt.getTime() - Date.now() <
          STRIPE_CHECKOUT_MIN_EXPIRY_MS
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "La session de paiement a expiré. Veuillez choisir à nouveau votre créneau.",
          });
        }

        const session = await getStripeClient().checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "eur",
                product_data: consultationCheckoutProductData(
                  input.trackingId,
                  appointment.appointmentDate,
                  appointment.language
                ),
                unit_amount: amountInCents,
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          customer_email: input.customerEmail,
          metadata: {
            trackingId: input.trackingId,
            customerName: appointment.customerName,
          },
          expires_at: stripeExpiresAt(appointment.holdExpiresAt),
          success_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=success&trackingId=${encodeURIComponent(input.trackingId)}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=canceled&session_id={CHECKOUT_SESSION_ID}`,
        });

        if (session.id) {
          await db
            .update(appointments)
            .set({ stripeSessionId: session.id })
            .where(
              and(
                eq(appointments.trackingId, input.trackingId),
                eq(appointments.appointmentStatus, "held")
              )
            );
        }

        return {
          success: true,
          checkoutUrl: session.url,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error(
          "Stripe checkout session error:",
          error instanceof Error ? error.name : "UnknownError"
        );
        throw bookingRefusal(
          "SERVICE_UNAVAILABLE",
          "payment_unavailable",
          BOOKING_PAYMENT_UNAVAILABLE_MESSAGE
        );
      }
    }),

  /**
   * État réel d’un paiement pour la page de retour Stripe (confirmé, en cours
   * de validation, à régulariser…), sans jamais se fier au seul ?status=success.
   */
  publicStatus: publicProcedure
    .input(
      z.object({
        trackingId: z.string().regex(/^APT[A-Z0-9]{6,17}$/),
        sessionId: z.string().regex(/^cs_[A-Za-z0-9_]{6,250}$/),
      })
    )
    .query(async ({ input }) => {
      const { getPublicPaymentState } = await import(
        "../appointmentPublicStatus"
      );
      return getPublicPaymentState(getStripeClient, input);
    }),

  cancelPending: publicProcedure
    .input(z.object({ sessionId: z.string().min(1).max(255) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      let session: Stripe.Checkout.Session;
      try {
        session = await getStripeClient().checkout.sessions.retrieve(
          input.sessionId
        );
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session Stripe invalide",
        });
      }

      const trackingId = session.metadata?.trackingId;
      if (
        !trackingId ||
        session.payment_status === "paid" ||
        session.status === "complete"
      ) {
        return { success: true, cancelled: false };
      }

      // Stripe keeps the Checkout page payable until it expires: close it before
      // releasing the hold, so going back to it can no longer charge the patient
      // for a slot that is not reserved anymore. If Stripe refuses (the payment
      // just completed) or is unreachable, the hold stays and the webhook or the
      // scheduled hold expiry settles it.
      if (session.status !== "expired") {
        try {
          await getStripeClient().checkout.sessions.expire(input.sessionId);
        } catch {
          return { success: true, cancelled: false };
        }
      }

      const [cancelledBooking] = await db
        .update(appointments)
        .set({
          appointmentStatus: "cancelled",
          slotKey: null,
          holdExpiresAt: null,
          cancelledAt: new Date(),
        })
        .where(
          and(
            eq(appointments.trackingId, trackingId),
            eq(appointments.stripeSessionId, input.sessionId),
            eq(appointments.paymentStatus, "pending"),
            eq(appointments.appointmentStatus, "held")
          )
        )
        .returning({ customerEmail: appointments.customerEmail });

      // RES-08 : le patient qui annule lui-même sa réservation en attente pour
      // choisir un autre créneau retrouve l’essai qu’elle a compté pour son IP
      // et pour son email (le plus bas des deux seuils), dans la limite du
      // plafond des essais rendus (voir appointments.create).
      if (cancelledBooking) {
        const rateLimitRequest = {
          email: cancelledBooking.customerEmail.trim().toLowerCase(),
          headers: ctx.req.headers as Record<string, unknown>,
          remoteIp: ctx.req.ip,
        };
        if (await withinBookingGiveBackCap(rateLimitRequest)) {
          await Promise.all([
            givePublicFormAttemptBack({
              kind: "bookingIp",
              ...rateLimitRequest,
            }),
            givePublicFormAttemptBack({
              kind: "bookingEmail",
              ...rateLimitRequest,
            }),
          ]).catch(error =>
            console.error(
              "Booking attempt could not be given back:",
              error instanceof Error ? error.name : "UnknownError"
            )
          );
        }
      }

      return { success: true, cancelled: Boolean(cancelledBooking) };
    }),
});

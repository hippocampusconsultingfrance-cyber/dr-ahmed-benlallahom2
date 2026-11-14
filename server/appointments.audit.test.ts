import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSULTATION_DAY_RATE_CENTS,
  CONSULTATION_NIGHT_RATE_CENTS,
  isNightRateForParis,
} from "../shared/bookingPolicy";
import {
  getParisParts,
  isBookableAppointmentTime,
  isWithinAvailability,
  parisWallClockTime,
} from "../shared/parisTime";
import { buildInvoiceContent, formatInvoiceAmount } from "./invoice";
import { resolveInvoiceSeller } from "./invoiceSeller";
import { appRouter, parseAppointmentDate } from "./routers";
import { getParisDateRange } from "./routers/parisTime";
import { createTestContext } from "./testSupport/trpcContext";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  releaseExpiredAppointmentHolds: vi.fn(),
  stripeCreate: vi.fn(),
  language: "fr",
  price: undefined as unknown,
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./appointmentHolds", async importOriginal => ({
  ...(await importOriginal<typeof import("./appointmentHolds")>()),
  releaseExpiredAppointmentHolds: mocks.releaseExpiredAppointmentHolds,
}));
// Few holds awaiting payment: no anti-robot check (ABUS-02, covered by appointments.holdAbuse.test.ts).
vi.mock("./appointmentHoldAbuse", () => ({
  bookingChallengeRequired: vi.fn(async () => false),
  recordBookingHold: vi.fn(async () => undefined),
}));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mocks.stripeCreate, retrieve: vi.fn() } },
  })),
}));
// The booking page, rendered with the price appointments.calculatePrice gave it.
vi.mock("wouter", () => ({
  useLocation: () => ["/booking", vi.fn()],
  Link: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));
vi.mock("@/contexts/LanguageContext", async () => {
  const content: Record<string, unknown> = {
    fr: (await import("@/data/content-fr")).contentFr,
    en: (await import("@/data/content-en")).contentEn,
    de: (await import("@/data/content-de")).contentDe,
    zh: (await import("@/data/content-zh")).contentZh,
  };
  return {
    useLanguage: () => ({
      language: mocks.language,
      content: content[mocks.language],
      setLanguage: vi.fn(),
      suggestEnglish: false,
    }),
  };
});
vi.mock("@/lib/trpc", () => {
  const query = (data: () => unknown) => ({
    useQuery: () => ({
      data: data(),
      isLoading: false,
      isError: false,
      isFetching: false,
      errorUpdatedAt: 0,
      dataUpdatedAt: 1,
      refetch: vi.fn(),
    }),
  });
  const mutation = {
    useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
  return {
    trpc: {
      availability: {
        getBlockedDates: query(() => []),
        getBookedSlots: query(() => []),
        getSlots: query(() => []),
      },
      appointments: {
        calculatePrice: query(() => mocks.price),
        create: mutation,
        createCheckoutSession: mutation,
        cancelPending: mutation,
      },
    },
  };
});

const {
  default: BookingPage,
  bookingContent,
  listBookableSlots,
} = await import("../client/src/pages/BookingPage");

describe("Appointment pricing audit", () => {
  it("uses the daytime rate at 08:00 in Paris during summer time", () => {
    expect(isNightRateForParis(new Date("2026-08-16T06:00:00.000Z"))).toBe(
      false
    );
  });

  it("uses the night rate before 08:00 in Paris during summer time", () => {
    expect(isNightRateForParis(new Date("2026-08-16T05:59:00.000Z"))).toBe(
      true
    );
  });

  it("uses the daytime rate before 18:00 in Paris during summer time", () => {
    expect(isNightRateForParis(new Date("2026-08-16T15:59:00.000Z"))).toBe(
      false
    );
  });

  it("uses the night rate from 18:00 in Paris during summer time", () => {
    expect(isNightRateForParis(new Date("2026-08-16T16:00:00.000Z"))).toBe(
      true
    );
  });

  it("follows winter time changes in Europe/Paris", () => {
    expect(isNightRateForParis(new Date("2026-01-15T07:00:00.000Z"))).toBe(
      false
    );
    expect(isNightRateForParis(new Date("2026-01-15T17:00:00.000Z"))).toBe(
      true
    );
  });

  it("interprets a timezone-less booking date as Europe/Paris local time", () => {
    expect(parseAppointmentDate("2026-08-16T18:00").toISOString()).toBe(
      "2026-08-16T16:00:00.000Z"
    );
    expect(parseAppointmentDate("2026-09-03T10:30").toISOString()).toBe(
      "2026-09-03T08:30:00.000Z"
    );
    expect(parseAppointmentDate("2026-01-15T08:00").toISOString()).toBe(
      "2026-01-15T07:00:00.000Z"
    );
  });

  it("requires the full 30-minute consultation to fit inside an availability window", () => {
    const mondaySlot = [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }];
    expect(
      isWithinAvailability(parseAppointmentDate("2026-08-17T11:30"), mondaySlot)
    ).toBe(true);
    expect(
      isWithinAvailability(parseAppointmentDate("2026-08-17T11:31"), mondaySlot)
    ).toBe(false);
    expect(
      isWithinAvailability(parseAppointmentDate("2026-08-17T09:15"), mondaySlot)
    ).toBe(false);
  });

  it("fails closed when no consultation schedule is configured", () => {
    expect(
      isBookableAppointmentTime(parseAppointmentDate("2026-08-17T10:00"), [])
    ).toBe(false);
  });

  it("supports a configured window that crosses midnight", () => {
    const mondayNight = [
      { dayOfWeek: 1, startTime: "22:00", endTime: "02:00" },
    ];
    expect(
      isBookableAppointmentTime(
        parseAppointmentDate("2026-08-17T23:30"),
        mondayNight
      )
    ).toBe(true);
    expect(
      isBookableAppointmentTime(
        parseAppointmentDate("2026-08-18T01:30"),
        mondayNight
      )
    ).toBe(true);
    expect(
      isBookableAppointmentTime(
        parseAppointmentDate("2026-08-18T02:00"),
        mondayNight
      )
    ).toBe(false);
  });

  it("reads the Paris clock whatever the time zone of the server process, on the day clocks go back", () => {
    const previousTimeZone = process.env.TZ;
    const sundayMorning = [
      { dayOfWeek: 0, startTime: "07:00", endTime: "08:00" },
    ];
    try {
      for (const timeZone of [
        "UTC",
        "Europe/Paris",
        "America/New_York",
        "Asia/Tokyo",
      ]) {
        process.env.TZ = timeZone;
        // Sunday 25 October 2026: winter time (UTC+1) from 03:00.
        expect(
          parseAppointmentDate("2026-10-25T07:30").toISOString(),
          timeZone
        ).toBe("2026-10-25T06:30:00.000Z");
        expect(
          isNightRateForParis(new Date("2026-10-25T06:59:00.000Z")),
          timeZone
        ).toBe(true);
        expect(
          isNightRateForParis(new Date("2026-10-25T07:00:00.000Z")),
          timeZone
        ).toBe(false);
        expect(
          isBookableAppointmentTime(
            parseAppointmentDate("2026-10-25T07:30"),
            sundayMorning
          ),
          timeZone
        ).toBe(true);
        expect(
          isBookableAppointmentTime(
            parseAppointmentDate("2026-10-25T08:00"),
            sundayMorning
          ),
          timeZone
        ).toBe(false);
      }
    } finally {
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });

  it("keeps the Paris offset to the second, as before 1911 (Paris mean time, +0:09:21)", () => {
    expect(parseAppointmentDate("1900-01-01T12:00").toISOString()).toBe(
      "1900-01-01T11:50:39.000Z"
    );
    expect(getParisDateRange("1900-01-01").start.toISOString()).toBe(
      "1899-12-31T23:50:39.000Z"
    );
    // Paris mean time ended at midnight in Paris, 23:50:39 UTC, in the middle of a UTC hour.
    expect(getParisParts(new Date("1911-03-10T23:45:00.000Z"))).toMatchObject({
      day: 10,
      hour: 23,
      minute: 54,
      second: 21,
    });
    expect(getParisParts(new Date("1911-03-10T23:55:00.000Z"))).toMatchObject({
      day: 10,
      hour: 23,
      minute: 55,
      second: 0,
    });
    // Years 0 to 99 stay themselves (Date.UTC would read the year 50 as 1950).
    expect(getParisParts(new Date("0050-06-01T10:00:00.000Z"))).toEqual({
      year: 50,
      month: 6,
      day: 1,
      hour: 10,
      minute: 9,
      second: 21,
      dayOfWeek: 3,
    });
    expect(parisWallClockTime(50, 6, 1, 12, 9, 21)?.toISOString()).toBe(
      "0050-06-01T12:00:00.000Z"
    );
  });
});

const ALL_DAY_SLOTS = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  startTime: "00:00",
  endTime: "00:00",
}));

function fakeDb(
  availability: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }> = ALL_DAY_SLOTS
) {
  const selectResults: unknown[][] = [[{ count: 0 }], [], availability, []];
  return {
    select: vi.fn(() => {
      const result = selectResults.shift() ?? [];
      const query = {
        from: () => query,
        where: () => query,
        limit: async () => result,
        then: (
          resolve: (value: unknown) => unknown,
          reject: (reason: unknown) => unknown
        ) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    }),
    execute: vi.fn(async () => ({ rowCount: 1 })),
    update: vi.fn(() => ({
      set: () => ({ where: async () => ({ rowCount: 1 }) }),
    })),
  };
}

const publicContext = () => createTestContext({ req: { ip: "192.0.2.1" } });

const bookingInput = (start: Date) => ({
  customerName: "Patient Synthétique",
  customerEmail: "patient@example.com",
  customerPhone: "+33 6 12 34 56 78",
  appointmentDate: start.toISOString(),
  requestDetails: "Demande d’avis",
});

/** What the booking page shows: each rate beside its label, and the total of the chosen time. */
function shownPrices() {
  const content = bookingContent[mocks.language as keyof typeof bookingContent];
  const html = renderToStaticMarkup(createElement(BookingPage)).replace(
    /<!-- -->/g,
    ""
  );
  const after = (label: string) =>
    [
      ...html.matchAll(
        new RegExp(
          `${label.replace(/[()]/g, "\\$&")}:?</span><(?:strong|span)[^>]*>([^<]+)<`,
          "g"
        )
      ),
    ].map(match => match[1]);
  return {
    day: after(content.pricing.dayRate),
    night: after(content.pricing.nightRate),
    total: after(content.pricing.total),
  };
}

/** Amount in cents of a price shown by the page (« 150 € »). */
const cents = (shown: string) =>
  Math.round(Number(shown.replace(/[^\d,.]/g, "").replace(",", ".")) * 100);

/** Columns and values of the appointment create inserted (amounts as the invoice reads them back). */
function insertedAppointment(
  db: ReturnType<typeof fakeDb>
): Record<string, unknown> {
  const queries = (db.execute.mock.calls as unknown as Array<[SQL]>).map(
    ([query]) => new PgDialect().sqlToQuery(query)
  );
  const insert = queries.find(query =>
    query.sql.startsWith("INSERT INTO appointments")
  );
  const columns =
    /^INSERT INTO appointments \(([^)]+)\)/
      .exec(insert?.sql ?? "")?.[1]
      .split(", ") ?? [];
  return Object.fromEntries(
    columns.map((column, index) => [column, insert?.params[index]])
  );
}

describe("prix affiché par la page et prix envoyé à Stripe (CODE-09)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_pricing_audit");
    mocks.releaseExpiredAppointmentHolds.mockResolvedValue({ released: 0 });
    mocks.stripeCreate.mockResolvedValue({
      id: "cs_test_pricing",
      url: "https://checkout.stripe.test/pricing",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mocks.language = "fr";
    mocks.price = undefined;
  });

  // Bords des deux plages, en heure d’été et en heure d’hiver (heure de Paris).
  const slots = [
    { at: "2026-08-17T08:00", night: false },
    { at: "2026-08-17T17:30", night: false },
    { at: "2026-08-17T18:00", night: true },
    { at: "2026-08-17T23:30", night: true },
    { at: "2026-08-18T07:30", night: true },
    { at: "2026-01-19T12:00", night: false },
    { at: "2026-01-19T19:00", night: true },
  ];

  for (const { at, night } of slots) {
    it(`montre pour ${at} (${night ? "tarif de nuit" : "tarif de jour"}) le prix que Stripe encaisse, à la réservation et à sa reprise`, async () => {
      const start = parseAppointmentDate(at);
      vi.setSystemTime(new Date(start.getTime() - 3 * 24 * 60 * 60 * 1000));
      const caller = appRouter.createCaller(publicContext());

      // The page shows the price calculatePrice gives for the chosen time.
      mocks.price = await caller.appointments.calculatePrice({
        appointmentDate: start.toISOString(),
      });
      const shown = shownPrices();

      const db = fakeDb();
      mocks.getDb.mockResolvedValue(db);
      const booked = await caller.appointments.create(bookingInput(start));
      const charged =
        mocks.stripeCreate.mock.calls[0][0].line_items[0].price_data
          .unit_amount;

      expect(charged).toBe(
        night ? CONSULTATION_NIGHT_RATE_CENTS : CONSULTATION_DAY_RATE_CENTS
      );
      expect(shown.total.map(cents)).toEqual([charged]);
      // The rate listed for this range (beside the form and in the pricing card) is the same amount.
      expect((night ? shown.night : shown.day).map(cents)).toEqual([
        charged,
        charged,
      ]);
      expect((night ? shown.day : shown.night).map(cents)).not.toContain(
        charged
      );

      // The amounts stored with the appointment, which its invoice prints once paid.
      const stored = insertedAppointment(db);
      expect(stored).toMatchObject({
        base_price: "100.00",
        final_price: (charged / 100).toFixed(2),
        is_night_rate: night ? 1 : 0,
      });
      const invoice = buildInvoiceContent(
        {
          invoiceNumber: "FAC-2026-000001",
          issueDate: start,
          paymentDate: start,
          trackingId: booked.trackingId,
          customerName: "Patient Synthétique",
          customerEmail: "patient@example.com",
          customerPhone: "+33612345678",
          appointmentDate: start,
          consultationType: "Conseil en santé",
          duration: 30,
          basePrice: Number(stored.base_price),
          finalPrice: Number(stored.final_price),
          isNightRate: stored.is_night_rate === 1,
        },
        resolveInvoiceSeller({})
      );
      expect(invoice.totalAmount).toBe(formatInvoiceAmount(charged / 100));
      expect(invoice.rows.map(row => row.description)).toEqual(
        night
          ? [
              "Consultation - Conseil en santé",
              "Majoration tarif de nuit (18h-8h) +50 %",
            ]
          : ["Consultation - Conseil en santé"]
      );

      // Back from Stripe, the page resumes the payment with the price create returned.
      const held = {
        trackingId: booked.trackingId,
        customerEmail: "patient@example.com",
        customerName: "Patient Synthétique",
        finalPrice: (charged / 100).toFixed(2),
        appointmentDate: start,
        language: "fr",
        paymentStatus: "pending",
        appointmentStatus: "held",
        stripeSessionId: null,
        holdExpiresAt: new Date(Date.now() + 45 * 60 * 1000),
      };
      mocks.getDb.mockResolvedValue({
        select: () => ({
          from: () => ({ where: () => ({ limit: async () => [held] }) }),
        }),
        update: db.update,
      });
      await caller.appointments.createCheckoutSession({
        trackingId: booked.trackingId,
        finalPrice: booked.finalPrice,
        customerEmail: held.customerEmail,
        customerName: held.customerName,
      });
      expect(
        mocks.stripeCreate.mock.calls[1][0].line_items[0].price_data.unit_amount
      ).toBe(charged);
    });
  }

  it("montre les mêmes montants dans chaque langue de la page", async () => {
    vi.setSystemTime(new Date("2026-08-14T10:00:00.000Z"));
    mocks.price = await appRouter
      .createCaller(publicContext())
      .appointments.calculatePrice({ appointmentDate: "2026-08-17T19:00" });
    for (const language of ["fr", "en", "de", "zh"]) {
      mocks.language = language;
      const shown = shownPrices();
      expect(
        {
          day: shown.day.map(cents),
          night: shown.night.map(cents),
          total: shown.total.map(cents),
        },
        language
      ).toEqual({
        day: [CONSULTATION_DAY_RATE_CENTS, CONSULTATION_DAY_RATE_CENTS],
        night: [CONSULTATION_NIGHT_RATE_CENTS, CONSULTATION_NIGHT_RATE_CENTS],
        total: [CONSULTATION_NIGHT_RATE_CENTS],
      });
    }
  });
});

describe("horaires proposés par la page et acceptés par l’API (CODE-08)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_schedule_audit");
    mocks.releaseExpiredAppointmentHolds.mockResolvedValue({ released: 0 });
    mocks.stripeCreate.mockResolvedValue({
      id: "cs_test_schedule",
      url: "https://checkout.stripe.test/schedule",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("réserve chaque horaire de la grille d’une plage à cheval sur minuit, et refuse ses voisins hors de la grille", async () => {
    // Le lundi de 22:00 à 02:00 (heure de Paris), vu le vendredi précédent.
    const mondayNight = [
      { dayOfWeek: 1, startTime: "22:00", endTime: "02:00" },
    ];
    vi.setSystemTime(new Date("2026-08-14T08:00:00.000Z"));
    const offered = listBookableSlots(mondayNight, []).filter(
      slot => slot.dayKey <= "2026-08-18"
    );
    expect(offered.map(slot => `${slot.dayKey} ${slot.time}`)).toEqual([
      "2026-08-17 22:00",
      "2026-08-17 22:30",
      "2026-08-17 23:00",
      "2026-08-17 23:30",
      "2026-08-18 00:00",
      "2026-08-18 00:30",
      "2026-08-18 01:00",
      "2026-08-18 01:30",
    ]);

    const caller = appRouter.createCaller(publicContext());
    const book = (start: Date) => {
      mocks.getDb.mockResolvedValue(fakeDb(mondayNight));
      return caller.appointments.create(bookingInput(start));
    };
    for (const slot of offered) {
      await expect(
        book(slot.start),
        `${slot.dayKey} ${slot.time}`
      ).resolves.toMatchObject({ trackingId: expect.any(String) });
    }
    expect(mocks.stripeCreate).toHaveBeenCalledTimes(offered.length);

    // Avant la plage, hors du pas de 30 minutes, ou trop tard pour finir avant 02:00.
    for (const outside of [
      "2026-08-17T21:30",
      "2026-08-17T22:15",
      "2026-08-18T00:15",
      "2026-08-18T01:45",
      "2026-08-18T02:00",
    ]) {
      await expect(
        book(parseAppointmentDate(outside)),
        outside
      ).rejects.toMatchObject({
        code: "CONFLICT",
        cause: { reason: "outside_schedule" },
      });
    }
    expect(mocks.stripeCreate).toHaveBeenCalledTimes(offered.length);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appointments,
  availabilitySlots,
  blockedDates,
  securityEvents,
} from "../../../drizzle/schema";
import {
  createInMemoryDrizzle,
  type InMemoryDrizzle,
} from "../../testSupport/inMemoryDrizzle";
import type { TrpcContext } from "../../_core/context";
import { parisDateKey } from "../parisTime";

// ADM-21 — Disponibilités : les créneaux du lundi au dimanche puis par heure,
// les dates bloquées à venir dans leur ordre, et une période de congés bloquée
// en une fois (366 jours au plus, jours de Paris), après un seul avertissement
// qui liste ses rendez-vous payés ; ses dates et sa ligne d'audit sont écrites
// ensemble, toutes ou aucune (DATA-01). Les réservations se suspendent et
// reprennent en une fois, tous les créneaux ensemble, avec leur ligne d'audit.

const state = vi.hoisted(() => ({ db: null as unknown, refuseAudit: false }));

vi.mock("../../db", () => ({ getDb: async () => state.db }));
vi.mock("../../adminMfa", async importOriginal => ({
  ...(await importOriginal<typeof import("../../adminMfa")>()),
  isAdminMfaVerified: vi.fn(async () => true),
}));
vi.mock("../../candidateSecurity", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../../candidateSecurity")>();
  return {
    ...actual,
    // A trace the database refuses (a missing category, refused by its NOT NULL).
    securityEventInsert: ((db, input) =>
      actual.securityEventInsert(
        db,
        state.refuseAudit
          ? { ...input, category: null as unknown as string }
          : input
      )) as typeof actual.securityEventInsert,
  };
});

const { adminAvailabilityRouter } = await import("./availability");
const { availabilityRouter } = await import("../availability");

const db = () => state.db as InMemoryDrizzle;
const DAY = 24 * 60 * 60 * 1000;
/** A Paris calendar day `offset` days from today. */
const day = (offset: number) =>
  parisDateKey(new Date(Date.now() + offset * DAY));

function admin() {
  return adminAvailabilityRouter.createCaller({
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  });
}

/** What the booking page reads: the open weekly slots. */
function publicSlots() {
  return availabilityRouter
    .createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        clearCookie: vi.fn(),
        cookie: vi.fn(),
      } as unknown as TrpcContext["res"],
    } as TrpcContext)
    .getSlots();
}

function paidAppointment(
  trackingId: string,
  date: string,
  time: string,
  extra: Record<string, unknown> = {}
) {
  // `time` is UTC: the warning reads it back on the Paris clock.
  const appointmentDate = new Date(`${date}T${time}:00Z`);
  return db().seed(appointments, {
    trackingId,
    customerName: "Patient",
    customerEmail: "patient@test.local",
    customerPhone: "0600000000",
    requestDetails: "Consultation",
    appointmentDate,
    basePrice: "100.00",
    finalPrice: "100.00",
    paymentStatus: "completed",
    appointmentStatus: "confirmed",
    ...extra,
  });
}

const parisTime = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
const parisDay = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

beforeEach(() => {
  state.db = createInMemoryDrizzle();
  state.refuseAudit = false;
});

describe("ADM-21 — listes des disponibilités", () => {
  it("range les créneaux du lundi au dimanche, puis par heure, quel que soit l’ordre de leur création", async () => {
    for (const [dayOfWeek, startTime, endTime] of [
      [0, "10:00", "12:00"],
      [3, "14:00", "16:00"],
      [1, "14:00", "15:00"],
      [6, "09:00", "10:00"],
      [1, "09:00", "12:00"],
      [1, "09:00", "10:00"],
    ] as const) {
      db().seed(availabilitySlots, { dayOfWeek, startTime, endTime });
    }
    const slots = await admin().listSlots();
    expect(
      slots.map(slot => `${slot.dayOfWeek} ${slot.startTime}-${slot.endTime}`)
    ).toEqual([
      "1 09:00-10:00",
      "1 09:00-12:00",
      "1 14:00-15:00",
      "3 14:00-16:00",
      "6 09:00-10:00",
      "0 10:00-12:00",
    ]);
  });

  it("ne liste que les dates bloquées à partir d’aujourd’hui, dans l’ordre du calendrier", async () => {
    for (const offset of [12, -3, 0, 5, -40])
      db().seed(blockedDates, { date: day(offset), reason: null });
    expect((await admin().listBlockedDates()).map(row => row.date)).toEqual([
      day(0),
      day(5),
      day(12),
    ]);
  });
});

describe("ADM-21 — bloquer une période", () => {
  it("bloque chaque jour de la période, en laissant tels quels ceux déjà bloqués, avec une seule ligne d’audit", async () => {
    db().seed(blockedDates, { date: day(11), reason: "Congrès" });
    const result = await admin().addBlockedPeriod({
      from: day(10),
      to: day(13),
      reason: "Congés",
    });

    expect(result).toEqual({
      success: true,
      blocked: 3,
      alreadyBlocked: 1,
      paidAppointments: [],
    });
    expect(
      db()
        .rows(blockedDates)
        .map(row => [row.date, row.reason])
        .sort()
    ).toEqual([
      [day(10), "Congés"],
      [day(11), "Congrès"],
      [day(12), "Congés"],
      [day(13), "Congés"],
    ]);
    const audit = db().rows(securityEvents);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorKind: "admin",
      actorReference: "user_owner",
      category: "admin_blocked_period_added",
      outcome: "allowed",
    });
    expect(JSON.parse(audit[0]!.metadata as string)).toEqual({
      from: day(10),
      to: day(13),
      blocked: 3,
      alreadyBlocked: 1,
      paidAppointments: 0,
    });
  });

  it("avertit une seule fois en listant les rendez-vous payés de la période, puis bloque après confirmation", async () => {
    const first = paidAppointment("APTPERIOD001", day(21), "09:00");
    const second = paidAppointment("APTPERIOD002", day(20), "13:30");
    // Neither cancelled nor unpaid bookings, nor those of the days around the period, are named.
    paidAppointment("APTCANCELLED", day(20), "15:00", {
      appointmentStatus: "cancelled",
    });
    paidAppointment("APTPENDING01", day(20), "16:00", {
      paymentStatus: "pending",
    });
    paidAppointment("APTOUTSIDE01", day(25), "09:00");

    const warning = admin().addBlockedPeriod({ from: day(20), to: day(22) });
    await expect(warning).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    const message = await warning.catch((error: Error) => error.message);
    // In the order of the calendar, with their day and their Paris time.
    expect(message).toContain(
      `2 rendez-vous payé(s) sur cette période (APTPERIOD002 le ${parisDay(second.appointmentDate as Date)} à ${parisTime(second.appointmentDate as Date)}, APTPERIOD001 le ${parisDay(first.appointmentDate as Date)} à ${parisTime(first.appointmentDate as Date)})`
    );
    expect(message).not.toMatch(/APTCANCELLED|APTPENDING01|APTOUTSIDE01/);
    expect(db().rows(blockedDates)).toEqual([]);
    expect(db().rows(securityEvents)).toEqual([]);

    await expect(
      admin().addBlockedPeriod({
        from: day(20),
        to: day(22),
        acknowledgePaidAppointments: true,
      })
    ).resolves.toEqual({
      success: true,
      blocked: 3,
      alreadyBlocked: 0,
      paidAppointments: ["APTPERIOD002", "APTPERIOD001"],
    });
    expect(
      db()
        .rows(blockedDates)
        .map(row => row.date)
        .sort()
    ).toEqual([day(20), day(21), day(22)]);
  });

  it("refuse une fin avant le début, un début passé, plus de 366 jours et une période déjà toute bloquée, sans rien écrire", async () => {
    await expect(
      admin().addBlockedPeriod({ from: day(10), to: day(9) })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "La fin de la période précède son début.",
    });
    await expect(
      admin().addBlockedPeriod({ from: day(-1), to: day(3) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      admin().addBlockedPeriod({ from: day(1), to: day(367) })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Une période compte 366 jours au plus : bloquez-la en plusieurs fois.",
    });
    // Up to the last date the field accepts: refused at once, without listing its millions of days first.
    const started = performance.now();
    await expect(
      admin().addBlockedPeriod({ from: day(1), to: "9999-12-31" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Une période compte 366 jours au plus : bloquez-la en plusieurs fois.",
    });
    expect(performance.now() - started).toBeLessThan(1000);
    await expect(
      admin().addBlockedPeriod({ from: "2026-02-30", to: day(3) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db().rows(blockedDates)).toEqual([]);

    // 366 days, both ends included: accepted.
    await expect(
      admin().addBlockedPeriod({ from: day(1), to: day(366) })
    ).resolves.toMatchObject({ blocked: 366 });
    await expect(
      admin().addBlockedPeriod({ from: day(4), to: day(6) })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Toutes les dates de cette période sont déjà bloquées.",
    });
    expect(db().rows(securityEvents)).toHaveLength(1);
  });

  it("n’écrit aucune date quand la ligne d’audit est refusée (DATA-01)", async () => {
    state.refuseAudit = true;
    await expect(
      admin().addBlockedPeriod({ from: day(30), to: day(32) })
    ).rejects.toThrow();
    expect(db().rows(blockedDates)).toEqual([]);
    expect(db().rows(securityEvents)).toEqual([]);
  });
});

describe("ADM-21 — suspendre et reprendre les réservations", () => {
  beforeEach(() => {
    db().seed(availabilitySlots, {
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "12:00",
    });
    db().seed(availabilitySlots, {
      dayOfWeek: 3,
      startTime: "14:00",
      endTime: "16:00",
    });
  });

  it("ferme tous les créneaux au site en une fois, y compris un créneau ajouté pendant la suspension, puis les rouvre ensemble", async () => {
    expect(await publicSlots()).toHaveLength(2);

    await expect(
      admin().setBookingsSuspended({ suspended: true })
    ).resolves.toEqual({ success: true, suspended: true, slots: 2 });
    expect(await publicSlots()).toEqual([]);
    // The admin still sees them, each closed.
    expect((await admin().listSlots()).map(slot => slot.isActive)).toEqual([
      0, 0,
    ]);
    // A slot added meanwhile waits for the resumption with the others.
    await admin().addSlot({
      dayOfWeek: 5,
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(await publicSlots()).toEqual([]);
    await expect(
      admin().setBookingsSuspended({ suspended: true })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Les réservations sont déjà suspendues.",
    });

    await expect(
      admin().setBookingsSuspended({ suspended: false })
    ).resolves.toEqual({ success: true, suspended: false, slots: 3 });
    expect(
      (await publicSlots()).map(slot => `${slot.dayOfWeek} ${slot.startTime}`)
    ).toEqual(["1 09:00", "3 14:00", "5 10:00"]);
    await expect(
      admin().setBookingsSuspended({ suspended: false })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Les réservations sont déjà ouvertes.",
    });
    // Open bookings: a new slot is open at once.
    await admin().addSlot({
      dayOfWeek: 6,
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(await publicSlots()).toHaveLength(4);

    const audit = db().rows(securityEvents);
    expect(
      audit.map(event => [
        event.category,
        event.actorKind,
        event.actorReference,
        event.outcome,
        JSON.parse(event.metadata as string),
      ])
    ).toEqual([
      [
        "admin_bookings_suspended",
        "admin",
        "user_owner",
        "allowed",
        { slots: 2 },
      ],
      [
        "admin_bookings_resumed",
        "admin",
        "user_owner",
        "allowed",
        { slots: 3 },
      ],
    ]);
  });

  it("refuse sans créneau configuré, et ne change rien quand la ligne d’audit est refusée (DATA-01)", async () => {
    state.refuseAudit = true;
    await expect(
      admin().setBookingsSuspended({ suspended: true })
    ).rejects.toThrow();
    expect(await publicSlots()).toHaveLength(2);
    expect(db().rows(securityEvents)).toEqual([]);

    state.db = createInMemoryDrizzle();
    await expect(
      admin().setBookingsSuspended({ suspended: true })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db().rows(securityEvents)).toEqual([]);
  });
});

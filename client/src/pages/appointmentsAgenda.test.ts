import { describe, expect, it } from "vitest";
import { agendaDays, buildAppointmentsAgenda } from "./appointmentsAgenda";

describe("agenda des rendez-vous (ADM-18)", () => {
  it("groupe par journée de Paris les rendez-vous lus par le serveur, tous, sans s’arrêter à quatre jours", () => {
    const agenda = buildAppointmentsAgenda([
      // 23:30 in Paris on 19 August, the evening before the next day's first consultation.
      {
        id: 1,
        customerName: "A",
        customerPhone: "+33600000001",
        appointmentDate: "2026-08-19T21:30:00.000Z",
        appointmentStatus: "confirmed",
        trackingId: "A",
      },
      {
        id: 2,
        customerName: "B",
        appointmentDate: "2026-08-20T07:00:00.000Z",
        appointmentStatus: "confirmed",
        trackingId: "B",
      },
      {
        id: 3,
        customerName: "C",
        appointmentDate: "2026-08-21T08:00:00.000Z",
        appointmentStatus: "completed",
        trackingId: "C",
      },
      {
        id: 4,
        customerName: "D",
        appointmentDate: "2026-08-22T08:00:00.000Z",
        appointmentStatus: "no_show",
        trackingId: "D",
      },
      {
        id: 5,
        customerName: "E",
        appointmentDate: "2026-08-23T08:00:00.000Z",
        appointmentStatus: "confirmed",
        trackingId: "E",
      },
      {
        id: 6,
        customerName: "F",
        appointmentDate: "2026-08-24T08:00:00.000Z",
        appointmentStatus: "confirmed",
        trackingId: "F",
      },
    ]);

    expect(agenda.map(day => day.key)).toEqual([
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
    ]);
    expect(agenda[0]).toMatchObject({
      label: "mercredi 19 août",
      items: [
        { customerName: "A", customerPhone: "+33600000001", time: "23:30" },
      ],
    });
    expect(agenda[1]!.items.map(item => item.time)).toEqual(["09:00"]);
  });

  it("calcule les jours de Paris de chaque période, d’un mois ou d’une année sur l’autre", () => {
    expect(agendaDays("today", "2026-10-25")).toEqual({
      from: "2026-10-25",
      to: "2026-10-25",
    });
    expect(agendaDays("week", "2026-10-28")).toEqual({
      from: "2026-10-28",
      to: "2026-11-03",
    });
    expect(agendaDays("month", "2026-12-15")).toEqual({
      from: "2026-12-15",
      to: "2027-01-13",
    });
  });
});

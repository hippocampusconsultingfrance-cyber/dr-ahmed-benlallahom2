import { parisDay } from "@/lib/parisDay";
import { PARIS_TIME_ZONE } from "@shared/parisTime";

export type AppointmentAgendaSource = {
  id: number;
  customerName: string;
  customerPhone?: string;
  appointmentDate: Date | string | number;
  appointmentStatus: string;
  trackingId: string;
};

export type AppointmentAgendaDay = {
  key: string;
  label: string;
  items: Array<AppointmentAgendaSource & { time: string }>;
};

/** The agenda's views (ADM-18): today, the next 7 days or the next 30 days, in Paris calendar days. */
export type AgendaRange = "today" | "week" | "month";

const AGENDA_RANGE_DAYS: Record<AgendaRange, number> = {
  today: 1,
  week: 7,
  month: 30,
};

/** The Paris days (YYYY-MM-DD, both included) the server reads for a view, from today in Paris. */
export function agendaDays(
  range: AgendaRange,
  today = parisDay(new Date())
): { from: string; to: string } {
  const [year, month, day] = today.split("-").map(Number);
  const last = new Date(
    Date.UTC(year, month - 1, day + AGENDA_RANGE_DAYS[range] - 1)
  );
  return { from: today, to: last.toISOString().slice(0, 10) };
}

/**
 * The agenda's consultations, as the server sorts them (by consultation
 * date), grouped by Paris day; every day that has one, none left out.
 */
export function buildAppointmentsAgenda(
  items: AppointmentAgendaSource[]
): AppointmentAgendaDay[] {
  const days = new Map<string, AppointmentAgendaDay>();

  items.forEach(item => {
    const date = new Date(item.appointmentDate);
    const key = parisDay(date);
    const day = days.get(key) ?? {
      key,
      label: date.toLocaleDateString("fr-FR", {
        timeZone: PARIS_TIME_ZONE,
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
      items: [],
    };

    day.items.push({
      ...item,
      time: date.toLocaleTimeString("fr-FR", {
        timeZone: PARIS_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
    days.set(key, day);
  });

  return Array.from(days.values());
}

export type AppointmentAgendaSource = {
  id: number;
  customerName: string;
  appointmentDate: Date | string | number;
  appointmentStatus: string;
  paymentStatus: string;
  trackingId: string;
};

export type AppointmentAgendaDay = {
  key: string;
  label: string;
  items: Array<AppointmentAgendaSource & { time: string }>;
};

function getDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function buildAppointmentsAgenda(items: AppointmentAgendaSource[], now = new Date()): AppointmentAgendaDay[] {
  const days = new Map<string, AppointmentAgendaDay>();

  items
    .filter((item) => item.appointmentStatus !== "cancelled" && new Date(item.appointmentDate).getTime() >= now.getTime())
    .sort((left, right) => new Date(left.appointmentDate).getTime() - new Date(right.appointmentDate).getTime())
    .forEach((item) => {
      const date = new Date(item.appointmentDate);
      const key = getDayKey(date);
      const day = days.get(key) ?? {
        key,
        label: date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short" }),
        items: [],
      };

      day.items.push({
        ...item,
        time: date.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }),
      });
      days.set(key, day);
    });

  return Array.from(days.values()).slice(0, 4);
}

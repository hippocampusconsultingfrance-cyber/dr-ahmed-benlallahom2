export function getExpiredAppointmentUpdate(cancelledAt = new Date()) {
  return {
    appointmentStatus: "cancelled" as const,
    slotKey: null,
    cancelledAt,
  };
}

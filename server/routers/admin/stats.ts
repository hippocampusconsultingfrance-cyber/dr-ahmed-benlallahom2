import { adminProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { contactMessages, gdprRequests, appointments } from "../../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

// Dashboard stats
export const adminStatsProcedure = adminProcedure.query(async () => {
  const db = await getDb();
  if (!db) return { appointments: 0, contacts: 0, gdpr: 0, revenue: 0 };

  const [aptCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(appointments);
  const [contactCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(contactMessages);
  const [gdprCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(gdprRequests);
  const [revenueResult] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(final_price AS DECIMAL(10,2))), 0)` }).from(appointments).where(eq(appointments.paymentStatus, "completed"));

  return {
    appointments: aptCount?.count || 0,
    contacts: contactCount?.count || 0,
    gdpr: gdprCount?.count || 0,
    revenue: revenueResult?.total || 0,
  };
});

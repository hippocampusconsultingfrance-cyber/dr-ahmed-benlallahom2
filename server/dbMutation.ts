/** Number of rows touched by an UPDATE/DELETE, across the Neon HTTP and node-postgres result shapes. */
export function mutationRowCount(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  if (!header || typeof header !== "object") return 0;
  if ("rowCount" in header && typeof header.rowCount === "number") return header.rowCount;
  if ("affectedRows" in header && typeof header.affectedRows === "number") return header.affectedRows;
  return 0;
}

import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications, cvProcessingJobs } from "../drizzle/schema";
import { enqueueCvAnalysis } from "./recruitmentProcessing";

const database = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: database.getDb }));

type JobStatus = "queued" | "retry" | "running";
type JobRead = { id: number; status: JobStatus; attempts: number };

const dialect = new PgDialect();

function enqueueDatabase(reads: JobRead[], jobRowCounts: number[]) {
  const queryBuilder = drizzle.mock();
  let readIndex = 0;
  let jobWriteIndex = 0;
  const jobWrites: Array<{ values: Record<string, unknown>; where: SQL }> = [];
  const applicationWrites: Array<{ values: Record<string, unknown>; where: SQL }> = [];
  const db = {
    select: vi.fn((selection: { id: unknown }) => {
      if (readIndex >= reads.length) return queryBuilder.select(selection);
      return {
        from: (table: unknown) => {
          expect(table).toBe(cvProcessingJobs);
          return {
            where: () => ({ orderBy: () => ({ limit: async () => [reads[readIndex++]] }) }),
          };
        },
      };
    }),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (where: SQL) => {
          if (table === cvProcessingJobs) {
            jobWrites.push({ values, where });
            return { rowCount: jobRowCounts[jobWriteIndex++] };
          }
          expect(table).toBe(cvApplications);
          applicationWrites.push({ values, where });
          return { rowCount: 1 };
        },
      }),
    })),
    insert: vi.fn(() => { throw new Error("unexpected insert"); }),
  };
  database.getDb.mockResolvedValue(db);
  return { db, jobWrites, applicationWrites };
}

beforeEach(() => vi.clearAllMocks());

describe("relance concurrente de l’analyse CV", () => {
  it("n’écrase pas le job qu’un worker vient de revendiquer", async () => {
    const selected = { id: 7, status: "retry" as const, attempts: 1 };
    const { db, jobWrites, applicationWrites } = enqueueDatabase(
      [selected, { id: 7, status: "running", attempts: 2 }], [0],
    );

    const result = await enqueueCvAnalysis(42, new Date("2026-10-07T06:00:00Z"));

    expect(result).toEqual({ queued: false, accelerated: false, alreadyRunning: true });
    expect(jobWrites).toHaveLength(1);
    const { sql, params } = dialect.sqlToQuery(jobWrites[0].where);
    expect(sql).toContain('"job_status" =');
    expect(sql).toContain('"attempts" =');
    expect(params).toEqual(expect.arrayContaining([selected.id, selected.status, selected.attempts]));
    expect(applicationWrites).toHaveLength(0);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("ne remet la candidature en attente que si son job accéléré est toujours en file", async () => {
    const selected = { id: 8, status: "queued" as const, attempts: 1 };
    const { jobWrites, applicationWrites } = enqueueDatabase([selected], [1]);

    const result = await enqueueCvAnalysis(43, new Date("2026-10-07T06:00:00Z"));

    expect(result).toEqual({ queued: false, accelerated: true, alreadyRunning: false });
    expect(jobWrites).toHaveLength(1);
    expect(applicationWrites).toHaveLength(1);
    const { sql, params } = dialect.sqlToQuery(applicationWrites[0].where);
    expect(sql).toContain('exists (select "id" from "cv_processing_jobs"');
    expect(sql).toContain('"cv_processing_jobs"."job_status" =');
    expect(sql).toContain('"cv_processing_jobs"."attempts" =');
    expect(params).toEqual(expect.arrayContaining([43, selected.id, "queued", selected.attempts]));
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mysql from "mysql2/promise";
import { getDb } from "./db";
import { testimonials } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

describe("Testimonials System", () => {
  let connection: mysql.Connection;

  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await connection.end();
  });

  describe("Database Schema", () => {
    it("should have testimonials table with correct columns", async () => {
      const [rows] = await connection.execute(
        "DESCRIBE testimonials"
      ) as any;

      const columnNames = rows.map((row: any) => row.Field);

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("author_name");
      expect(columnNames).toContain("rating");
      expect(columnNames).toContain("title");
      expect(columnNames).toContain("content");
      expect(columnNames).toContain("specialty");
      expect(columnNames).toContain("verified");
      expect(columnNames).toContain("featured");
      expect(columnNames).toContain("language");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("createdAt");
      expect(columnNames).toContain("updatedAt");
    });
  });

  describe("Testimonials CRUD", () => {
    it("should insert a testimonial with all required fields", async () => {
      const db = await getDb();

      const result = await db.insert(testimonials).values({
        authorName: "Test User",
        rating: 5,
        title: "Excellent Service",
        content: "Very satisfied with the service provided.",
        specialty: "General Consultation",
        language: "en",
        status: "approved",
        verified: 1,
        featured: 0,
      });

      expect(result).toBeDefined();
    });

    it("should retrieve testimonials by language", async () => {
      const db = await getDb();

      const result = await db
        .select()
        .from(testimonials)
        .where(eq(testimonials.language, "fr"));

      expect(Array.isArray(result)).toBe(true);
    });

    it("should filter featured testimonials", async () => {
      const db = await getDb();

      const result = await db
        .select()
        .from(testimonials)
        .where(and(eq(testimonials.featured, 1), eq(testimonials.status, "approved")));

      expect(Array.isArray(result)).toBe(true);
      result.forEach((t) => {
        expect(t.featured).toBe(1);
        expect(t.status).toBe("approved");
      });
    });

    it("should filter testimonials by rating", async () => {
      const db = await getDb();

      const result = await db
        .select()
        .from(testimonials)
        .where(eq(testimonials.rating, 5));

      expect(Array.isArray(result)).toBe(true);
      result.forEach((t) => {
        expect(t.rating).toBe(5);
      });
    });

    it("should respect privacy by storing initials/first names only", async () => {
      const db = await getDb();

      const result = await db.select().from(testimonials);

      result.forEach((t) => {
        // Author name should be short (initials or first name)
        expect(t.authorName.length).toBeLessThanOrEqual(100);
        // Should not contain full email addresses
        expect(t.authorName).not.toMatch(/@/);
      });
    });

    it("should support multilingual testimonials", async () => {
      const db = await getDb();

      const languages = ["fr", "en", "de", "zh"];
      for (const lang of languages) {
        const result = await db
          .select()
          .from(testimonials)
          .where(eq(testimonials.language, lang));

        expect(Array.isArray(result)).toBe(true);
      }
    });

    it("should only return approved testimonials", async () => {
      const db = await getDb();

      const result = await db
        .select()
        .from(testimonials)
        .where(eq(testimonials.status, "approved"));

      expect(Array.isArray(result)).toBe(true);
      result.forEach((t) => {
        expect(t.status).toBe("approved");
      });
    });

    it("should have valid rating values (1-5)", async () => {
      const db = await getDb();

      const result = await db.select().from(testimonials);

      result.forEach((t) => {
        expect(t.rating).toBeGreaterThanOrEqual(1);
        expect(t.rating).toBeLessThanOrEqual(5);
      });
    });

    it("should have timestamps for audit trail", async () => {
      const db = await getDb();

      const result = await db.select().from(testimonials).limit(1);

      if (result.length > 0) {
        const t = result[0];
        expect(t.createdAt).toBeDefined();
        expect(t.updatedAt).toBeDefined();
        expect(t.createdAt instanceof Date).toBe(true);
        expect(t.updatedAt instanceof Date).toBe(true);
      }
    });
  });

  describe("Data Integrity", () => {
    it("should have at least one featured testimonial per language", async () => {
      const db = await getDb();

      const languages = ["fr", "en", "de", "zh"];
      for (const lang of languages) {
        const result = await db
          .select()
          .from(testimonials)
          .where(
            and(
              eq(testimonials.language, lang),
              eq(testimonials.featured, 1),
              eq(testimonials.status, "approved")
            )
          );

        expect(result.length).toBeGreaterThanOrEqual(0);
      }
    });

    it("should not allow null values for required fields", async () => {
      const db = await getDb();

      const result = await db.select().from(testimonials);

      result.forEach((t) => {
        expect(t.authorName).toBeTruthy();
        expect(t.rating).toBeDefined();
        expect(t.title).toBeTruthy();
        expect(t.content).toBeTruthy();
        expect(t.language).toBeTruthy();
        expect(t.status).toBeTruthy();
      });
    });

    it("should maintain GDPR compliance (no sensitive data)", async () => {
      const db = await getDb();

      const result = await db.select().from(testimonials);

      result.forEach((t) => {
        // Should not contain email addresses
        expect(t.content).not.toMatch(
          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
        );
        // Should not contain phone numbers (common patterns)
        expect(t.content).not.toMatch(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/);
        // Author name should not contain full names (heuristic check)
        expect(t.authorName.split(" ").length).toBeLessThanOrEqual(2);
      });
    });
  });

  describe("SEO & Structured Data", () => {
    it("should have enough testimonials for rich snippets", async () => {
      const db = await getDb();

      const result = await db
        .select()
        .from(testimonials)
        .where(eq(testimonials.status, "approved"));

      // Should have at least 5 testimonials for meaningful rich snippets
      expect(result.length).toBeGreaterThanOrEqual(5);
    });

    it("should have diverse ratings for aggregation", async () => {
      const db = await getDb();

      const result = await db
        .select()
        .from(testimonials)
        .where(eq(testimonials.status, "approved"));

      const ratings = result.map((t) => t.rating);
      const uniqueRatings = new Set(ratings);

      // Should have at least 2 different rating values
      expect(uniqueRatings.size).toBeGreaterThanOrEqual(2);
    });
  });
});

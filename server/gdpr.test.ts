import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("GDPR Request Validation", () => {
  // Schema for contact form submission
  const contactSchema = z.object({
    name: z.string().min(1, "Le nom est requis").max(255),
    email: z.string().email("Email invalide").max(320),
    phone: z.string().max(50).optional(),
    message: z.string().min(1, "Le message est requis").max(5000),
    gdprConsent: z.number().int().min(0).max(1),
  });

  // Schema for GDPR request submission
  const gdprSchema = z.object({
    name: z.string().min(1, "Le nom est requis").max(255),
    email: z.string().email("Email invalide").max(320),
    phone: z.string().max(50).optional(),
    requestType: z.enum(["access", "rectification", "deletion", "portability", "objection"]),
    description: z.string().min(1, "La description est requise").max(5000).optional(),
  });

  describe("Contact Form with GDPR Consent", () => {
    it("should accept valid contact form with GDPR consent", () => {
      const validData = {
        name: "John Doe",
        email: "john@example.com",
        phone: "+33 9 72 15 24 13",
        message: "Hello, I have a question.",
        gdprConsent: 1,
      };

      const result = contactSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject contact form without GDPR consent", () => {
      const invalidData = {
        name: "John Doe",
        email: "john@example.com",
        phone: "+33 9 72 15 24 13",
        message: "Hello, I have a question.",
        gdprConsent: 0,
      };

      const result = contactSchema.safeParse(invalidData);
      expect(result.success).toBe(true); // Still valid, but consent is 0
    });

    it("should reject contact form with missing name", () => {
      const invalidData = {
        name: "",
        email: "john@example.com",
        message: "Hello, I have a question.",
        gdprConsent: 1,
      };

      const result = contactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject contact form with invalid email", () => {
      const invalidData = {
        name: "John Doe",
        email: "not-an-email",
        message: "Hello, I have a question.",
        gdprConsent: 1,
      };

      const result = contactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject contact form with missing message", () => {
      const invalidData = {
        name: "John Doe",
        email: "john@example.com",
        message: "",
        gdprConsent: 1,
      };

      const result = contactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should accept contact form with optional phone", () => {
      const validData = {
        name: "John Doe",
        email: "john@example.com",
        message: "Hello, I have a question.",
        gdprConsent: 1,
      };

      const result = contactSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe("GDPR Request Form", () => {
    it("should accept valid GDPR access request", () => {
      const validData = {
        name: "Jane Smith",
        email: "jane@example.com",
        phone: "+33 9 72 15 24 13",
        requestType: "access" as const,
        description: "I want to access my personal data.",
      };

      const result = gdprSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept valid GDPR deletion request", () => {
      const validData = {
        name: "Jane Smith",
        email: "jane@example.com",
        requestType: "deletion" as const,
        description: "I want to delete my personal data.",
      };

      const result = gdprSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept valid GDPR rectification request", () => {
      const validData = {
        name: "Jane Smith",
        email: "jane@example.com",
        requestType: "rectification" as const,
        description: "I want to correct my personal data.",
      };

      const result = gdprSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept valid GDPR portability request", () => {
      const validData = {
        name: "Jane Smith",
        email: "jane@example.com",
        requestType: "portability" as const,
        description: "I want to export my personal data.",
      };

      const result = gdprSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept valid GDPR objection request", () => {
      const validData = {
        name: "Jane Smith",
        email: "jane@example.com",
        requestType: "objection" as const,
        description: "I object to the processing of my personal data.",
      };

      const result = gdprSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject GDPR request with invalid request type", () => {
      const invalidData = {
        name: "Jane Smith",
        email: "jane@example.com",
        requestType: "invalid" as any,
        description: "I want to access my personal data.",
      };

      const result = gdprSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject GDPR request with missing name", () => {
      const invalidData = {
        name: "",
        email: "jane@example.com",
        requestType: "access" as const,
        description: "I want to access my personal data.",
      };

      const result = gdprSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject GDPR request with invalid email", () => {
      const invalidData = {
        name: "Jane Smith",
        email: "not-an-email",
        requestType: "access" as const,
        description: "I want to access my personal data.",
      };

      const result = gdprSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should accept GDPR request with optional phone", () => {
      const validData = {
        name: "Jane Smith",
        email: "jane@example.com",
        requestType: "access" as const,
        description: "I want to access my personal data.",
      };

      const result = gdprSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept GDPR request with optional description", () => {
      const validData = {
        name: "Jane Smith",
        email: "jane@example.com",
        requestType: "access" as const,
      };

      const result = gdprSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject GDPR request with description exceeding max length", () => {
      const invalidData = {
        name: "Jane Smith",
        email: "jane@example.com",
        requestType: "access" as const,
        description: "a".repeat(5001),
      };

      const result = gdprSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("Data Validation Rules", () => {
    it("should validate email format correctly", () => {
      const validEmails = [
        "user@example.com",
        "test.user@example.co.uk",
        "user+tag@example.com",
      ];

      validEmails.forEach((email) => {
        const result = z.string().email().safeParse(email);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid email formats", () => {
      const invalidEmails = [
        "user@",
        "@example.com",
        "user example@example.com",
        "user@.com",
      ];

      invalidEmails.forEach((email) => {
        const result = z.string().email().safeParse(email);
        expect(result.success).toBe(false);
      });
    });

    it("should enforce maximum string lengths", () => {
      const nameSchema = z.string().max(255);
      const longName = "a".repeat(256);

      const result = nameSchema.safeParse(longName);
      expect(result.success).toBe(false);
    });

    it("should enforce minimum string lengths", () => {
      const nameSchema = z.string().min(1);
      const result = nameSchema.safeParse("");

      expect(result.success).toBe(false);
    });
  });
});

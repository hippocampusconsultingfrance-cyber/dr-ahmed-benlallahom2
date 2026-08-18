import { describe, expect, it } from "vitest";
import { hashSecurityValue, requestIpHash } from "./candidateSecurity";

describe("candidate security primitives", () => {
  it("hashes security identifiers deterministically without retaining the raw value", () => {
    const value = "203.0.113.24";
    const hash = hashSecurityValue(value);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(value);
    expect(hashSecurityValue(value)).toBe(hash);
  });

  it("uses the first forwarded address and never exposes it", () => {
    const hash = requestIpHash({ "x-forwarded-for": "203.0.113.24, 198.51.100.8" });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("203.0.113.24");
  });
});

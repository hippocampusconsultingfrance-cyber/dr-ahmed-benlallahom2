import { describe, expect, it } from "vitest";
import { getTestimonialsCarouselIndex } from "./TestimonialsSection";

describe("testimonial carousel keyboard navigation", () => {
  it("cycles through testimonials with the arrow keys", () => {
    expect(getTestimonialsCarouselIndex({ key: "ArrowLeft", currentIndex: 0, length: 4 })).toBe(3);
    expect(getTestimonialsCarouselIndex({ key: "ArrowRight", currentIndex: 3, length: 4 })).toBe(0);
  });

  it("reaches the first and last testimonials with Home and End", () => {
    expect(getTestimonialsCarouselIndex({ key: "Home", currentIndex: 2, length: 4 })).toBe(0);
    expect(getTestimonialsCarouselIndex({ key: "End", currentIndex: 0, length: 4 })).toBe(3);
  });

  it("keeps a one-item carousel stable", () => {
    expect(getTestimonialsCarouselIndex({ key: "ArrowRight", currentIndex: 0, length: 1 })).toBe(0);
  });
});

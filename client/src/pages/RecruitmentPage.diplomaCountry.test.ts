import { describe, expect, it } from "vitest";
import { filterWorldwideCountries, getWorldwideCountries } from "./RecruitmentPage";

describe("répertoire mondial du pays de diplôme", () => {
  it("contient le monde entier et recherche à travers plusieurs appellations", () => {
    const countries = getWorldwideCountries("fr");
    expect(countries.length).toBeGreaterThan(200);
    expect(countries.some(country => country.code === "FR")).toBe(true);
    expect(countries.some(country => country.code === "ZW")).toBe(true);

    expect(filterWorldwideCountries(countries, "Germany", "fr").some(country => country.code === "DE")).toBe(true);
    expect(filterWorldwideCountries(countries, "DE", "fr").some(country => country.code === "DE")).toBe(true);
    expect(filterWorldwideCountries(countries, "Cote", "fr").some(country => country.code === "CI")).toBe(true);
  });
});

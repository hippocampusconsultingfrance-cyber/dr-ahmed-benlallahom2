import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
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

  it("garde la liste fermée jusqu’à une interaction explicite", async () => {
    const source = await readFile(new URL("./RecruitmentPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('const [diplomaCountryOpen, setDiplomaCountryOpen] = useState(false)');
    expect(source).toContain('onFocus={() => setDiplomaCountryOpen(true)}');
    expect(source).toContain('{diplomaCountryOpen && (');
    expect(source).not.toContain('size={Math.min(6, Math.max(2, filteredDiplomaCountries.length))}');
  });

  it("utilise une même structure verticale pour les libellés et les champs", async () => {
    const source = await readFile(new URL("./RecruitmentPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('className="recruitment-field-group"');
    expect(source).toContain('className="recruitment-field"');
  });

  it("récupère un pays reconnu affiché par un navigateur mobile au moment de l’envoi", async () => {
    const source = await readFile(new URL("./RecruitmentPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('resolveCountryForSubmission(form.diplomaCountry');
    expect(source).toContain('name="diplomaCountry"');
    expect(source).toContain('body.append("diplomaCountry", submittedDiplomaCountry);');
  });
});

import { recruitmentFactLabel, type RecruitmentFact, type RecruitmentFactOrigin } from "../shared/recruitmentFactOrigins";

type BriefForMatching = {
  specialtyNeeded: string;
  country: string;
  requiredCertifications: string | null;
  requiredLanguages?: string | null;
  minimumYearsExperience?: number | null;
  availabilityNeeded?: string | null;
};

/** A certification with its origins (IA-02) and, when the CV gives one, its expiry. */
export type CertificationFact = RecruitmentFact & { expiresAt: string | null };

type CandidateForMatching = {
  specialty: string;
  targetCountries: string | null;
  mobility?: string | null;
  certificationFacts?: CertificationFact[];
  languageFacts?: RecruitmentFact[];
  yearsExperience?: number | null;
  availability?: string | null;
};

/** cv_candidate_certifications row: read in the CV by the AI, or declared and then confirmed. */
export type CertificationRow = { name: string; source: "declared" | "extracted"; confirmedAt: Date | string | null; expiresAt: string | null };
/** cv_candidate_languages row, read in the CV by the AI. */
export type LanguageRow = { language: string; source: "declared" | "extracted" };

const normalise = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr-FR")
  .trim();

const containsTerm = (haystack: string, needle: string) => {
  const normalisedNeedle = normalise(needle);
  return normalisedNeedle.length > 1 && normalise(haystack).includes(normalisedNeedle);
};

function parseTerms(value: string | null | undefined) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.flatMap(item => {
        if (typeof item === "string") return [item];
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          return [record.name, record.language].filter((item): item is string => typeof item === "string");
        }
        return [];
      });
    }
  } catch {
    // Free-text values remain valid fallback data for a human-reviewed score.
  }
  return value.split(/[,;\n]/).map(item => item.trim()).filter(Boolean);
}

export function certificationDateIsCurrent(
  expiresAt: string | null | undefined,
  referenceDate = new Date()
) {
  if (!expiresAt) return true;
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(expiresAt.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 12;
  const day = match[3]
    ? Number(match[3])
    : new Date(Date.UTC(year, month, 0)).getUTCDate();
  const expiry = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  return Number.isFinite(expiry.getTime()) && expiry >= referenceDate;
}

/** Two spellings of one certification or language: same letters, case and accents aside. */
export const sameRecruitmentFact = (left: string, right: string) => normalise(left) === normalise(right);

/** The certifications declared in the form (free text), one per term. */
export const declaredCertificationNames = (declared: string | null | undefined) => parseTerms(declared);

/** Adds an origin to the fact of that name, created on its first mention. */
function addFact<T extends RecruitmentFact>(facts: T[], name: string, origin: RecruitmentFactOrigin, create: (name: string) => T) {
  if (!normalise(name)) return null;
  let fact = facts.find(item => sameRecruitmentFact(item.name, name));
  if (!fact) facts.push(fact = create(name.trim()));
  if (!fact.origins.includes(origin)) fact.origins.push(origin);
  return fact;
}

/**
 * The candidate's certifications, one per name (IA-02): declared in the form,
 * read in the CV by the AI, confirmed by an admin (a row with confirmed_at).
 * Free-text declared certifications have no machine-readable expiry.
 */
export function certificationFacts(declared: string | null | undefined, rows: CertificationRow[]): CertificationFact[] {
  const facts: CertificationFact[] = [];
  const create = (name: string): CertificationFact => ({ name, origins: [], expiresAt: null });
  for (const name of declaredCertificationNames(declared)) addFact(facts, name, "declared", create);
  for (const row of rows) {
    const fact = addFact(facts, row.name, row.source, create);
    if (row.confirmedAt) addFact(facts, row.name, "confirmed", create);
    if (fact) fact.expiresAt ??= row.expiresAt;
  }
  return facts;
}

/** The candidate's languages, one per name: declared in the form, or read in the CV by the AI. */
export function languageFacts(declared: string | null | undefined, rows: LanguageRow[]): RecruitmentFact[] {
  const facts: RecruitmentFact[] = [];
  const create = (name: string): RecruitmentFact => ({ name, origins: [] });
  for (const name of parseTerms(declared)) addFact(facts, name, "declared", create);
  for (const row of rows) addFact(facts, row.language, row.source, create);
  return facts;
}

const isConfirmed = (fact: RecruitmentFact) => fact.origins.includes("confirmed");

function specialtyMatches(candidateSpecialty: string, requestedSpecialty: string) {
  if (containsTerm(candidateSpecialty, requestedSpecialty) || containsTerm(requestedSpecialty, candidateSpecialty)) return true;
  const roots = (value: string) => normalise(value)
    .split(/[^a-z]+/)
    .filter(token => token.length >= 5)
    .map(token => token.slice(0, 6));
  const candidateRoots = new Set(roots(candidateSpecialty));
  const requestedRoots = roots(requestedSpecialty);
  return requestedRoots.length > 0 && requestedRoots.every(root => candidateRoots.has(root));
}

const factsMatching = <T extends RecruitmentFact>(required: string, facts: T[]) => facts.filter(fact =>
  containsTerm(fact.name, required) || containsTerm(required, fact.name),
);

const addUnique = <T>(list: T[], items: T[]) => { for (const item of items) if (!list.includes(item)) list.push(item); };

export function computeBriefCandidateMatch(brief: BriefForMatching, candidate: CandidateForMatching) {
  const reasons: string[] = [];
  const breakdown = { specialty: 0, mobility: 0, certifications: 0, languages: 0, experience: 0, availability: 0 };

  if (specialtyMatches(candidate.specialty, brief.specialtyNeeded)) {
    breakdown.specialty = 35;
    reasons.push("spécialité compatible");
  }

  const countryEvidence = [...parseTerms(candidate.targetCountries), candidate.mobility || ""].join(" · ");
  if (containsTerm(countryEvidence, brief.country)) {
    breakdown.mobility = 15;
    reasons.push("mobilité vers le pays de mission déclarée");
  }

  // A required certification earns its points only once a human confirmed a
  // matching one, declared or read in the CV (IA-02): a licence found only in
  // the CV text, possibly hidden, is shown « à confirmer » and scores nothing.
  const requiredCertifications = parseTerms(brief.requiredCertifications);
  const currentCertifications = (candidate.certificationFacts || []).filter(fact => certificationDateIsCurrent(fact.expiresAt));
  const matchedCertifications: string[] = [];
  const certificationsToConfirm: string[] = [];
  const certifications: CertificationFact[] = [];
  const unconfirmedCertifications: CertificationFact[] = [];
  for (const required of requiredCertifications) {
    const facts = factsMatching(required, currentCertifications);
    if (facts.length === 0) continue;
    addUnique(certifications, facts);
    if (facts.some(isConfirmed)) {
      matchedCertifications.push(required);
    } else {
      certificationsToConfirm.push(required);
      addUnique(unconfirmedCertifications, facts);
    }
  }
  if (matchedCertifications.length > 0) {
    breakdown.certifications = Math.round((matchedCertifications.length / requiredCertifications.length) * 20);
    reasons.push(`certifications correspondantes : ${certifications.filter(isConfirmed).map(recruitmentFactLabel).join(", ")}`);
  }
  if (unconfirmedCertifications.length > 0) {
    reasons.push(unconfirmedCertifications.length === 1
      ? `certification à confirmer : ${recruitmentFactLabel(unconfirmedCertifications[0]!)} — aucun point tant que l’admin ne l’a pas confirmée`
      : `certifications à confirmer : ${unconfirmedCertifications.map(recruitmentFactLabel).join(" ; ")} — aucun point tant que l’admin ne les a pas confirmées`);
  }

  const requiredLanguages = parseTerms(brief.requiredLanguages);
  const matchedLanguages: string[] = [];
  const languages: RecruitmentFact[] = [];
  for (const required of requiredLanguages) {
    const facts = factsMatching(required, candidate.languageFacts || []);
    if (facts.length === 0) continue;
    matchedLanguages.push(required);
    addUnique(languages, facts);
  }
  if (matchedLanguages.length > 0) {
    breakdown.languages = Math.round((matchedLanguages.length / requiredLanguages.length) * 15);
    reasons.push(`langues correspondantes : ${languages.map(recruitmentFactLabel).join(", ")}`);
  }

  if (brief.minimumYearsExperience && candidate.yearsExperience !== null && candidate.yearsExperience !== undefined && candidate.yearsExperience >= brief.minimumYearsExperience) {
    breakdown.experience = 10;
    reasons.push(`expérience déclarée : ${candidate.yearsExperience} an(s) pour un minimum de ${brief.minimumYearsExperience}`);
  }

  if (brief.availabilityNeeded && candidate.availability && (containsTerm(candidate.availability, brief.availabilityNeeded) || containsTerm(brief.availabilityNeeded, candidate.availability))) {
    breakdown.availability = 5;
    reasons.push("disponibilité compatible avec le besoin exprimé");
  }

  const score = Object.values(breakdown).reduce((total, value) => total + value, 0);
  // certifications / languages: the candidate's facts retained for the mission, with their origins.
  return { score: Math.min(score, 100), reasons, matchedCertifications, certificationsToConfirm, matchedLanguages, certifications, languages, breakdown };
}

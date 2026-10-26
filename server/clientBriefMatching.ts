import { certificationDateIsCurrent, certificationExpiry, type RecruitmentFact, type RecruitmentFactOrigin } from "../shared/recruitmentFactOrigins";

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

/**
 * Why a certification retained for a mission scores or not (IA-02): confirmed
 * by an admin, waiting for one, or expired (its renewal to confirm).
 */
export type BriefCertificationStatus = "matched" | "to_confirm" | "expired";
export type BriefCertification = CertificationFact & { status: BriefCertificationStatus };

/**
 * A criterion other than certifications and languages the candidate meets, as
 * a code the mission screen words in the admin's language.
 */
export type BriefMatchReason =
  | { criterion: "specialty" | "mobility" | "availability" }
  | { criterion: "experience"; years: number; minimum: number };

type CandidateForMatching = {
  specialty: string;
  targetCountries: string | null;
  mobility?: string | null;
  certificationFacts?: CertificationFact[];
  languageFacts?: RecruitmentFact[];
  yearsExperience?: number | null;
  availability?: string | null;
};

/**
 * cv_candidate_certifications row: read in the CV by the AI, declared and then
 * confirmed, a renewal an admin confirmed, with its new expiry, or the expiry
 * the CV gives a declared certification when its analysis retained no facts
 * (IA-02).
 */
export type CertificationRow = { name: string; source: "declared" | "extracted" | "renewed" | "cv_expiry"; confirmedAt: Date | string | null; expiresAt: string | null };
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

/**
 * The latest of these expiries: none (current) when one of them has no date,
 * an unreadable one counting as expired.
 */
export function latestCertificationExpiry(expiries: Array<string | null>) {
  if (expiries.some(expiresAt => !expiresAt)) return null;
  const time = (expiresAt: string) => certificationExpiry(expiresAt)?.getTime() ?? -Infinity;
  return (expiries as string[]).reduce((latest, expiresAt) => time(expiresAt) > time(latest) ? expiresAt : latest);
}

/** Length of a cv_candidate_certifications name: a longer declared term is stored cut to it. */
export const CERTIFICATION_NAME_MAX_LENGTH = 180;

/**
 * Two spellings of one certification or language: same letters, case and
 * accents aside, within the characters a stored row keeps.
 */
export const sameRecruitmentFact = (left: string, right: string) =>
  normalise(left.trim().slice(0, CERTIFICATION_NAME_MAX_LENGTH)) === normalise(right.trim().slice(0, CERTIFICATION_NAME_MAX_LENGTH));

/** The certifications declared in the form (free text), one per term. */
export const declaredCertificationNames = (declared: string | null | undefined) => parseTerms(declared);

/** The certifications an analysis retained among its facts (normalized_certifications), by name. */
export const analysedCertificationNames = (normalized: string | null | undefined) => parseTerms(normalized);

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
 * Free-text declared certifications have no machine-readable expiry. A
 * renewal row adds no origin but the admin's confirmation. An expiry the CV
 * gives while its analysis retained no facts adds none either, nor a
 * certification: it only dates one known otherwise.
 */
export function certificationFacts(declared: string | null | undefined, rows: CertificationRow[]): CertificationFact[] {
  const facts: CertificationFact[] = [];
  const create = (name: string): CertificationFact => ({ name, origins: [], expiresAt: null });
  for (const name of declaredCertificationNames(declared)) addFact(facts, name, "declared", create);
  const rowsByFact = new Map<CertificationFact, CertificationRow[]>();
  for (const row of rows) {
    if (row.source === "cv_expiry") continue;
    const fact = addFact(facts, row.name, row.source === "renewed" ? "confirmed" : row.source, create);
    if (!fact) continue;
    if (row.confirmedAt) addFact(facts, row.name, "confirmed", create);
    rowsByFact.set(fact, [...(rowsByFact.get(fact) ?? []), row]);
  }
  for (const row of rows) {
    const fact = row.source === "cv_expiry" ? facts.find(item => sameRecruitmentFact(item.name, row.name)) : undefined;
    if (fact) rowsByFact.set(fact, [...(rowsByFact.get(fact) ?? []), row]);
  }
  // A certification renewed in the CV has a row per date: it is current while
  // its latest one is. Once one is confirmed, only the confirmed rows count,
  // since only a confirmation earns points: a renewal the admin confirmed
  // among them, whose date (or none) prevails over the expired one of the CV.
  // A declared certification's confirmation has no date: it does not make
  // current one the CV says has expired, only a renewal does.
  rowsByFact.forEach((factRows, fact) => {
    const datedRows = factRows.filter(row => row.source !== "declared");
    if (!datedRows.length) return;
    const confirmedRows = datedRows.filter(row => row.confirmedAt);
    fact.expiresAt = latestCertificationExpiry((confirmedRows.length ? confirmedRows : datedRows).map(row => row.expiresAt));
  });
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
  const reasons: BriefMatchReason[] = [];
  const breakdown = { specialty: 0, mobility: 0, certifications: 0, languages: 0, experience: 0, availability: 0 };

  if (specialtyMatches(candidate.specialty, brief.specialtyNeeded)) {
    breakdown.specialty = 35;
    reasons.push({ criterion: "specialty" });
  }

  const countryEvidence = [...parseTerms(candidate.targetCountries), candidate.mobility || ""].join(" · ");
  if (containsTerm(countryEvidence, brief.country)) {
    breakdown.mobility = 15;
    reasons.push({ criterion: "mobility" });
  }

  // A required certification earns its points only once a human confirmed a
  // matching one, declared or read in the CV (IA-02): a licence found only in
  // the CV text, possibly hidden, is retained « à confirmer » and scores
  // nothing. One that has expired, confirmed or not, scores nothing either
  // and is retained « expirée » with its date, until an admin confirms its
  // renewal.
  const requiredCertifications = parseTerms(brief.requiredCertifications);
  const matchedCertifications: string[] = [];
  const certificationsToConfirm: string[] = [];
  const certifications: BriefCertification[] = [];
  const retain = (facts: CertificationFact[], status: BriefCertificationStatus) => {
    for (const fact of facts) if (!certifications.some(item => item.name === fact.name)) certifications.push({ ...fact, status });
  };
  for (const required of requiredCertifications) {
    const facts = factsMatching(required, candidate.certificationFacts || []);
    const current = facts.filter(fact => certificationDateIsCurrent(fact.expiresAt));
    if (current.some(isConfirmed)) {
      matchedCertifications.push(required);
      retain(current.filter(isConfirmed), "matched");
    } else if (current.length > 0) {
      certificationsToConfirm.push(required);
      retain(current, "to_confirm");
    }
    // An expired one stays said next to a current one of another name
    // (« ACLS AHA » declared, « ACLS » read in the CV until 2023): the admin
    // sees what the CV says before confirming, or after.
    retain(facts.filter(fact => !current.includes(fact)), "expired");
  }
  if (matchedCertifications.length > 0) {
    breakdown.certifications = Math.round((matchedCertifications.length / requiredCertifications.length) * 20);
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
  }

  if (brief.minimumYearsExperience && candidate.yearsExperience !== null && candidate.yearsExperience !== undefined && candidate.yearsExperience >= brief.minimumYearsExperience) {
    breakdown.experience = 10;
    reasons.push({ criterion: "experience", years: candidate.yearsExperience, minimum: brief.minimumYearsExperience });
  }

  if (brief.availabilityNeeded && candidate.availability && (containsTerm(candidate.availability, brief.availabilityNeeded) || containsTerm(brief.availabilityNeeded, candidate.availability))) {
    breakdown.availability = 5;
    reasons.push({ criterion: "availability" });
  }

  const score = Object.values(breakdown).reduce((total, value) => total + value, 0);
  // reasons: the other criteria met. certifications / languages: the
  // candidate's facts retained for the mission, with their origins (and, for
  // a certification, its status and expiry). All as codes the mission screen
  // words in the admin's language (IA-02).
  return { score: Math.min(score, 100), reasons, matchedCertifications, certificationsToConfirm, matchedLanguages, certifications, languages, breakdown };
}

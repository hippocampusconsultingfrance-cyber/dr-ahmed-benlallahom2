type BriefForMatching = {
  specialtyNeeded: string;
  country: string;
  requiredCertifications: string | null;
  requiredLanguages?: string | null;
  minimumYearsExperience?: number | null;
  availabilityNeeded?: string | null;
};

type CandidateForMatching = {
  specialty: string;
  targetCountries: string | null;
  mobility?: string | null;
  certifications: string | null;
  normalizedCertifications: string | null;
  certificationNames?: string[];
  languages?: string | null;
  normalizedLanguages?: string | null;
  languageNames?: string[];
  yearsExperience?: number | null;
  availability?: string | null;
};

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

const matchesAny = (required: string[], available: string[]) => required.filter(requiredName =>
  available.some(candidateName => containsTerm(candidateName, requiredName) || containsTerm(requiredName, candidateName)),
);

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

  const requiredCertifications = parseTerms(brief.requiredCertifications);
  const availableCertifications = [
    ...(candidate.certificationNames || []),
    ...parseTerms(candidate.normalizedCertifications),
    ...parseTerms(candidate.certifications),
  ];
  const matchedCertifications = matchesAny(requiredCertifications, availableCertifications);
  if (requiredCertifications.length > 0 && matchedCertifications.length > 0) {
    breakdown.certifications = Math.round((matchedCertifications.length / requiredCertifications.length) * 20);
    reasons.push(`certifications correspondantes : ${matchedCertifications.join(", ")}`);
  }

  const requiredLanguages = parseTerms(brief.requiredLanguages);
  const availableLanguages = [
    ...(candidate.languageNames || []),
    ...parseTerms(candidate.normalizedLanguages),
    ...parseTerms(candidate.languages),
  ];
  const matchedLanguages = matchesAny(requiredLanguages, availableLanguages);
  if (requiredLanguages.length > 0 && matchedLanguages.length > 0) {
    breakdown.languages = Math.round((matchedLanguages.length / requiredLanguages.length) * 15);
    reasons.push(`langues correspondantes : ${matchedLanguages.join(", ")}`);
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
  return { score: Math.min(score, 100), reasons, matchedCertifications, matchedLanguages, breakdown };
}

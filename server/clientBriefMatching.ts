type BriefForMatching = {
  specialtyNeeded: string;
  country: string;
  requiredCertifications: string | null;
};

type CandidateForMatching = {
  specialty: string;
  targetCountries: string | null;
  certifications: string | null;
  normalizedCertifications: string | null;
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

function certificationNames(value: string | null) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.flatMap(item => typeof item === "string" ? [item] : item && typeof item === "object" && "name" in item && typeof item.name === "string" ? [item.name] : []);
    }
  } catch {
    // Fall back to the candidate's declared free-text values.
  }
  return value.split(/[,;\n]/).map(value => value.trim()).filter(Boolean);
}

export function computeBriefCandidateMatch(brief: BriefForMatching, candidate: CandidateForMatching) {
  const reasons: string[] = [];
  let score = 0;
  if (specialtyMatches(candidate.specialty, brief.specialtyNeeded)) {
    score += 45;
    reasons.push("spécialité compatible");
  }
  if (containsTerm(candidate.targetCountries || "", brief.country)) {
    score += 20;
    reasons.push("mobilité vers le pays de mission déclarée");
  }

  const required = certificationNames(brief.requiredCertifications);
  const available = [
    ...certificationNames(candidate.normalizedCertifications),
    ...certificationNames(candidate.certifications),
  ];
  const matchedCertifications = required.filter(requiredName => available.some(candidateName => containsTerm(candidateName, requiredName) || containsTerm(requiredName, candidateName)));
  if (required.length > 0 && matchedCertifications.length > 0) {
    score += Math.round((matchedCertifications.length / required.length) * 35);
    reasons.push(`certifications correspondantes : ${matchedCertifications.join(", ")}`);
  }
  if (required.length === 0) {
    score += 15;
    reasons.push("aucune certification spécifique imposée");
  }

  return { score: Math.min(score, 100), reasons, matchedCertifications };
}

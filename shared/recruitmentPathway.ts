/**
 * Start of the specialty of a VVIP / offshore application
 * (client/src/pages/VvipOffshorePage.tsx), which marks its pathway until a
 * column of its own holds it (REC-11, the owner's decision): it keeps the
 * application apart from a standard one sent with the same CV (INTL-03, index
 * cv_applications_submission_unique) and lets the admin find it by its
 * specialty. Never shown as such: the owner's email and the admin give
 * VVIP_PATHWAY_LABEL instead.
 */
export const VVIP_SPECIALTY_PREFIX = "[VVIP / Offshore] ";

/** The pathway as the owner's email and the admin name it. */
export const VVIP_PATHWAY_LABEL = "VVIP & Offshore";

/** Whether an application is a VVIP / offshore one, and its specialty without the prefix that marks it. */
export function recruitmentPathway(specialty: string): {
  vvip: boolean;
  specialty: string;
} {
  return specialty.startsWith(VVIP_SPECIALTY_PREFIX)
    ? { vvip: true, specialty: specialty.slice(VVIP_SPECIALTY_PREFIX.length) }
    : { vvip: false, specialty };
}

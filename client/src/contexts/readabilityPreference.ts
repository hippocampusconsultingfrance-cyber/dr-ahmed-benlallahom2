export const HIGH_READABILITY_STORAGE_KEY = "highReadability";

export function readHighReadabilityPreference(value: string | null) {
  return value === "true";
}

export const OLED_DARK_STORAGE_KEY = "oled-dark";

export function readOledDarkPreference(value: string | null) {
  return value === "true";
}

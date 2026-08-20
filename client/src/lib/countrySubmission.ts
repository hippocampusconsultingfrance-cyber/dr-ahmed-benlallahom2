/**
 * Some mobile browsers restore or autofill a visible form control without
 * dispatching React's change event. Prefer the controlled value, but recover
 * the visible DOM value at submission time when state is still empty.
 */
export function resolveCountryForSubmission(stateValue: string, visibleValue: FormDataEntryValue | null, allowedValues?: readonly string[]): string {
  const normalizedState = stateValue.trim();
  if (normalizedState) return normalizedState;
  const normalizedVisible = typeof visibleValue === "string" ? visibleValue.trim() : "";
  if (!normalizedVisible) return "";
  return !allowedValues || allowedValues.includes(normalizedVisible) ? normalizedVisible : "";
}

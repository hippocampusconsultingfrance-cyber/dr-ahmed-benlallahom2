export function percentageLabel(numerator: number | null | undefined, denominator: number | null | undefined): string {
  const safeNumerator = Number(numerator || 0);
  const safeDenominator = Number(denominator || 0);
  if (safeDenominator <= 0) return "—";
  return `${Math.round((safeNumerator / safeDenominator) * 100)} %`;
}

export function nonNegativeCount(value: number | null | undefined): number {
  return Math.max(0, Number(value || 0));
}

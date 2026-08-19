type PublicContentSkeletonProps = {
  label: string;
  cards?: number;
  columns?: 2 | 3 | 4;
};

export function getSkeletonCardCount(cards = 3) {
  return Math.min(Math.max(Math.floor(cards), 1), 4);
}

export function getSkeletonGridClass(columns: 2 | 3 | 4) {
  if (columns === 2) return "grid gap-4 lg:grid-cols-2";
  if (columns === 4) return "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";
  return "grid gap-6 md:grid-cols-3";
}

export default function PublicContentSkeleton({ label, cards = 3, columns = 3 }: PublicContentSkeletonProps) {
  const count = getSkeletonCardCount(cards);

  return <div className={getSkeletonGridClass(columns)} role="status" aria-live="polite" aria-label={label}>
    <span className="sr-only">{label}</span>
    {Array.from({ length: count }, (_, index) => <div key={index} aria-hidden="true" className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-6">
      <div className="skeleton-shimmer h-4 w-24 rounded-full" />
      <div className="skeleton-shimmer mt-6 h-5 w-4/5 rounded" />
      <div className="skeleton-shimmer mt-4 h-3 w-full rounded" />
      <div className="skeleton-shimmer mt-2 h-3 w-11/12 rounded" />
      <div className="mt-8 border-t border-border/50 pt-4"><div className="skeleton-shimmer h-3 w-2/5 rounded" /></div>
    </div>)}
  </div>;
}

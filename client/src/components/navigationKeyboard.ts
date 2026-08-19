export function getMenuFocusIndex(currentIndex: number, itemCount: number, key: string): number | null {
  if (itemCount < 1) return null;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowDown") return (currentIndex + 1 + itemCount) % itemCount;
  if (key === "ArrowUp") return (currentIndex - 1 + itemCount) % itemCount;
  return null;
}

export function isNavigationDismissKey(key: string) {
  return key === "Escape";
}

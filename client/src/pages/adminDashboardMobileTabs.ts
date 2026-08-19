export type AdminTabOption<T extends string> = { id: T; label: string };

export function getActiveAdminTabLabel<T extends string>(tabs: AdminTabOption<T>[], activeTab: T) {
  return tabs.find(tab => tab.id === activeTab)?.label ?? tabs[0]?.label ?? "";
}

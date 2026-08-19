export const notificationToastClassNames = {
  toast: "rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl",
  title: "font-semibold tracking-tight",
  description: "text-sm text-muted-foreground",
  closeButton: "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
  success: "border-emerald-500/50 bg-emerald-950 text-emerald-50",
  error: "border-destructive/60 bg-red-950 text-red-50",
  warning: "border-amber-500/60 bg-amber-950 text-amber-50",
  info: "border-primary/60 bg-slate-950 text-slate-50",
} as const;

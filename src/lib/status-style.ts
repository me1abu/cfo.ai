import type { DisplayStatus } from "./invoice-math";

export const statusColors: Record<DisplayStatus, string> = {
  paid: "bg-success/15 text-success border-success/30",
  unpaid: "bg-warning/20 text-warning-foreground border-warning/40",
  draft: "bg-muted text-muted-foreground border-border",
  overdue: "bg-destructive/15 text-destructive border-destructive/30",
  credited: "bg-primary/10 text-primary border-primary/30",
};

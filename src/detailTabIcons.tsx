import { AlignLeft, ChartNoAxesCombined, Clock3, Code2, FileText, History, LayoutDashboard, Network, ScrollText, ShieldCheck, Table2, type LucideIcon } from "lucide-react";

const tabIcons: Record<string, LucideIcon> = {
  details: FileText,
  rows: Table2,
  import: Table2,
  stats: ChartNoAxesCombined,
  description: AlignLeft,
  "ulm-diagram": Network,
  updates: History,
  policies: Clock3,
  permissions: ShieldCheck,
  graphs: Network,
  "historical-updates": History,
  logs: ScrollText,
  overview: LayoutDashboard,
  tables: Table2,
  "query-builder": Code2,
};

export function DetailTabIcon({ id }: { id: string }) {
  const Icon = tabIcons[id];
  return Icon ? <Icon size={16} aria-hidden="true" /> : null;
}

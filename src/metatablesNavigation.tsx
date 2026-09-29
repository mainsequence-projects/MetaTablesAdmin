import { createLucideIcon, Database, History, Layers3, RefreshCw, Settings, ShieldCheck, Table2 } from "lucide-react";
import { defineNavigationApplication } from "@dev-mainsequence/command-center-sdk/navigation";
import { adminPaths, resourceLabels } from "./navigation";

export const TimeIndexMetaTableIcon = createLucideIcon("TimeIndexMetaTable", [
  ["path", { d: "M21 10V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5", key: "table" }],
  ["path", { d: "M3 9h18M3 15h7M9 3v18M15 3v7", key: "grid" }],
  ["circle", { cx: "17", cy: "17", r: "5", key: "clock" }],
  ["path", { d: "M17 14v3l2 1", key: "hands" }],
]);

function MetaTablesMark({ className }: { className?: string }) {
  return <span className={`metatables-mark ${className ?? ""}`} aria-hidden="true"><span>m</span><i /></span>;
}

export const metatablesNavigation = defineNavigationApplication({
  id: "metatables",
  label: "MetaTables",
  description: "Tables and updates",
  href: "/tables",
  icon: MetaTablesMark,
  defaultDestinationId: "metatables.tables",
  subApplications: [{
    id: "metatables.catalog",
    label: "Catalog",
    destinations: [
      { id: "metatables.data-sources", label: "Data Sources", description: "Database connections", href: "/data-sources", icon: Database },
      { id: "metatables.tables", label: resourceLabels.tables, description: "All registered tables", href: "/tables", icon: Table2 },
      { id: "metatables.time-index-meta-tables", label: resourceLabels["time-index-meta-tables"], description: "Tables indexed by time", href: "/time-index-meta-tables", icon: TimeIndexMetaTableIcon },
      { id: "metatables.data-updates", label: resourceLabels["data-updates"], description: "Configured producers", href: "/data-updates", icon: RefreshCw },
      { id: "metatables.runs", label: "Runs", description: "Historical execution graphs and logs", href: "/runs", icon: History },
      { id: "metatables.namespaces", label: "Namespaces", description: "Catalog groups", href: "/namespaces", icon: Layers3 },
    ],
  }],
});

export const adminNavigation = defineNavigationApplication({
  id: "metatables.admin",
  label: "Admin",
  description: "MetaTables administration settings",
  href: adminPaths.settings,
  icon: ShieldCheck,
  defaultDestinationId: "metatables.settings",
  subApplications: [{
    id: "metatables.administration",
    label: "Admin",
    destinations: [
      { id: "metatables.admin-data-sources", label: "Data Sources", description: "Manage database connections", href: adminPaths.dataSources, icon: Database },
      { id: "metatables.security", label: "Security", description: "Table access and recovery", href: adminPaths.security, icon: ShieldCheck },
      { id: "metatables.settings", label: "Settings", description: "Runtime and DataSource", href: adminPaths.settings, icon: Settings },
    ],
  }],
});

export const navigationApplications = [metatablesNavigation, adminNavigation];

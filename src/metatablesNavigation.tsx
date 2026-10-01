import { BookOpen, createLucideIcon, Database, History, Layers3, RefreshCw, Settings, ShieldCheck, Table2 } from "lucide-react";
import { defineNavigationApplication } from "@dev-mainsequence/command-center-sdk/navigation";
import { adminPaths, resourceLabels } from "./navigation";

export const TimeIndexMetaTableIcon = createLucideIcon("TimeIndexMetaTable", [
  ["path", { d: "M21 10V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5", key: "table" }],
  ["path", { d: "M3 9h18M3 15h7M9 3v18M15 3v7", key: "grid" }],
  ["circle", { cx: "17", cy: "17", r: "5", key: "clock" }],
  ["path", { d: "M17 14v3l2 1", key: "hands" }],
]);

function MetaTablesMark({ className }: { className?: string }) {
  return <span className={`metatables-mark ${className ?? ""}`} aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <g strokeWidth="1.5">
        <path d="m4.8 5.6 4 4.9m-4 7.9 4-4.9M11.8 12h0.7" />
        <circle cx="3.5" cy="4" r="2.1" />
        <circle cx="3.5" cy="20" r="2.1" />
        <circle cx="10" cy="12" r="1.8" />
      </g>
      <rect x="12.5" y="8" width="11" height="8" rx="0.65" strokeWidth="1.25" />
      <path d="M12.5 10.5h11M12.5 13.25h11M16.2 8v8M19.8 8v8" strokeWidth="1.1" />
    </svg>
  </span>;
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
      { id: "metatables.data-sources", label: "Data Sources", description: "Registered databases", href: "/data-sources", icon: Database },
      { id: "metatables.tables", label: resourceLabels.tables, description: "All registered tables", href: "/tables", icon: Table2 },
      { id: "metatables.time-index-meta-tables", label: resourceLabels["time-index-meta-tables"], description: "Tables indexed by time", href: "/time-index-meta-tables", icon: TimeIndexMetaTableIcon },
      { id: "metatables.data-updates", label: resourceLabels["data-updates"], description: "Configured producers", href: "/data-updates", icon: RefreshCw },
      { id: "metatables.namespaces", label: "Namespaces", description: "Catalog groups", href: "/namespaces", icon: Layers3 },
    ],
  }, {
    id: "metatables.monitoring",
    label: "Monitoring",
    destinations: [
      { id: "metatables.runs", label: "Runs", description: "Historical execution graphs and logs", href: "/runs", icon: History },
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
      { id: "metatables.security", label: "Security", description: "Table access and recovery", href: adminPaths.security, icon: ShieldCheck },
      { id: "metatables.settings", label: "Settings", description: "Runtime and DataSource", href: adminPaths.settings, icon: Settings },
    ],
  }],
});

export const userGuideNavigation = defineNavigationApplication({
  id: "metatables.user-guide",
  label: "User guide",
  href: "/docs/",
  icon: BookOpen,
  subApplications: [],
});

export const navigationApplications = [metatablesNavigation, adminNavigation];

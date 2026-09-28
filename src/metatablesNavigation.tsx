import { Database, Layers3, RefreshCw } from "lucide-react";
import { defineNavigationApplication } from "@dev-mainsequence/command-center-sdk/navigation";

function MetaTablesMark({ className }: { className?: string }) {
  return <span className={`metatables-mark ${className ?? ""}`} aria-hidden="true"><span>m</span><i /></span>;
}

export const metatablesNavigation = defineNavigationApplication({
  id: "metatables",
  label: "MetaTables",
  description: "MetaTables administration",
  href: "/tables",
  icon: MetaTablesMark,
  defaultDestinationId: "metatables.tables",
  subApplications: [{
    id: "metatables.catalog",
    label: "Catalog",
    destinations: [
      { id: "metatables.data-sources", label: "Data Sources", description: "Database connections", href: "/data-sources", icon: Database },
      { id: "metatables.tables", label: "Tables", description: "Registered data", href: "/tables", icon: Database },
      { id: "metatables.data-updates", label: "Data Updates", description: "Processes and runs", href: "/data-updates", icon: RefreshCw },
      { id: "metatables.namespaces", label: "Namespaces", description: "Catalog groups", href: "/namespaces", icon: Layers3 },
    ],
  }],
});

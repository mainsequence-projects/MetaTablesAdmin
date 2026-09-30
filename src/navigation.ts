export type TableResource = "tables" | "time-index-meta-tables";
export type Resource = TableResource | "data-updates" | "runs" | "namespaces" | "data-sources";

export const adminPaths = {
  settings: "/admin/settings",
  security: "/admin/security",
} as const;

export const resourceLabels: Record<Resource, string> = {
  "data-sources": "Data Sources",
  tables: "MetaTables",
  "time-index-meta-tables": "Time Index MetaTables",
  "data-updates": "Time Index Table Updates",
  runs: "Runs",
  namespaces: "Namespaces",
};

export function resourceForPath(pathname: string): Resource {
  return (Object.keys(resourceLabels) as Resource[]).find((resource) =>
    pathname === `/${resource}` || pathname.startsWith(`/${resource}/`)
  ) ?? "tables";
}

export function detailPath(resource: Resource, uid: string, tab?: string) {
  return `/${resource}/${encodeURIComponent(uid)}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`;
}

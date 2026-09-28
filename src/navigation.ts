export type Resource = "tables" | "data-updates" | "namespaces" | "data-sources";

export function detailPath(resource: Resource, uid: string, tab?: string) {
  return `/${resource}/${encodeURIComponent(uid)}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`;
}

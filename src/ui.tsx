import { useEffect, useState, type ReactNode } from "react";
import { Badge as SdkBadge, Button } from "@dev-mainsequence/command-center-sdk/controls";
import { ActivityIndicator, ApplicationStatusScreen } from "@dev-mainsequence/command-center-sdk/feedback";
import { ApplicationCard, ApplicationPageHeader } from "@dev-mainsequence/command-center-sdk/layout";
import { ResourceDetailShell, ResourcePagination } from "@dev-mainsequence/command-center-sdk/views";
import { ApiError } from "./api";

export type RemoteState<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "ready"; data: T; error?: undefined }
  | { status: "error"; data?: undefined; error: Error };

export function useRemote<T>(key: string, load: (signal: AbortSignal) => Promise<T>): RemoteState<T> {
  const [state, setState] = useState<RemoteState<T>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    load(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ status: "ready", data }); },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", error: error instanceof Error ? error : new Error("Unknown API error") });
      },
    );
    return () => controller.abort();
    // `key` is the complete identity of this request; the loader closes over it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

export function formatDate(value?: string | null) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

export function display(value: unknown, fallback = "Not set") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "success" | "warning" | "danger" }) {
  return <SdkBadge variant={tone === "accent" ? "primary" : tone}>{children}</SdkBadge>;
}

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <ApplicationPageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />;
}

export function Card({ title, description, children, actions, className = "" }: { title?: string; description?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  const header = title || description || actions
    ? <div className="metatables-card-header"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{actions}</div>
    : undefined;
  return <ApplicationCard className={className} contentPadding={className.includes("registry-card") ? "none" : "standard"} header={header}>{children}</ApplicationCard>;
}

export function StatePanel({ title, children, tone = "neutral", action }: { title: string; children?: ReactNode; tone?: "neutral" | "success" | "danger" | "warning"; action?: ReactNode }) {
  return <ApplicationCard surface="nested"><div className="metatables-status"><SdkBadge variant={tone === "neutral" ? "secondary" : tone}>{title}</SdkBadge>{children && <p>{children}</p>}{action}</div></ApplicationCard>;
}

export function RemoteContent<T>({ state, children, empty, loading = "Loading from MetaTables API…" }: { state: RemoteState<T>; children: (data: T) => ReactNode; empty?: (data: T) => boolean; loading?: string }) {
  if (state.status === "loading") return <ApplicationStatusScreen variant="contained" title="Loading" message={loading} state="loading" />;
  if (state.status === "error") {
    const missing = state.error instanceof ApiError && state.error.missingRoute;
    return <ApplicationStatusScreen variant="contained" title={missing ? "API capability pending" : "Could not load this view"} message={state.error.message} state="error" action={{ label: "Retry", onSelect: () => window.location.reload() }} />;
  }
  if (empty?.(state.data)) return <StatePanel title="Nothing here yet">No matching records were returned by the MetaTables API.</StatePanel>;
  return <>{children(state.data)}</>;
}

export function Tabs({ items, active, onChange, children }: { items: { id: string; label: string }[]; active: string; onChange: (id: string) => void; children?: ReactNode }) {
  return <ResourceDetailShell tabs={items} activeTabId={active} onTabChange={onChange} contentVariant="plain" embedded>{children}</ResourceDetailShell>;
}

export function Pagination({ count, offset, limit, onChange, noun }: { count: number; offset: number; limit: number; onChange: (offset: number) => void; noun: string }) {
  return <ResourcePagination count={count} pageIndex={Math.floor(offset / limit)} pageSize={limit} itemLabel={noun} hasNextPage={offset + limit < count} hasPreviousPage={offset > 0} presentation="auto" onPageChange={(pageIndex) => onChange(pageIndex * limit)} />;
}

export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <dl className="metatables-facts">{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}

export function JsonBlock({ value }: { value: unknown }) {
  return <pre className="metatables-json">{JSON.stringify(value, null, 2)}</pre>;
}

export function LoadingIndicator({ label }: { label: string }) {
  return <ActivityIndicator label={label} />;
}

export { Button };

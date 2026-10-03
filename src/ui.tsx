import { useEffect, useState, type ReactNode } from "react";
import { Badge as SdkBadge, Button, useFieldControlProps } from "@dev-mainsequence/command-center-sdk/controls";
import { ActivityIndicator, ApplicationStatusScreen } from "@dev-mainsequence/command-center-sdk/feedback";
import { ApplicationCard, ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { DataTable, EntitySummary, ResourceDetailShell, ResourcePagination, ResourcePicker, type ResourceDetailShellProps, type ResourcePickerProps } from "@dev-mainsequence/command-center-sdk/views";
import type { EntitySummary as EntitySummaryModel } from "@dev-mainsequence/command-center-sdk/resource";
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

export function Card({ title, description, children, actions, className = "", titleAs = "h2" }: { title?: string; description?: string; children: ReactNode; actions?: ReactNode; className?: string; titleAs?: "h2" | "h3" }) {
  const header = title || description || actions
    ? <ApplicationPageHeader title={title} titleAs={titleAs} description={description} actions={actions} />
    : undefined;
  return <ApplicationCard className={className} header={header}><ApplicationPageStack>{children}</ApplicationPageStack></ApplicationCard>;
}

/** Open sections inside the SDK detail shell, which owns the surrounding surface and inset. */
export function DetailSection({ title, description, children, actions, titleAs = "h2" }: {
  title?: string; description?: string; children: ReactNode; actions?: ReactNode; titleAs?: "h2" | "h3";
}) {
  return <ApplicationPageStack as="section" data-detail-section>
    {(title || description || actions) && <ApplicationPageHeader title={title} titleAs={titleAs} description={description} actions={actions} />}
    <ApplicationPageStack>{children}</ApplicationPageStack>
  </ApplicationPageStack>;
}

export function StatePanel({ title, children, tone = "neutral", action, embedded = false }: { title: string; children?: ReactNode; tone?: "neutral" | "success" | "danger" | "warning"; action?: ReactNode; embedded?: boolean }) {
  if (embedded) return <ApplicationPageStack role={tone === "danger" ? "alert" : tone === "success" ? "status" : undefined}>
    <div><SdkBadge variant={tone === "neutral" ? "secondary" : tone}>{title}</SdkBadge></div>
    {children && <div>{children}</div>}
    {action && <div className="runtime-form-actions">{action}</div>}
  </ApplicationPageStack>;
  return <ApplicationCard role={tone === "danger" ? "alert" : tone === "success" ? "status" : undefined}
    header={<SdkBadge variant={tone === "neutral" ? "secondary" : tone}>{title}</SdkBadge>}>
    <ApplicationPageStack>{children && <p>{children}</p>}{action}</ApplicationPageStack>
  </ApplicationCard>;
}

export function RemoteContent<T>({ state, children, empty, loading = "Loading from MetaTables API…" }: { state: RemoteState<T>; children: (data: T) => ReactNode; empty?: (data: T) => boolean; loading?: string }) {
  if (state.status === "loading") return <ApplicationStatusScreen variant="contained" title="Loading" message={loading} state="loading" />;
  if (state.status === "error") {
    const missing = state.error instanceof ApiError && state.error.missingRoute;
    return <ApplicationStatusScreen variant="contained" title={missing ? "API endpoint unavailable" : "Could not load this view"} message={state.error.message} state="error" action={{ label: "Retry", onSelect: () => window.location.reload() }} />;
  }
  if (empty?.(state.data)) return <StatePanel embedded title="Nothing here yet">No matching records were returned by the MetaTables API.</StatePanel>;
  return <>{children(state.data)}</>;
}

export function Pagination({ count, offset, limit, onChange, noun }: { count: number; offset: number; limit: number; onChange: (offset: number) => void; noun: string }) {
  return <ResourcePagination count={count} pageIndex={Math.floor(offset / limit)} pageSize={limit} itemLabel={noun} hasNextPage={offset + limit < count} hasPreviousPage={offset > 0} presentation="auto" onPageChange={(pageIndex) => onChange(pageIndex * limit)} />;
}

export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <DataTable items={items} getId={item => item.label} presentation="auto" columns={[
    { id: "label", header: "Field", importance: "primary", renderCell: item => item.label },
    { id: "value", header: "Value", importance: "secondary", renderCell: item => item.value },
  ]} />;
}

/** Join the SDK field's accessible wiring to the SDK picker. */
export function Picker(props: ResourcePickerProps) {
  const binding = useFieldControlProps({ id: props.id, disabled: props.disabled });
  return <ResourcePicker {...binding} {...props} />;
}

export function DetailView<T>({ state, summary, children, onSummaryLinkSelect, ...props }: Omit<ResourceDetailShellProps<T>, "summary" | "children" | "loading" | "error"> & {
  state: RemoteState<T>;
  summary: (data: T) => EntitySummaryModel;
  children: (data: T) => ReactNode;
  onSummaryLinkSelect?: (href: string) => void;
}) {
  return <ResourceDetailShell<T> {...props} loading={state.status === "loading"}
    error={state.status === "error" ? <ApplicationPageStack><p>{state.error.message}</p><Button onClick={() => window.location.reload()}>Retry</Button></ApplicationPageStack> : undefined}
    summary={state.status === "ready" ? <EntitySummary summary={summary(state.data)} onLinkSelect={onSummaryLinkSelect} /> : undefined}>
    {state.status === "ready" ? <ApplicationPageStack>{children(state.data)}</ApplicationPageStack> : undefined}
  </ResourceDetailShell>;
}

export function JsonBlock({ value }: { value: unknown }) {
  return <pre className="metatables-json">{JSON.stringify(value, null, 2)}</pre>;
}

export function LoadingIndicator({ label }: { label: string }) {
  return <ActivityIndicator label={label} />;
}

export { Button };

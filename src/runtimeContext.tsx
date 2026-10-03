import { Fragment, createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApplicationStatusScreen } from "@dev-mainsequence/command-center-sdk/feedback";
import { ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { metaTablesApi, onRuntimeChanged, type RuntimeContext } from "./api";
import { DataSourceTypeIcon, sourceEngineLabel } from "./DataSourceTypeIcon";
import { runtimeDataSourceProblem } from "./runtimeDataSourceProblem";
import type { RemoteState } from "./ui";

type Context = { runtime: RuntimeContext; refresh: () => Promise<RuntimeContext> };
const RuntimeContextValue = createContext<Context | null>(null);

export function RuntimeContextProvider({ children }: { children: ReactNode }) {
  const [remote, setRemote] = useState<RemoteState<RuntimeContext>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    setRemote({ status: "loading" });
    metaTablesApi.runtimeContext(controller.signal).then(
      data => { if (!controller.signal.aborted) setRemote({ status: "ready", data }); },
      error => { if (!controller.signal.aborted) setRemote({ status: "error", error: error instanceof Error ? error : new Error("Unable to read API runtime context") }); },
    );
    return () => controller.abort();
  }, [attempt]);
  // Re-read the runtime when the API reports a newer one; views remount with it.
  useEffect(() => onRuntimeChanged(() => setAttempt(value => value + 1)), []);
  async function refresh() {
    const signal = active.current?.signal;
    const data = await metaTablesApi.runtimeContext(signal);
    if (!signal?.aborted) setRemote({ status: "ready", data });
    return data;
  }
  if (remote.status !== "ready") return <ApplicationStatusScreen variant="viewport"
    title={remote.status === "error" ? "Could not initialize MetaTables" : "Reading API runtime"}
    message={remote.status === "error" ? remote.error.message : "Loading the API's runtime and settings."}
    state={remote.status === "error" ? "error" : "loading"}
    action={remote.status === "error" ? { label: "Retry", onSelect: () => setAttempt(value => value + 1) } : undefined} />;
  return <RuntimeContextValue.Provider value={{ runtime: remote.data, refresh }}>
    <Fragment key={remote.data.runtime_instance_id ?? "hosted"}>{children}</Fragment>
  </RuntimeContextValue.Provider>;
}

export function useRuntimeContext() {
  const context = useContext(RuntimeContextValue);
  if (!context) throw new Error("Runtime context must be initialized before rendering the application");
  return context;
}

export function DataSourceConfigurationError({ onSettings }: { onSettings?: () => void }) {
  const { runtime } = useRuntimeContext();
  const problem = runtimeDataSourceProblem(runtime);
  if (!problem) return null;
  const source = runtime.data_source ?? runtime.bootstrap?.candidate;
  const candidate = runtime.bootstrap?.candidate;
  return <ApplicationStatusScreen variant="contained" state="error"
    title={problem.title}
    message={<ApplicationPageStack>
      {source && <p><span className="data-source-picker-value"><DataSourceTypeIcon engine={source.class_type} />
        <strong>{source.display_name}</strong> · {sourceEngineLabel(source.class_type)} · {runtime.local_mode ? "Local" : "Hosted"}
      </span>{candidate?.class_type === "sqlite" && typeof candidate.configuration.path === "string" && <>
        <br /><span className="mono muted">{candidate.configuration.path}</span>
      </>}</p>}
      <p>{runtime.is_admin === true ? problem.message : "Ask an application admin to complete or restore the runtime DataSource setup."}</p>
    </ApplicationPageStack>}
    action={runtime.is_admin === true && onSettings ? { label: "Open Settings", onSelect: onSettings } : undefined} />;
}

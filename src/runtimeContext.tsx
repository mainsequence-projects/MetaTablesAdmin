import { Fragment, createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApplicationStatusScreen } from "@dev-mainsequence/command-center-sdk/feedback";
import { ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { metaTablesApi, type RuntimeContext } from "./api";
import { DataSourceTypeIcon, sourceEngineLabel } from "./DataSourceTypeIcon";
import { runtimeDataSourceProblem } from "./runtimeDataSourceProblem";
import type { RemoteState } from "./ui";

type Context = { runtime: RuntimeContext; refresh: () => Promise<RuntimeContext>;
  switchMode: (mode: "local" | "hosted") => Promise<void>; switchError: string };
const RuntimeContextValue = createContext<Context | null>(null);

export function RuntimeContextProvider({ children }: { children: ReactNode }) {
  const [remote, setRemote] = useState<RemoteState<RuntimeContext>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const active = useRef<AbortController | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    setRemote({ status: "loading" });
    metaTablesApi.runtimeContext(controller.signal).then(
      data => { if (!controller.signal.aborted) setRemote({ status: "ready", data }); },
      error => { if (!controller.signal.aborted) setRemote({ status: "error", error: error instanceof Error ? error : new Error("Unable to read API runtime context") }); },
    );
    return () => { controller.abort(); active.current?.abort(); };
  }, [attempt]);
  async function refresh() {
    const signal = active.current?.signal;
    const data = await metaTablesApi.runtimeContext(signal);
    if (!signal?.aborted) setRemote({ status: "ready", data });
    return data;
  }
  async function switchMode(mode: "local" | "hosted") {
    if (remote.status !== "ready" || switching) return;
    const previous = remote.data;
    setSwitchError("");
    // Keep the current page mounted until admission succeeds so a 409 (active
    // update/migration) can be shown without destroying the user's page state.
    try {
      const result = await metaTablesApi.selectRuntime(mode);
      if (!result.restarting) return;
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : "Runtime switch was rejected");
      return;
    }
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setSwitching(true);
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline && !controller.signal.aborted) {
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        const context = await metaTablesApi.runtimeContext(
          AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]));
        if (context.runtime_instance_id === previous.runtime_instance_id) continue;
        setRemote({ status: "ready", data: context });
        setSwitchError(context.runtime_switch_error ?? (context.local_mode === (mode === "local")
          ? "" : "The API did not activate the requested mode."));
        setSwitching(false);
        return;
      } catch { /* The old worker is stopping or its replacement is starting. */ }
    }
    if (!controller.signal.aborted) {
      setRemote({ status: "error", error: new Error("Runtime restart did not complete. Check the API launch log, then retry.") });
      setSwitching(false);
    }
  }
  if (switching) return <ApplicationStatusScreen variant="viewport" state="loading"
    title="Switching API runtime" message="Waiting for the API to restart in the selected mode." />;
  if (remote.status !== "ready") return <ApplicationStatusScreen variant="viewport"
    title={remote.status === "error" ? "Could not initialize MetaTables" : "Reading API runtime"}
    message={remote.status === "error" ? remote.error.message : "Loading the API's runtime and settings."}
    state={remote.status === "error" ? "error" : "loading"}
    action={remote.status === "error" ? { label: "Retry", onSelect: () => setAttempt(value => value + 1) } : undefined} />;
  return <RuntimeContextValue.Provider value={{ runtime: remote.data, refresh, switchMode, switchError }}>
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

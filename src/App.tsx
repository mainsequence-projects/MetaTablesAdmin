import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createStaticSiteIframeClient } from "@dev-mainsequence/command-center-sdk/embed";
import { ApplicationStatusScreen } from "@dev-mainsequence/command-center-sdk/feedback";
import { ApplicationPage, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import {
  ApplicationNavigationPanelShell,
  findNavigationDestination,
  type NavigationIntent,
} from "@dev-mainsequence/command-center-sdk/navigation";
import { applyThemePresetToRoot, mainSequenceTheme, quartzLightTheme, resolveCommandCenterThemeById } from "@dev-mainsequence/command-center-sdk/theme";
import { setHostedMetaTablesTransport } from "./api";
import { metatablesNavigation } from "./metatablesNavigation";
import { DataUpdatesPage } from "./pages/DataUpdatesPage";
import { NamespacesPage } from "./pages/NamespacesPage";
import { DataSourcesPage } from "./pages/DataSourcesPage";
import { TablesPage } from "./pages/TablesPage";

type PageResource = "tables" | "data-updates" | "namespaces" | "data-sources";
type RuntimeState = { status: "loading" | "ready" | "error"; message: string; generation: number };

function useMetaTablesRuntime(): RuntimeState {
  const localDirect = import.meta.env.DEV && window.parent === window;
  const [state, setState] = useState<RuntimeState>(localDirect
    ? { status: "ready", message: "", generation: 0 }
    : { status: "loading", message: "Waiting for Command Center context.", generation: 0 });
  const userUid = useRef<string | null>(null);

  useEffect(() => {
    if (localDirect) return;
    if (window.parent === window) {
      setState({ status: "error", message: "This deployed site needs the trusted Command Center embed to reach the MetaTables API.", generation: 0 });
      return;
    }
    const hostOrigin = import.meta.env.VITE_COMMAND_CENTER_ORIGIN?.trim();
    const releaseUid = import.meta.env.VITE_METATABLES_RESOURCE_RELEASE_UID?.trim();
    let validOrigin = false;
    try { validOrigin = Boolean(hostOrigin && new URL(hostOrigin).origin === hostOrigin); }
    catch { validOrigin = false; }
    if (!validOrigin || !hostOrigin || !releaseUid) {
      setState({ status: "error", message: "The Command Center origin and MetaTables API release must be configured for this embed.", generation: 0 });
      return;
    }
    let receivedContext = false;
    const client = createStaticSiteIframeClient({
      channel: "mainsequence.metatables-admin",
      hostOrigin,
      parentWindow: window.parent,
      onContext(context) {
        receivedContext = true;
        const theme = resolveCommandCenterThemeById(context.themeId)
          ?? (context.themeMode === "dark" ? mainSequenceTheme : quartzLightTheme);
        applyThemePresetToRoot(document.documentElement, { theme });
        setHostedMetaTablesTransport((path, init) => client.fetchFastApi({ resourceReleaseUid: releaseUid, path }, init));
        setState((current) => ({ status: "ready", message: "", generation: current.generation + (userUid.current !== context.userUid ? 1 : 0) }));
        userUid.current = context.userUid;
      },
    });
    const handleMessage = (event: MessageEvent<unknown>) => client.handleMessage(event);
    window.addEventListener("message", handleMessage);
    const timeout = window.setTimeout(() => {
      if (!receivedContext) setState({ status: "error", message: "Command Center did not initialize this embed.", generation: 0 });
    }, 10000);
    client.announceReady();
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      setHostedMetaTablesTransport(null);
      client.dispose();
    };
  }, [localDirect]);

  return state;
}

function ResourceRoute({ resource }: { resource: PageResource }) {
  const { uid } = useParams();
  const [search] = useSearchParams();
  const tab = search.get("tab");
  return <ApplicationPageStack>
    {resource === "data-sources" ? <DataSourcesPage key={uid ?? "list"} uid={uid ?? null} /> : resource === "tables" ? <TablesPage uid={uid ?? null} tab={tab} />
      : resource === "data-updates" ? <DataUpdatesPage uid={uid ?? null} tab={tab} />
        : <NamespacesPage uid={uid ?? null} tab={tab} />}
  </ApplicationPageStack>;
}

export default function App() {
  const runtime = useMetaTablesRuntime();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const resource: PageResource = location.pathname.startsWith("/data-sources") ? "data-sources" : location.pathname.startsWith("/data-updates")
    ? "data-updates"
    : location.pathname.startsWith("/namespaces")
      ? "namespaces"
      : "tables";
  const activeDestinationId = `metatables.${resource}`;

  useEffect(() => {
    document.title = `${resource === "data-sources" ? "Data Sources" : resource === "data-updates" ? "Data Updates" : resource === "namespaces" ? "Namespaces" : "Tables"} · MetaTables Admin`;
  }, [resource]);

  function handleNavigate(intent: NavigationIntent) {
    const selected = findNavigationDestination(metatablesNavigation, intent.destinationId);
    if (selected?.destination.href) navigate(selected.destination.href);
  }

  if (runtime.status !== "ready") return <ApplicationStatusScreen
    variant="viewport"
    title={runtime.status === "error" ? "MetaTables Admin unavailable" : "Preparing MetaTables Admin"}
    message={runtime.message}
    state={runtime.status === "error" ? "error" : "loading"}
    action={runtime.status === "error" ? { label: "Retry", onSelect: () => window.location.reload() } : undefined}
  />;

  return <ApplicationNavigationPanelShell
    activeDestinationId={activeDestinationId}
    application={metatablesNavigation}
    menuOpen={menuOpen}
    onMenuOpenChange={setMenuOpen}
    onNavigate={handleNavigate}
    panelWidth="254px"
    presentation="auto"
    showDestinationDescriptions
  >
    <ApplicationPage as="main" maxWidth="full" className="metatables-page" key={runtime.generation}>
      <Routes>
        <Route path="/" element={<Navigate replace to="/tables" />} />
        <Route path="/tables" element={<ResourceRoute resource="tables" />} />
        <Route path="/tables/:uid" element={<ResourceRoute resource="tables" />} />
        <Route path="/data-updates" element={<ResourceRoute resource="data-updates" />} />
        <Route path="/data-updates/:uid" element={<ResourceRoute resource="data-updates" />} />
        <Route path="/data-sources" element={<ResourceRoute resource="data-sources" />} />
        <Route path="/data-sources/:uid" element={<ResourceRoute resource="data-sources" />} />
        <Route path="/namespaces" element={<ResourceRoute resource="namespaces" />} />
        <Route path="/namespaces/:uid" element={<ResourceRoute resource="namespaces" />} />
        <Route path="*" element={<Navigate replace to="/tables" />} />
      </Routes>
    </ApplicationPage>
  </ApplicationNavigationPanelShell>;
}

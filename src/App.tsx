import { useEffect, useRef, useState } from "react";
import { matchPath, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createStaticSiteIframeClient } from "@dev-mainsequence/command-center-sdk/embed";
import { ApplicationStatusScreen } from "@dev-mainsequence/command-center-sdk/feedback";
import { ApplicationPage, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import {
  ApplicationNavigationShell,
  ApplicationNavigationPanelShell,
  findNavigationDestination,
  type NavigationIntent,
} from "@dev-mainsequence/command-center-sdk/navigation";
import { applyThemePresetToRoot, mainSequenceTheme, quartzLightTheme, resolveCommandCenterThemeById } from "@dev-mainsequence/command-center-sdk/theme";
import { setHostedMetaTablesTransport } from "./api";
import { adminNavigation, metatablesNavigation, navigationApplications } from "./metatablesNavigation";
import { adminPaths, resourceForPath, resourceLabels, type Resource } from "./navigation";
import { DataUpdatesPage } from "./pages/DataUpdatesPage";
import { RunsPage } from "./pages/RunsPage";
import { NamespacesPage } from "./pages/NamespacesPage";
import { DataSourcesPage } from "./pages/DataSourcesPage";
import { TablesPage } from "./pages/TablesPage";
import { SecurityPage } from "./pages/SecurityPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DataSourceConfigurationError, RuntimeContextProvider, useRuntimeContext } from "./runtimeContext";

type PageResource = Resource;
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

function ResourceRoute({ resource, administration = false }: { resource: PageResource; administration?: boolean }) {
  const { uid } = useParams();
  const [search] = useSearchParams();
  const tab = search.get("tab");
  return <ApplicationPageStack>
    {resource === "data-sources" ? <DataSourcesPage key={`${administration}-${uid ?? "list"}`} uid={uid ?? null} administration={administration} /> : resource === "tables" || resource === "time-index-meta-tables" ? <TablesPage key={resource} resource={resource} uid={uid ?? null} tab={tab} />
      : resource === "data-updates" ? <DataUpdatesPage uid={uid ?? null} tab={tab} />
        : resource === "runs" ? <RunsPage key={uid ?? "list"} uid={uid ?? null} />
        : <NamespacesPage uid={uid ?? null} tab={tab} />}
  </ApplicationPageStack>;
}

function RequireAdministrator() {
  const { runtime } = useRuntimeContext();
  if (runtime.is_admin !== true) return <ApplicationStatusScreen variant="contained" title="Admin access required"
    message="Application Settings, DataSource management and Security require platform admin access. Table Writers manage sharing on their table's Access panel." state="error" />;
  return <Outlet />;
}

function RuntimeConfiguredRoutes({ allowUnavailableSource = false }: { allowUnavailableSource?: boolean }) {
  const { runtime } = useRuntimeContext();
  const navigate = useNavigate();
  if (!(allowUnavailableSource && runtime.bootstrap?.active !== false) && (!runtime.data_source || runtime.data_source_error)) {
    return <ApplicationPageStack><DataSourceConfigurationError onSettings={() => navigate(adminPaths.settings)} /></ApplicationPageStack>;
  }
  return <Outlet />;
}

function LegacyAdminRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate replace to={`${to}${search}${hash}`} />;
}

function AuthorizedApplication() {
  const { runtime } = useRuntimeContext();
  const isAdmin = runtime.is_admin === true;
  const applications = isAdmin ? navigationApplications : [metatablesNavigation];
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const resource = resourceForPath(location.pathname);
  const adminRoute = Boolean(matchPath("/admin/*", location.pathname));
  const adminDestination = matchPath(`${adminPaths.security}/*`, location.pathname) ? "security"
    : matchPath(`${adminPaths.dataSources}/*`, location.pathname) ? "admin-data-sources" : "settings";
  const activeApplicationId = isAdmin && adminRoute ? adminNavigation.id : metatablesNavigation.id;
  const activeDestinationId = `metatables.${isAdmin && adminRoute ? adminDestination : resource}`;
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(activeApplicationId);
  const [railCollapsed, setRailCollapsed] = useState(false);

  useEffect(() => {
    setOpenApplicationId(activeApplicationId);
  }, [activeApplicationId]);

  useEffect(() => {
    const title = adminRoute ? !isAdmin ? "Admin access required" : adminDestination === "security" ? "Security"
      : adminDestination === "admin-data-sources" ? "Data Sources" : "Settings" : resourceLabels[resource];
    document.title = `${title} · MetaTables Admin`;
  }, [resource, adminRoute, adminDestination, isAdmin]);

  function handleNavigate(intent: NavigationIntent) {
    const application = applications.find(item => item.id === intent.applicationId);
    const selected = application && findNavigationDestination(application, intent.destinationId);
    if (selected?.destination.href) {
      setOpenApplicationId(intent.applicationId);
      navigate(selected.destination.href);
    }
  }

  const content = <ApplicationPage as="main" maxWidth="full" className="metatables-page">
    <Routes>
      <Route path="/" element={<Navigate replace to="/tables" />} />
      <Route path="/settings" element={<LegacyAdminRedirect to={adminPaths.settings} />} />
      <Route path="/security" element={<LegacyAdminRedirect to={adminPaths.security} />} />
      <Route path="/data-sources/new" element={<LegacyAdminRedirect to={`${adminPaths.dataSources}/new`} />} />
      <Route path="/admin" element={<RequireAdministrator />}>
        <Route index element={<Navigate replace to={adminPaths.settings} />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route element={<RuntimeConfiguredRoutes />}>
          <Route path="security" element={<SecurityPage />} />
        </Route>
        <Route element={<RuntimeConfiguredRoutes allowUnavailableSource />}>
          <Route path="data-sources" element={<ResourceRoute resource="data-sources" administration />} />
          <Route path="data-sources/:uid" element={<ResourceRoute resource="data-sources" administration />} />
        </Route>
        <Route path="*" element={<Navigate replace to={adminPaths.settings} />} />
      </Route>
      <Route element={<RuntimeConfiguredRoutes />}>
        <Route path="/tables" element={<ResourceRoute resource="tables" />} />
        <Route path="/tables/:uid" element={<ResourceRoute resource="tables" />} />
        <Route path="/time-index-meta-tables" element={<ResourceRoute resource="time-index-meta-tables" />} />
        <Route path="/time-index-meta-tables/:uid" element={<ResourceRoute resource="time-index-meta-tables" />} />
        <Route path="/data-updates" element={<ResourceRoute resource="data-updates" />} />
        <Route path="/data-updates/:uid" element={<ResourceRoute resource="data-updates" />} />
        <Route path="/runs" element={<ResourceRoute resource="runs" />} />
        <Route path="/runs/:uid" element={<ResourceRoute resource="runs" />} />
        <Route path="/namespaces" element={<ResourceRoute resource="namespaces" />} />
        <Route path="/namespaces/:uid" element={<ResourceRoute resource="namespaces" />} />
      </Route>
      <Route element={<RuntimeConfiguredRoutes allowUnavailableSource />}>
        <Route path="/data-sources" element={<ResourceRoute resource="data-sources" />} />
        <Route path="/data-sources/:uid" element={<ResourceRoute resource="data-sources" />} />
      </Route>
      <Route path="*" element={<Navigate replace to="/tables" />} />
    </Routes>
  </ApplicationPage>;

  // A non-admin has one work area. Do not mount an Admin rail, panel or destination.
  if (!isAdmin) return <ApplicationNavigationPanelShell application={metatablesNavigation}
    activeDestinationId={activeDestinationId} menuOpen={menuOpen} onMenuOpenChange={setMenuOpen}
    onNavigate={handleNavigate} panelWidth="254px" presentation="auto" showDestinationDescriptions>
    {content}
  </ApplicationNavigationPanelShell>;

  return <ApplicationNavigationShell
    activeApplicationId={activeApplicationId}
    activeDestinationId={activeDestinationId}
    applications={applications}
    collapsed={railCollapsed}
    onCollapsedChange={setRailCollapsed}
    expandedWidth="160px"
    menuOpen={menuOpen}
    onMenuOpenChange={setMenuOpen}
    onNavigate={handleNavigate}
    openApplicationId={applications.some(item => item.id === openApplicationId) ? openApplicationId : activeApplicationId}
    onOpenApplicationChange={setOpenApplicationId}
    overlayTrigger="floating"
    panelWidth="254px"
    presentation="auto"
    showDestinationDescriptions
  >
    {content}
  </ApplicationNavigationShell>;
}

export default function App() {
  const runtime = useMetaTablesRuntime();
  if (runtime.status !== "ready") return <ApplicationStatusScreen
    variant="viewport"
    title={runtime.status === "error" ? "MetaTables Admin unavailable" : "Preparing MetaTables Admin"}
    message={runtime.message}
    state={runtime.status === "error" ? "error" : "loading"}
    action={runtime.status === "error" ? { label: "Retry", onSelect: () => window.location.reload() } : undefined}
  />;
  return <RuntimeContextProvider key={runtime.generation}><AuthorizedApplication /></RuntimeContextProvider>;
}

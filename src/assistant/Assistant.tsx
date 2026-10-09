import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ChatEngineProvider,
  ChatLauncher,
  ChatPageLayout,
  ChatRail,
  ChatThread,
  createChatBackendConnection,
  createLocalAgentSource,
  ModelProviderSettings,
  useChatEngine,
  type AgentSessionExplorerAgent,
  type ChatAuth,
  type ChatNotice,
  type ChatThreadCopy,
  type ChatViewer,
} from "@dev-mainsequence/command-center-ai";
import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import type { StaticSiteIframeClient } from "@dev-mainsequence/command-center-sdk/embed";
import { ApplicationStatusScreen } from "@dev-mainsequence/command-center-sdk/feedback";
import { ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { ASSISTANT_NAME, ASSISTANT_PATH, type AssistantConfiguration } from "./config";
import type { AssistantRoutes } from "./routes";

export interface AssistantExperienceProps {
  config: AssistantConfiguration;
  /** Command Center's iframe client; null on a local top-level page. */
  hostClient: StaticSiteIframeClient | null;
  /** The person Command Center says is signed in; null on a local top-level page. */
  hostUserUid: string | null;
  /** The person the MetaTables API serves. */
  runtimeUserUid: string | null;
  routes: AssistantRoutes;
  /** Whether the open rail docks beside the application rather than floating over it. */
  docked: boolean;
  /**
   * Where the assistant draws inside the application's layout: the page slot in the shell, present
   * only at `/assistant`, and the rail slot beside the shell. The application's own page is never
   * the assistant's child, so loading the assistant never remounts it.
   */
  slots: { page: HTMLElement | null; rail: HTMLElement | null };
}

const copy: Partial<ChatThreadCopy> = {
  emptyTitle: `Ask the ${ASSISTANT_NAME}`,
  emptyDescription: "Find tables, see how they relate, and query them read-only. It reads only what you can read.",
  composerPlaceholder: "Ask about your MetaTables…",
  disclaimer: `The ${ASSISTANT_NAME} can make mistakes. Verify important outputs before acting.`,
};

// The person the scripted stand-in serves by default.
const STAND_IN_USER_UID = "00000000-0000-4000-8000-000000000001";

function useNotice() {
  const [notice, setNotice] = useState<ChatNotice | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return [notice, setNotice] as const;
}

function AssistantNotice({ notice }: { notice: ChatNotice | null }) {
  if (!notice) return null;
  return <div className="metatables-assistant-notice" role="status">
    <strong>{notice.title}</strong>
    {notice.description && <span>{notice.description}</span>}
  </div>;
}

function AssistantUnavailable({ message, retry }: { message: string; retry?: () => void }) {
  return <ApplicationStatusScreen variant="contained" state="error" title="Assistant unavailable" message={message}
    action={retry ? { label: "Retry", onSelect: retry } : undefined} />;
}

export function AssistantExperience(props: AssistantExperienceProps) {
  if (props.config.mode === "local") return <LocalAssistantExperience {...props} basePath={props.config.basePath} />;
  if (props.config.mode === "platform") return <PlatformAssistantExperience {...props} config={props.config} />;
  return <UnavailableAssistantExperience {...props} message={props.config.message} />;
}

/** Without an Agent the page shows no launcher; the expanded rail's route says why. */
function UnavailableAssistantExperience({ message, slots }: AssistantExperienceProps & { message: string }) {
  useEffect(() => { if (import.meta.env.DEV) console.info(message); }, [message]);
  return slots.page && createPortal(<AssistantUnavailable message={message} />, slots.page);
}

/**
 * The rail, the launcher, and the expanded rail, all Command Center AI's, over whichever engine is
 * mounted: the platform's Analyst or an `ms-tau` Agent on this machine.
 */
function AssistantSurfaces({ agents, docked, notice, onOpenProviders, providersPage, routes, slots, viewer }: {
  agents?: AgentSessionExplorerAgent[];
  docked: boolean;
  notice: ChatNotice | null;
  /** Absent for a source without provider settings. */
  onOpenProviders?: () => void;
  providersPage?: ReactNode;
  routes: AssistantRoutes;
  slots: AssistantExperienceProps["slots"];
  viewer: ChatViewer;
}) {
  const engine = useChatEngine();
  const railShown = routes.railOpen && !routes.expanded;
  const { creatingFrom, openSession } = routes;

  // The engine selected the session New session started; the URL names it.
  useEffect(() => {
    if (creatingFrom !== undefined && engine.currentSessionId && engine.currentSessionId !== creatingFrom) {
      openSession(engine.currentSessionId);
    }
  }, [creatingFrom, engine.currentSessionId, openSession]);
  const page = routes.providers && providersPage
    ? providersPage
    : <div className="metatables-assistant-page">
        <ChatPageLayout
          explorer={{ agents, onOpenSession: routes.openSession }}
          onCreateSession={() => routes.startNewSession(engine.currentSessionId)}
          onMinimize={routes.minimize}
        >
          <ChatThread copy={copy} surface="page" viewer={viewer} onOpenModelProviderSettings={onOpenProviders} />
        </ChatPageLayout>
      </div>;

  return <>
    {slots.page && createPortal(page, slots.page)}
    {railShown && slots.rail && createPortal(<ChatRail
      title={ASSISTANT_NAME}
      subtitle="Finds, explains and queries MetaTables, read-only."
      mode={docked ? "docked" : "overlay"}
      onExpand={() => routes.expand(engine.isDefaultSession ? null : engine.currentSessionId)}
      onClose={routes.closeRail}
    >
      <ChatThread copy={copy} surface="overlay" viewer={viewer} onOpenModelProviderSettings={onOpenProviders} />
    </ChatRail>, slots.rail)}
    {!routes.expanded && !routes.railOpen && <ChatLauncher label={`Ask the ${ASSISTANT_NAME}`} onClick={routes.openRail} />}
    <AssistantNotice notice={notice} />
  </>;
}

/**
 * An `ms-tau` Agent on this machine (Command Center AI ADR 099), for local development only. The dev
 * server forwards `basePath` to it with the SDK's `localAgentProxy()`; there is no platform session,
 * and the Agent acts as the developer who started it.
 */
function LocalAssistantExperience({ basePath, docked, routes, runtimeUserUid, slots }: AssistantExperienceProps & { basePath: string }) {
  const navigate = useNavigate();
  const [notice, setNotice] = useNotice();
  const source = useMemo(() => createLocalAgentSource({ baseUrl: basePath, displayName: ASSISTANT_NAME, userUid: runtimeUserUid }),
    [basePath, runtimeUserUid]);

  // A local Agent has no provider settings: the runtime uses the developer's platform account.
  useEffect(() => { if (routes.providers) navigate(ASSISTANT_PATH); }, [navigate, routes.providers]);

  return <ChatEngineProvider
    source={source}
    isVisible={routes.expanded || routes.railOpen}
    notify={setNotice}
    onRequestVisible={routes.openRail}
    requestedSessionId={routes.requestedSessionId}
    viewContext={{ application: "metatables-admin", path: routes.expanded ? routes.returnLocation : routes.path }}
  >
    <AssistantSurfaces
      docked={docked}
      notice={notice}
      routes={routes}
      slots={slots}
      viewer={{ uid: runtimeUserUid ?? undefined }}
    />
  </ChatEngineProvider>;
}

type Identity = { uid: string | null; error: string | null };

/** Who the conversation is for: Command Center's person, the developer, or the stand-in's person. */
function usePlatformIdentity(sender: "host" | "local-proxy" | "stand-in", hostUserUid: string | null, runtimeUserUid: string | null) {
  const hostIdentity = useMemo<Identity>(() => {
    if (!hostUserUid) return { uid: null, error: "Command Center did not say who is signed in. Reopen MetaTables from Command Center." };
    if (runtimeUserUid && runtimeUserUid !== hostUserUid) {
      return { uid: null, error: "MetaTables and Command Center are signed in as different people. Reopen MetaTables from Command Center." };
    }
    return { uid: hostUserUid, error: null };
  }, [hostUserUid, runtimeUserUid]);
  const [proxyIdentity, setProxyIdentity] = useState<Identity>({ uid: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (sender !== "local-proxy") return;
    const controller = new AbortController();
    setProxyIdentity({ uid: null, error: null });
    void fetch("/__mainsequence__/api/v1/users/me/", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 503
          ? "Sign in with npx command-center-sdk login, then restart Vite."
          : `Platform sign-in is unavailable (${response.status}).`);
        const payload: unknown = await response.json();
        const uid = typeof payload === "object" && payload !== null && "uid" in payload ? String((payload as { uid: unknown }).uid) : null;
        if (!uid) throw new Error("The platform did not say who is signed in.");
        if (!controller.signal.aborted) setProxyIdentity({ uid, error: null });
      })
      .catch(error => {
        if (!controller.signal.aborted) setProxyIdentity({ uid: null, error: error instanceof Error ? error.message : "Platform sign-in is unavailable." });
      });
    return () => controller.abort();
  }, [sender, attempt]);

  const identity = sender === "host" ? hostIdentity : sender === "stand-in" ? { uid: STAND_IN_USER_UID, error: null } : proxyIdentity;
  return { identity, retry: sender === "local-proxy" ? () => setAttempt(value => value + 1) : undefined };
}

function PlatformAssistantExperience(props: AssistantExperienceProps & { config: Extract<AssistantConfiguration, { mode: "platform" }> }) {
  const { config, docked, hostClient, hostUserUid, routes, runtimeUserUid, slots } = props;
  const [notice, setNotice] = useNotice();
  const { identity, retry } = usePlatformIdentity(config.sender, hostUserUid, runtimeUserUid);
  const auth = useMemo<ChatAuth>(() => ({ userUid: identity.uid ?? "" }), [identity.uid]);
  const agents = useMemo<AgentSessionExplorerAgent[]>(() => [{ uid: config.agentUid, name: ASSISTANT_NAME }], [config.agentUid]);
  const connection = useMemo(() => createChatBackendConnection({
    // The sender uses only the URL's path; this base URL carries no credential.
    apiBaseUrl: window.location.origin,
    sendPlatformRequest: async request => {
      if (config.sender === "host") {
        if (!hostClient) throw new Error("The Command Center platform connection is unavailable.");
        return hostClient.sendPlatformRequest(request);
      }
      if (config.sender === "stand-in") {
        // The stand-in replaced `fetch` and takes any bearer token.
        const headers = new Headers(request.headers);
        headers.set("Authorization", "Bearer stand-in");
        return fetch(new Request(request, { headers }));
      }
      const { pathname, search } = new URL(request.url);
      const headers = new Headers();
      for (const name of ["accept", "content-type"]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      return fetch(`/__mainsequence__${pathname}${search}`, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
        signal: request.signal,
      });
    },
  }), [config.sender, hostClient]);

  if (!identity.uid) {
    const blocked = identity.error
      ? <AssistantUnavailable message={identity.error} retry={retry} />
      : <ApplicationStatusScreen variant="contained" state="loading" title="Connecting to the assistant" message="Checking who is signed in." />;
    return <>{slots.page && createPortal(blocked, slots.page)}<AssistantNotice notice={notice} /></>;
  }

  const providersPage = <ApplicationPageStack className="metatables-assistant-providers">
    <ApplicationPageHeader title="Model providers" description={`The models the ${ASSISTANT_NAME} can use for you.`}
      actions={<>
        <Button onClick={routes.openConversation}>Back to the conversation</Button>
        <Button onClick={routes.minimize}>Minimize</Button>
      </>} />
    <ModelProviderSettings auth={auth} connection={connection} notify={setNotice} />
  </ApplicationPageStack>;

  return <ChatEngineProvider
    auth={auth}
    connection={connection}
    defaultSession={{ agentUid: config.agentUid, handleUniqueId: "metatables_analyst", name: ASSISTANT_NAME, status: "ready" }}
    environmentUid={config.environmentUid}
    isVisible={routes.expanded || routes.railOpen}
    notify={setNotice}
    onRequestVisible={routes.openRail}
    onRequestedSessionRemoved={routes.dropSession}
    requestedSessionId={routes.requestedSessionId}
    showsDefaultSession={routes.showsDefaultSession}
    viewContext={{ application: "metatables-admin", path: routes.expanded ? routes.returnLocation : routes.path }}
  >
    <AssistantSurfaces
      agents={agents}
      docked={docked}
      notice={notice}
      onOpenProviders={routes.openProviders}
      providersPage={providersPage}
      routes={routes}
      slots={slots}
      viewer={{ uid: identity.uid }}
    />
  </ChatEngineProvider>;
}

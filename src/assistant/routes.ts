import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ASSISTANT_PATH, ASSISTANT_PROVIDERS_PATH, isAssistantPath } from "./config";

const DEFAULT_RETURN_LOCATION = "/tables";
// The rail docks beside the application from this width and floats over it below.
const DOCKED_RAIL_QUERY = "(min-width: 1400px)";

function requestedSession(search: string): string | null {
  return new URLSearchParams(search).get("session");
}

export function useDockedRail() {
  // The application also renders on the server in tests, where there is no window.
  const [docked, setDocked] = useState(() => typeof window !== "undefined" && window.matchMedia(DOCKED_RAIL_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(DOCKED_RAIL_QUERY);
    const update = () => setDocked(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return docked;
}

/**
 * Where the assistant is on screen: the rail beside a page, or the expanded rail at `/assistant`.
 * The application owns this state, so it outlives loading the assistant's module and its engine.
 */
export function useAssistantRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const here = location.pathname + location.search + location.hash;
  const expanded = isAssistantPath(location.pathname);
  const providers = location.pathname === ASSISTANT_PROVIDERS_PATH;
  const [railOpen, setRailOpen] = useState(false);
  const [returnLocation, setReturnLocation] = useState(DEFAULT_RETURN_LOCATION);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() =>
    location.pathname === ASSISTANT_PATH ? requestedSession(location.search) : null);
  // While New session starts one, the session that was on screen; undefined otherwise.
  const [creatingFrom, setCreatingFrom] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (expanded) setRailOpen(false);
    else setReturnLocation(here);
    if (location.pathname === ASSISTANT_PATH) setSelectedSessionId(requestedSession(location.search));
  }, [expanded, here, location.pathname, location.search]);

  const sessionPath = (sessionId: string | null) =>
    sessionId ? `${ASSISTANT_PATH}?session=${encodeURIComponent(sessionId)}` : ASSISTANT_PATH;
  const openSession = (sessionId: string) => {
    setCreatingFrom(undefined);
    setSelectedSessionId(sessionId);
    navigate(sessionPath(sessionId));
  };

  return {
    expanded,
    providers,
    path: here,
    railOpen,
    returnLocation,
    selectedSessionId,
    creatingFrom,
    // As in Command Center: the rail and a bare `/assistant` show the default session, which the
    // engine pins to its handle; `?session=` and a session New session started show their own.
    showsDefaultSession: railOpen || (expanded && !selectedSessionId && creatingFrom === undefined),
    requestedSessionId: expanded ? selectedSessionId : null,
    openRail: () => {
      if (expanded) navigate(returnLocation);
      setRailOpen(true);
    },
    closeRail: () => setRailOpen(false),
    expand: (sessionId: string | null) => {
      setSelectedSessionId(sessionId);
      setRailOpen(false);
      navigate(sessionPath(sessionId));
    },
    minimize: () => {
      navigate(isAssistantPath(new URL(returnLocation, window.location.origin).pathname) ? DEFAULT_RETURN_LOCATION : returnLocation);
      setRailOpen(true);
    },
    openSession,
    // New session: leave the default session so the engine keeps the one it starts.
    startNewSession: (currentSessionId: string | null) => {
      setCreatingFrom(currentSessionId);
      setSelectedSessionId(null);
      navigate(ASSISTANT_PATH, { replace: true });
    },
    dropSession: () => {
      setSelectedSessionId(null);
      if (expanded) navigate(ASSISTANT_PATH, { replace: true });
    },
    openConversation: () => navigate(sessionPath(selectedSessionId)),
    openProviders: () => {
      setRailOpen(false);
      navigate(ASSISTANT_PROVIDERS_PATH);
    },
  };
}

export type AssistantRoutes = ReturnType<typeof useAssistantRoutes>;

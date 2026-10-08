import type { RuntimeContext } from "../api";

/**
 * Where the MetaTables Analyst conversation comes from. The deployed site talks to the Analyst the
 * MetaTables API names in `/runtime-context/`, in the API's Environment, through Command Center. A
 * local top-level page can use the scripted stand-in (`?stand-in`), an `ms-tau` Agent on this
 * machine, or the platform through the dev server.
 */
export type AssistantConfiguration =
  | { mode: "platform"; agentUid: string; environmentUid: string; sender: "host" | "local-proxy" | "stand-in" }
  | { mode: "local"; basePath: typeof LOCAL_AGENT_PATH }
  | { mode: "unavailable"; message: string };

export const ASSISTANT_NAME = "MetaTables Analyst";
// The expanded rail and its model provider settings.
export const ASSISTANT_PATH = "/assistant";
export const ASSISTANT_PROVIDERS_PATH = "/assistant/providers";
// Matches `localAgentProxy({ path })` in vite.config.ts.
export const LOCAL_AGENT_PATH = "/tau";
// The stand-in answers for any Agent, person and Environment; these are its defaults.
const STAND_IN_AGENT_UID = "00000000-0000-4000-8000-000000000003";
const STAND_IN_ENVIRONMENT_UID = "00000000-0000-4000-8000-000000000002";

export function isAssistantPath(pathname: string) {
  return pathname === ASSISTANT_PATH || pathname.startsWith(`${ASSISTANT_PATH}/`);
}

/** The Analyst the API's branch deploys and the API's Environment, when the API verified both. */
export function hostedAssistant(runtime: Pick<RuntimeContext, "hosted_agent" | "hosted_environment">) {
  const agent = runtime.hosted_agent;
  const environment = runtime.hosted_environment;
  return agent?.status === "verified" && agent.uid && environment?.status === "verified" && environment.uid
    ? { agentUid: agent.uid, environmentUid: environment.uid }
    : null;
}

export function assistantConfiguration(
  embedded: boolean,
  search: string,
  hosted: { agentUid: string; environmentUid: string } | null,
): AssistantConfiguration {
  if (import.meta.env.DEV && !embedded) {
    if (new URLSearchParams(search).has("stand-in")) {
      return { mode: "platform", agentUid: STAND_IN_AGENT_UID, environmentUid: STAND_IN_ENVIRONMENT_UID, sender: "stand-in" };
    }
    if (import.meta.env.VITE_METATABLES_ASSISTANT_SOURCE === "local") return { mode: "local", basePath: LOCAL_AGENT_PATH };
    if (hosted) return { mode: "platform", ...hosted, sender: "local-proxy" };
    return {
      mode: "unavailable",
      message: "Run the MetaTables API in developer mode to use its Analyst, set VITE_METATABLES_ASSISTANT_SOURCE=local in .env.development.local to talk to ms-tau on this machine, or open the page with ?stand-in.",
    };
  }
  if (hosted) return { mode: "platform", ...hosted, sender: "host" };
  return { mode: "unavailable", message: `The ${ASSISTANT_NAME} is not set up for this Environment.` };
}

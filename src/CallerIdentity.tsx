import "./callerIdentity.css";

import { Bot, ChevronDown, User } from "lucide-react";
import { metaTablesApi, type AdmittedCaller } from "./api";
import { callerMatch } from "./apiContract";
import { useRuntimeContext } from "./runtimeContext";
import { Badge, useRemote } from "./ui";

const IDENTIFIED_BY: Record<AdmittedCaller["identified_by"], string> = {
  caller_assertion: "Platform-signed caller assertion",
  local_sdk_session: "Local SDK session",
  developer_sdk_session: "Developer SDK session",
};

/**
 * The signed-in user as the API admitted it (`GET /caller/`), never as this page assumes it.
 * Command Center's own user is used only to check the two agree.
 */
export function CallerIdentity({ hostUserUid }: { hostUserUid: string | null }) {
  const { runtime } = useRuntimeContext();
  const remote = useRemote(`caller-${runtime.runtime_instance_id ?? "hosted"}-${hostUserUid ?? "local"}`, signal => metaTablesApi.caller(signal));
  if (remote.status === "loading") return <div className="mt-caller" role="status"><span className="mt-caller__pending">Checking who the API sees…</span></div>;
  if (remote.status === "error" || typeof remote.data?.user_uid !== "string")
    return <div className="mt-caller" role="status"><Badge tone="danger">The API could not say who you are</Badge></div>;
  const caller = remote.data;
  const teams = caller.teams ?? [];
  const match = callerMatch(caller, hostUserUid);
  const Icon = caller.identity_type === "workload" ? Bot : User;
  const name = caller.name ?? `User ${caller.user_uid.slice(0, 8)}`;
  return <div className="mt-caller">
    <details className="mt-caller__box">
      <summary aria-label={`Signed in as ${name}, as the API sees it`}>
        <Icon size={15} aria-hidden="true" />
        <span className="mt-caller__name">{name}</span>
        {caller.is_admin && <Badge tone="accent">Admin</Badge>}
        {match === true && <Badge tone="success">Verified</Badge>}
        {match === false && <Badge tone="danger">Different user</Badge>}
        <ChevronDown size={14} aria-hidden="true" className="mt-caller__chevron" />
      </summary>
      <div className="mt-caller__panel">
        <span className="mt-caller__heading">The MetaTables API admitted this request as</span>
        <dl className="mt-caller__facts">
          <div><dt>Name</dt><dd>{caller.name ?? "Not in your directory"}</dd></div>
          {caller.email && <div><dt>Email</dt><dd>{caller.email}</dd></div>}
          <div><dt>User UID</dt><dd className="mt-caller__mono">{caller.user_uid}</dd></div>
          <div><dt>Kind</dt><dd>{caller.identity_type === "workload" ? "Workload" : caller.identity_type === "person" ? "Person" : "Unknown"}</dd></div>
          <div><dt>Admin</dt><dd>{caller.is_admin ? "Yes, Organization admin" : "No"}</dd></div>
          <div><dt>Teams</dt><dd>{teams.length ? teams.map(team => team.name ?? `Team ${team.uid.slice(0, 8)}`).join(", ") : "None"}</dd></div>
          <div><dt>Identified by</dt><dd>{IDENTIFIED_BY[caller.identified_by] ?? caller.identified_by}</dd></div>
          <div><dt>Command Center</dt><dd>{match === null ? "Not embedded; nothing to compare"
            : match ? "Same user as your Command Center session" : `Command Center is signed in as ${hostUserUid}`}</dd></div>
        </dl>
      </div>
    </details>
  </div>;
}

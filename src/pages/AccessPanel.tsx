import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { Link } from "react-router-dom";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { DataTable, ResourceActionConfirmationDialog } from "@dev-mainsequence/command-center-sdk/views";
import {
  ApiError, metaTablesApi, type AccessBinding, type AccessChanges, type AccessDocument, type AccessEvent, type AccessExplanation,
  type AccessObjectKind, type AccessRole, type AccessRoleCatalog, type MyAccess, type PrincipalSearch,
} from "../api";
import {
  accessAction, can, canRevoke, catalogFor, grantableRoles, grantChange, isWorkload, managesCreator, parsePrincipalKey,
  principalDirectory, principalKey, principalName, revokeChange, roleDefinition, roleLabel, sourceLabel, withFoundPrincipals,
  workloadName, type DirectoryEntry,
} from "../accessRoles";
import { detailPath } from "../navigation";
import { useRuntimeContext } from "../runtimeContext";
import { Badge, Button, DetailSection, Facts, formatDate, Picker, RemoteContent, StatePanel, useRemote, type RemoteState } from "../ui";
import "./sharing.css";

const noneFound: PrincipalSearch = { users: [], teams: [] };
const SELF = "self";

type Pending =
  | { type: "grant"; key: string; role: AccessRole; current: AccessRole | null }
  | { type: "revoke"; key: string; role: AccessRole };

/**
 * A namespace's or table's Access panel: the caller's own role and where it comes from, every
 * binding with its role texts, granting and revoking against the access revision, Explain, and a
 * table's access history. Buttons follow the caller's allowed actions from `access/me/`.
 */
export function AccessPanel({ kind, uid, namespaceName }: { kind: AccessObjectKind; uid: string; namespaceName?: string | null }) {
  const { runtime } = useRuntimeContext();
  const [generation, setGeneration] = useState(0);
  const catalog = useRemote("access-roles", signal => metaTablesApi.accessRoles(signal));
  const me = useRemote(`access-me-${kind}-${uid}-${generation}`, signal => metaTablesApi.myAccess(kind, uid, signal));
  const mayRead = me.status === "ready" && can(me.data.allowed_actions, accessAction(kind, "get_access"));
  // Bindings and candidates need get_access; without it the panel shows the caller's own access.
  const access = useRemote(`access-${kind}-${uid}-${generation}-${mayRead}`,
    async signal => ({ read: mayRead, document: mayRead ? await metaTablesApi.access(kind, uid, signal) : null }));
  const [found, setFound] = useState<PrincipalSearch>(noneFound);
  const [message, setMessage] = useState<string | null>(null);

  const reload = (note: string | null = null) => { setMessage(note); setGeneration(value => value + 1); };
  const state: RemoteState<{ catalog: AccessRoleCatalog; me: MyAccess; document: AccessDocument | null }> =
    catalog.status === "error" ? catalog : me.status === "error" ? me : access.status === "error" ? access
      : catalog.status === "ready" && me.status === "ready" && access.status === "ready" && access.data.read === mayRead
        ? { status: "ready", data: { catalog: catalog.data, me: me.data, document: access.data.document } } : { status: "loading" };

  return <ApplicationPageStack data-security-access>
    <DetailSection title="Access" description={kind === "namespace"
      ? "Roles on this namespace also apply to every table in it, including tables added later."
      : "Roles on this table, and the roles its namespace gives on it."}>
      {message && <div role="status"><Badge tone="success">Saved</Badge><p>{message}</p></div>}
      <RemoteContent state={state}>{data => <AccessContent key={generation} kind={kind} uid={uid} namespaceName={namespaceName}
        catalog={data.catalog} me={data.me} document={data.document} callerUid={runtime.user_uid}
        found={found} onFound={result => setFound(current => ({ users: [...current.users, ...result.users], teams: [...current.teams, ...result.teams] }))}
        onChanged={reload} />}</RemoteContent>
    </DetailSection>
  </ApplicationPageStack>;
}

function AccessContent({ kind, uid, namespaceName, catalog, me, document, callerUid, found, onFound, onChanged }: {
  kind: AccessObjectKind; uid: string; namespaceName?: string | null; catalog: AccessRoleCatalog; me: MyAccess;
  document: AccessDocument | null; callerUid?: string; found: PrincipalSearch;
  onFound: (result: PrincipalSearch) => void; onChanged: (message: string | null) => void;
}) {
  const roles = catalogFor(catalog, kind).roles;
  const candidates = withFoundPrincipals({ candidate_users: document?.candidate_users ?? [], candidate_teams: document?.candidate_teams ?? [] }, found);
  const bound = [...(document?.bindings ?? []), ...(document?.inherited ?? []), ...me.sources];
  const directory = principalDirectory({ users: candidates.candidate_users, teams: candidates.candidate_teams }, bound, callerUid);
  const canManage = document?.can_manage === true;
  const creatorManager = managesCreator(me.sources);
  const creatorUid = document?.created_by_workload_uid ?? null;
  const revision = document?.revision ?? me.revision;
  const [pending, setPending] = useState<Pending | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const grantForm = useRef<GrantFormHandle>(null);

  async function apply(changes: AccessChanges, done: string) {
    setWorking(true); setError(null); setConflict(false);
    try { await metaTablesApi.changeAccess(kind, uid, changes); setPending(null); onChanged(done); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "The access change failed.");
      setConflict(cause instanceof ApiError && cause.status === 409);
    }
    finally { setWorking(false); }
  }
  function confirm() {
    if (!pending) return;
    const principal = parsePrincipalKey(pending.key);
    const name = principalName(directory, principal.principal_kind, principal.principal_uid);
    const self = principal.principal_kind === "user" && principal.principal_uid === callerUid;
    return pending.type === "grant"
      ? apply(grantChange(revision, principal, pending.role), `${name} now holds ${roleLabel(pending.role)}.`)
      : apply(revokeChange(revision, principal), `${self ? "You no longer hold" : `${name} no longer holds`} ${roleLabel(pending.role)} here.`);
  }

  const pendingPrincipal = pending ? parsePrincipalKey(pending.key) : null;
  const pendingName = pendingPrincipal ? principalName(directory, pendingPrincipal.principal_kind, pendingPrincipal.principal_uid) : "";
  const pendingSelf = pendingPrincipal?.principal_kind === "user" && pendingPrincipal.principal_uid === callerUid;
  const pendingDefinition = pending ? roleDefinition(catalog, kind, pending.role) : null;
  const bindingColumns = (actions: boolean) => [
    { id: "principal", header: "User or Team", importance: "primary" as const, renderCell: (binding: AccessBinding) => <PrincipalCell entry={directory.get(principalKey(binding.principal_kind, binding.principal_uid))} /> },
    { id: "role", header: "Role", importance: "primary" as const, renderCell: (binding: AccessBinding) => <RoleCell role={binding.role} summary={roleDefinition(catalog, kind, binding.role)?.summary} /> },
    { id: "source", header: "Source", importance: "secondary" as const, renderCell: (binding: AccessBinding) => binding.source === "namespace"
      ? <>{"Namespace "}{binding.namespace_uid ? <Link to={detailPath("namespaces", binding.namespace_uid, "permissions")}>{namespaceName ?? "namespace"}</Link> : namespaceName}</>
      : "Direct" },
    { id: "granted-by", header: "Granted by", importance: "secondary" as const, renderCell: (binding: AccessBinding) => binding.granted_by_user_uid ? principalName(directory, "user", binding.granted_by_user_uid) : "System" },
    { id: "when", header: "When", importance: "tertiary" as const, renderCell: (binding: AccessBinding) => formatDate(binding.updated_at ?? binding.created_at) },
    ...(actions ? [{ id: "actions", header: "Actions", importance: "secondary" as const, renderCell: (binding: AccessBinding) => {
      const key = principalKey(binding.principal_kind, binding.principal_uid);
      const revocable = canRevoke(binding, { canManage, callerUid, directory });
      const changeable = canManage || isWorkload(directory.get(key)) && directory.get(key)?.managed_by_caller === true;
      return <div className="sharing-status">
        {changeable && <Button size="small" disabled={working} onClick={() => grantForm.current?.edit(key, binding.role)}>Change role</Button>}
        {revocable && <Button size="small" variant="secondary" disabled={working} onClick={() => setPending({ type: "revoke", key, role: binding.role })}>Revoke</Button>}
      </div>;
    } }] : []),
  ];

  return <ApplicationPageStack>
    {error && <div role="alert"><Badge tone="danger">Could not change access</Badge><p>{error}</p>
      {conflict && <Button size="small" onClick={() => onChanged(null)}>Reload access</Button>}</div>}
    <YourAccess kind={kind} catalog={catalog} me={me} directory={directory} namespaceName={namespaceName} creatorManager={creatorManager}
      disabled={working} onLeave={(principalUid, role) => setPending({ type: "revoke", key: principalKey("user", principalUid), role })} />
    {document && <DetailSection title="Who has access" titleAs="h3" description={canManage
      ? "Grant, change or revoke roles. Each change is checked against the access you loaded."
      : "Only owners decide who has access. You can revoke your own role and change the workloads you manage."}>
      {creatorUid && <p>{"Created by the workload "}<strong>{workloadName(directory, creatorUid)}</strong>
        {". The people who manage it decide who has access here, owner included, without access to its tables."}</p>}
      <DataTable items={document.bindings} getId={binding => binding.uid} presentation="auto" emptyContent={`No one holds a role on this ${kind} directly.`} columns={bindingColumns(true)} />
    </DetailSection>}
    {document && document.inherited.length > 0 && <DetailSection title="From the namespace" titleAs="h3"
      description="These roles are granted on the namespace and apply here. Change them on the namespace's Access panel.">
      <DataTable items={document.inherited} getId={binding => binding.uid} presentation="auto" columns={bindingColumns(false)} />
    </DetailSection>}
    <GrantForm ref={grantForm} kind={kind} catalog={catalog} me={me} directory={directory} canManage={canManage} creatorManager={creatorManager}
      bindings={document?.bindings ?? []} disabled={working} onFound={onFound}
      onReview={(key, role, current) => setPending({ type: "grant", key, role, current })} />
    <ExplainAccess kind={kind} uid={uid} catalog={catalog} directory={directory} others={Boolean(document)} namespaceName={namespaceName}
      callerUid={callerUid} creatorUid={creatorUid} />
    {kind === "table" && document && <AccessHistory uid={uid} directory={directory} />}
    {pending && pendingDefinition && <ResourceActionConfirmationDialog
      actionLabel={pending.type === "grant" ? `Grant ${roleLabel(pending.role)} to ${pendingName}` : pendingSelf ? `Remove your ${roleLabel(pending.role)} role` : `Revoke ${pendingName}'s ${roleLabel(pending.role)} role`}
      title={pending.type === "grant" ? `Grant ${roleLabel(pending.role)}` : `Revoke ${roleLabel(pending.role)}`}
      description={pending.type === "grant" ? pendingDefinition.summary
        : `${pendingSelf ? "You lose" : `${pendingName} loses`} the ${roleLabel(pending.role)} role on this ${kind}. Roles through Teams${kind === "table" ? " or the namespace" : ""} still apply.`}
      warning={pending.type === "grant" ? pendingDefinition.impact : undefined}
      selectionLabel={pending.type === "grant" && pending.current ? `Replaces ${pendingName}'s current role, ${roleLabel(pending.current)}.` : undefined}
      tone={pending.type === "revoke" ? "danger" : "default"} confirmationValue="" onConfirmationValueChange={() => {}}
      confirmButtonLabel={pending.type === "grant" ? "Grant role" : "Revoke role"} pending={working} presentation="auto"
      error={error ?? undefined} onClose={() => { setPending(null); setError(null); }} onConfirm={confirm}>
      {pending.type === "grant" && <RoleTexts definition={pendingDefinition} />}
    </ResourceActionConfirmationDialog>}
  </ApplicationPageStack>;
}

function PrincipalCell({ entry }: { entry?: DirectoryEntry }) {
  if (!entry) return <>Unavailable user</>;
  const kind = entry.kind === "team" ? "Team" : !entry.available ? "Not in your directory" : isWorkload(entry) ? "Workload" : "Person";
  return <span className="access-principal"><strong>{entry.name}</strong><small className="muted">{kind}</small></span>;
}

function RoleCell({ role, summary }: { role: AccessRole; summary?: string }) {
  return <span className="access-principal"><span><Badge tone={role === "owner" ? "accent" : "neutral"}>{roleLabel(role)}</Badge></span>
    {summary && <small className="muted">{summary}</small>}</span>;
}

function RoleTexts({ definition }: { definition: { summary: string; impact: string; not_included: string } }) {
  return <Facts items={[
    { label: "Allows", value: definition.summary },
    { label: "Can cause", value: definition.impact },
    { label: "Not included", value: definition.not_included },
  ]} />;
}

function YourAccess({ kind, catalog, me, directory, namespaceName, creatorManager, disabled, onLeave }: {
  kind: AccessObjectKind; catalog: AccessRoleCatalog; me: MyAccess; directory: ReadonlyMap<string, DirectoryEntry>;
  namespaceName?: string | null; creatorManager: boolean; disabled: boolean; onLeave: (principalUid: string, role: AccessRole) => void;
}) {
  const definition = roleDefinition(catalog, kind, me.role);
  // A manager of the creating workload holds no role, yet decides who has access.
  const description = `${definition?.summary ?? `You hold no role on this ${kind}.`}${creatorManager
    ? " You manage the workload that created it, so you decide who has access here, owner included, without access to its tables." : ""}`;
  return <DetailSection title="Your access" titleAs="h3" description={description}>
    <div className="sharing-status" role="status">
      <Badge tone={me.role === "owner" ? "accent" : "neutral"}>{`Your role: ${me.role ? roleLabel(me.role) : "No role"}`}</Badge>
      <span className="muted">{me.allowed_actions.length ? `Allowed: ${me.allowed_actions.join(", ")}` : "No actions allowed."}</span>
    </div>
    {me.sources.length > 0 && <DataTable items={me.sources} getId={source => source.grant_uid ?? source.source} presentation="auto" columns={[
      { id: "source", header: "From", importance: "primary", renderCell: source => sourceLabel(source, { directory, namespaceName }) },
      { id: "role", header: "Role", importance: "secondary", renderCell: source => source.role ? <Badge>{roleLabel(source.role)}</Badge>
        : <span className="muted">No role</span> },
      { id: "leave", header: "Actions", importance: "secondary", renderCell: source => {
        const { role, principal_uid: principalUid } = source;
        return source.source === "direct" && source.principal_kind === "user" && principalUid && role
          ? <Button size="small" variant="secondary" disabled={disabled} onClick={() => onLeave(principalUid, role)}>Remove my role</Button> : null;
      } },
    ]} />}
  </DetailSection>;
}

type GrantFormHandle = { edit: (key: string, role: AccessRole) => void };

function GrantForm({ ref, kind, catalog, me, directory, canManage, creatorManager, bindings, disabled, onFound, onReview }: {
  ref: Ref<GrantFormHandle>; kind: AccessObjectKind; catalog: AccessRoleCatalog; me: MyAccess;
  directory: ReadonlyMap<string, DirectoryEntry>; canManage: boolean; creatorManager: boolean; bindings: readonly AccessBinding[]; disabled: boolean;
  onFound: (result: PrincipalSearch) => void; onReview: (key: string, role: AccessRole, current: AccessRole | null) => void;
}) {
  const [principal, setPrincipal] = useState<string | null>(null);
  const [role, setRole] = useState<AccessRole | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    edit: (key, current) => { setPrincipal(key); setRole(current); anchor.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); },
  }), []);
  // Without set_access, a caller grants only to the workloads they manage, up to their own role.
  if (!canManage && !me.role) return null;
  const current = new Map(bindings.map(binding => [principalKey(binding.principal_kind, binding.principal_uid), binding.role]));
  const people = [...directory.entries()].filter(([, entry]) => entry.available && (canManage || isWorkload(entry) && entry.managed_by_caller === true))
    .sort(([, a], [, b]) => Number(a.kind === "team") - Number(b.kind === "team") || a.name.localeCompare(b.name));
  const entry = principal ? directory.get(principal) : undefined;
  const options = grantableRoles(catalogFor(catalog, kind).roles, me.role, entry, creatorManager);
  const chosen = options.find(option => option.definition.role === role && !option.reason)?.definition ?? null;

  async function find() {
    const text = query.trim();
    if (!text || searching) return;
    setSearching(true); setNote(null);
    try {
      const result = await metaTablesApi.searchPrincipals(text);
      onFound(result);
      const count = result.users.length + result.teams.length;
      setNote(count ? `${count} found. Choose one under User or Team.` : `No one you can see matches “${text}”.`);
    } catch (cause) { setNote(cause instanceof Error ? cause.message : "Search failed."); }
    finally { setSearching(false); }
  }

  return <div ref={anchor}><DetailSection title="Grant or change a role" titleAs="h3" description={creatorManager
    ? "Choose a person, workload or Team and a role. As a manager of the workload that created this namespace, you can grant any role; owner goes only to people and Teams."
    : canManage ? "Choose a person, workload or Team and a role. Granting replaces the role they hold here."
      : "You can grant a role to the workloads you manage, up to your own role."}>
    <form className="sharing-search" aria-label="Directory search" onSubmit={event => { event.preventDefault(); void find(); }}>
      <Field label="Find people, Teams or workloads" description="Search by name or email, or by a Job, release or Agent name.">
        <Input value={query} maxLength={200} disabled={searching || disabled} onChange={event => setQuery(event.target.value)} />
      </Field>
      <Button type="submit" pending={searching} disabled={!query.trim() || searching || disabled}>Find</Button>
      {note && <p className="muted" role="status">{note}</p>}
    </form>
    <div className="access-grant">
      <Field label="User or Team"><Picker mode="single" ariaLabel="Grant to" value={principal} searchable fullWidth disabled={disabled}
        emptyMessage={canManage ? "No one found. Search the directory above." : "No workload you manage found. Search for it above."}
        options={people.map(([key, person]) => ({ value: key, label: person.name,
          subtitle: person.kind === "team" ? "Team" : isWorkload(person) ? "Workload" : person.email ?? "Person",
          meta: current.has(key) ? roleLabel(current.get(key)) : undefined }))}
        onValueChange={value => { setPrincipal(value); setRole(current.get(value) ?? null); }} /></Field>
      <Field label="Role"><Picker mode="single" ariaLabel="Role to grant" value={role} fullWidth disabled={disabled || !principal}
        options={options.map(({ definition, reason }) => ({ value: definition.role, label: roleLabel(definition.role),
          subtitle: reason ?? definition.summary, disabled: Boolean(reason) }))}
        onValueChange={value => setRole(value as AccessRole)} /></Field>
    </div>
    {chosen && <RoleTexts definition={chosen} />}
    <div className="sharing-status">
      <Button variant="primary" disabled={disabled || !principal || !chosen || current.get(principal) === chosen.role}
        onClick={() => principal && chosen && onReview(principal, chosen.role, current.get(principal) ?? null)}>Review grant</Button>
      {principal && chosen && current.get(principal) === chosen.role && <span className="muted">They already hold this role.</span>}
    </div>
  </DetailSection></div>;
}

function ExplainAccess({ kind, uid, catalog, directory, others, namespaceName, callerUid, creatorUid }: {
  kind: AccessObjectKind; uid: string; catalog: AccessRoleCatalog; directory: ReadonlyMap<string, DirectoryEntry>;
  others: boolean; namespaceName?: string | null; callerUid?: string; creatorUid: string | null;
}) {
  const actions = catalogFor(catalog, kind).actions;
  const [action, setAction] = useState<string | null>(actions[0]?.action ?? null);
  const [subject, setSubject] = useState<string>(SELF);
  const [result, setResult] = useState<AccessExplanation | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const users = [...directory.values()].filter(entry => entry.kind === "user" && entry.available && entry.uid !== callerUid);
  async function explain() {
    if (!action) return;
    setWorking(true); setError(null); setResult(null);
    try { setResult(await metaTablesApi.explainAccess(kind, uid, action, subject === SELF ? undefined : subject)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Explain failed."); }
    finally { setWorking(false); }
  }
  const who = result && subject !== SELF ? principalName(directory, "user", result.user_uid) : "You";
  return <details><summary>Explain access</summary><ApplicationPageStack className="sharing-access-check">
    <p className="muted">{others ? "Why a User can or cannot do an action here, from the roles that apply to them." : "Why you can or cannot do an action here."}</p>
    <Field label="Action"><Picker mode="single" ariaLabel="Action to explain" value={action} fullWidth disabled={working}
      options={actions.map(item => ({ value: item.action, label: item.action, subtitle: item.covers }))}
      onValueChange={value => { setAction(value); setResult(null); }} /></Field>
    {others && <Field label="User"><Picker mode="single" ariaLabel="User to explain" value={subject} searchable fullWidth disabled={working}
      options={[{ value: SELF, label: "You" }, ...users.map(user => ({ value: user.uid, label: user.name, subtitle: isWorkload(user) ? "Workload" : user.email ?? undefined }))]}
      onValueChange={value => { setSubject(value); setResult(null); }} /></Field>}
    <div className="sharing-status"><Button disabled={!action || working} pending={working} onClick={() => void explain()}>Explain</Button></div>
    {error && <StatePanel embedded tone="danger" title="Explain failed">{error}</StatePanel>}
    {result && <div role="status">
      <Badge tone={result.allowed ? "success" : "danger"}>{`${who} ${result.allowed ? "can" : "cannot"} ${result.action}`}</Badge>
      <p>{result.role ? `Role here: ${roleLabel(result.role)}.` : "No role here."}</p>
      {result.sources.map(source => <p key={source.grant_uid ?? source.source}>{source.role
        ? `${roleLabel(source.role)} from ${sourceLabel(source, { directory, namespaceName })}.`
        : `${sourceLabel(source, { directory, namespaceName })}: ${(source.actions ?? []).join(", ")}.`}</p>)}
      {result.admin_status === true && <p>{"You are an Organization admin, which holds every action."}</p>}
      {result.manager_status === true && <p>{"You manage the workload that created this namespace, which lets you see it and decide who has access to it."}</p>}
      {typeof result.manager_status === "string" && creatorUid && <p className="muted">
        {`Whether ${who} manages the workload that created this namespace is not shown; managing it would let them decide who has access here.`}</p>}
      {result.unreadable_team_uids.length > 0 && <p className="muted">
        {`Roles through ${result.unreadable_team_uids.length === 1 ? "one bound Team" : `${result.unreadable_team_uids.length} bound Teams`} whose members you cannot see are not counted.`}</p>}
    </div>}
  </ApplicationPageStack></details>;
}

function AccessHistory({ uid, directory }: { uid: string; directory: ReadonlyMap<string, DirectoryEntry> }) {
  const [events, setEvents] = useState<AccessEvent[] | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    setWorking(true); setError(null);
    try { setEvents(await metaTablesApi.tableAccessHistory(uid)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Access history failed."); }
    finally { setWorking(false); }
  }
  return <details><summary>Access history</summary><ApplicationPageStack>
    <div className="sharing-status"><Button disabled={working} pending={working} onClick={() => void load()}>Load access history</Button></div>
    {error && <StatePanel embedded tone="danger" title="Could not load access history">{error}</StatePanel>}
    {events && <AccessEventTable events={events} directory={directory} />}
  </ApplicationPageStack></details>;
}

/** Role changes, newest first. A principal outside the directory is shown by its UID. */
export function AccessEventTable({ events, directory = new Map() }: { events: AccessEvent[]; directory?: ReadonlyMap<string, DirectoryEntry> }) {
  const name = (value: string | null) => value ? roleLabel(value as AccessRole) : "No role";
  const who = (kind: string, uid: string) => {
    const entry = directory.get(principalKey(kind === "team" ? "team" : "user", uid));
    return entry?.available ? entry.name : `${kind === "team" ? "Team" : "User"} ${uid}`;
  };
  return <DataTable items={events} getId={event => event.uid} presentation="auto" emptyContent="No role changes recorded." columns={[
    { id: "principal", header: "User or Team", importance: "primary", renderCell: event => who(event.principal_kind, event.principal_uid) },
    { id: "change", header: "Change", importance: "secondary", renderCell: event => `${name(event.previous_access)} → ${name(event.new_access)}` },
    { id: "actor", header: "Changed by", importance: "secondary", renderCell: event => event.actor_user_uid ? who("user", event.actor_user_uid) : "System" },
    { id: "date", header: "When", importance: "secondary", renderCell: event => formatDate(event.created_at) },
  ]} />;
}

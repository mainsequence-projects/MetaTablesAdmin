import { useEffect, useState } from "react";
import { Field, Input } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationCardGrid, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { DataTable, ResourceSelectionCheckbox } from "@dev-mainsequence/command-center-sdk/views";
import { ArrowLeft, ArrowRight, ChevronsLeft, ChevronsRight, UserRound, UsersRound } from "lucide-react";
import type { PermissionAssignments, PermissionsDocument } from "../api";
import { sharingPrincipals, type SharingPrincipal } from "../permissionSelection";
import { Badge, Button, DetailSection } from "../ui";
import "./sharing.css";

type Scope = "view" | "edit";
type Kind = "users" | "teams";

/** Port of Command Center's RbacAssignmentMatrix, composed with the public SDK. */
export function SharingAssignmentMatrix({ data, value, disabled, namespace = false, onChange }: {
  data: PermissionsDocument;
  value: PermissionAssignments;
  disabled: boolean;
  namespace?: boolean;
  onChange: (scope: Scope, kind: Kind, values: readonly string[]) => void;
}) {
  return <ApplicationCardGrid minimumCardWidth="30rem">
    {(["view", "edit"] as const).map(scope => <DetailSection key={scope} titleAs="h3"
      title={scope === "view" ? "Readers" : "Writers / Owners"}
      description={scope === "view" ? "Read and query. Writers are also Readers." : `Edit data, delete ${namespace ? "tables" : "the table"}, and manage sharing.`}
      actions={<Badge>{value[scope].users.length + value[scope].teams.length} assigned</Badge>}>
      {(["users", "teams"] as const).map(kind => <SharingTransferSection key={kind}
        scope={scope} kind={kind} people={sharingPrincipals(data, kind)} selected={value[scope][kind]}
        writers={value.edit[kind]} editable={data.can_edit} disabled={disabled}
        onChange={values => onChange(scope, kind, values)} />)}
    </DetailSection>)}
  </ApplicationCardGrid>;
}

function SharingTransferSection({ scope, kind, people, selected, writers, editable, disabled, onChange }: {
  scope: Scope; kind: Kind; people: SharingPrincipal[]; selected: string[]; writers: string[];
  editable: boolean; disabled: boolean; onChange: (values: string[]) => void;
}) {
  const [availableActive, setAvailableActive] = useState<string[]>([]);
  const [selectedActive, setSelectedActive] = useState<string[]>([]);
  const available = people.filter(person => person.available && !selected.includes(person.uid));
  const assigned = selected.map(uid => people.find(person => person.uid === uid)!).filter(Boolean);
  useEffect(() => {
    setAvailableActive(current => current.every(uid => available.some(person => person.uid === uid)) ? current : current.filter(uid => available.some(person => person.uid === uid)));
    setSelectedActive(current => current.every(uid => assigned.some(person => person.uid === uid)) ? current : current.filter(uid => assigned.some(person => person.uid === uid)));
  }, [available, assigned]);
  const title = kind === "users" ? "Users" : "Teams";
  const role = scope === "view" ? "Reader" : "Writer";
  const Icon = kind === "users" ? UserRound : UsersRound;
  const add = (all: boolean) => {
    const moved = available.filter(person => all || availableActive.includes(person.uid)).map(person => person.uid);
    onChange([...new Set([...selected, ...moved])]);
    setAvailableActive([]);
  };
  const remove = (all: boolean) => {
    onChange(all ? [] : selected.filter(uid => !selectedActive.includes(uid)));
    setSelectedActive([]);
  };
  const canAdd = available.some(person => availableActive.includes(person.uid));
  const canRemove = assigned.some(person => selectedActive.includes(person.uid));
  const toggle = (values: string[], uid: string) => values.includes(uid) ? values.filter(value => value !== uid) : [...values, uid];
  return <ApplicationPageStack as="section" data-sharing-section={`${scope}-${kind}`}>
    <div className="sharing-status"><Icon size={16} aria-hidden="true" /><strong>{title}</strong></div>
    <div className={editable ? "sharing-transfer" : "sharing-transfer-readonly"}>
      {editable && <SharingListPane label={`Available ${kind}`} role={role} kind={kind} people={available}
        active={availableActive} writers={writers} disabled={disabled} editable
        onToggle={uid => setAvailableActive(current => toggle(current, uid))} />}
      {editable && <div className="sharing-transfer-actions" role="group" aria-label={`${role} ${kind} assignment actions`}>
        <Button iconOnly disabled={disabled || !canAdd} aria-label={`Add selected ${role.toLowerCase()} ${kind}`} title="Add selected" onClick={() => add(false)}><ArrowRight size={16} aria-hidden="true" /></Button>
        <Button iconOnly variant="secondary" disabled={disabled || !available.length} aria-label={`Add all ${role.toLowerCase()} ${kind}`} title="Add all" onClick={() => add(true)}><ChevronsRight size={16} aria-hidden="true" /></Button>
        <Button iconOnly disabled={disabled || !canRemove} aria-label={`Remove selected ${role.toLowerCase()} ${kind}`} title="Remove selected" onClick={() => remove(false)}><ArrowLeft size={16} aria-hidden="true" /></Button>
        <Button iconOnly variant="secondary" disabled={disabled || !assigned.length} aria-label={`Remove all ${role.toLowerCase()} ${kind}`} title="Remove all" onClick={() => remove(true)}><ChevronsLeft size={16} aria-hidden="true" /></Button>
      </div>}
      <SharingListPane label={`Selected ${kind}`} role={role} kind={kind} people={assigned}
        active={selectedActive} writers={writers} disabled={disabled} editable={editable}
        onToggle={uid => setSelectedActive(current => toggle(current, uid))} />
    </div>
    {editable && <p className="muted">{scope === "view" ? "Removing Reader access also removes Writer access." : "Removing Writer access keeps Reader access."}</p>}
  </ApplicationPageStack>;
}

function SharingListPane({ label, role, kind, people, active, writers, disabled, editable, onToggle }: {
  label: string; role: string; kind: Kind; people: SharingPrincipal[]; active: string[]; writers: string[];
  disabled: boolean; editable: boolean; onToggle: (uid: string) => void;
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visible = people.filter(person => `${person.name} ${person.email ?? ""}`.toLowerCase().includes(query));
  const Icon = kind === "users" ? UserRound : UsersRound;
  return <ApplicationPageStack className="sharing-list-pane" role="group" aria-label={`${role} ${label.toLowerCase()}`}>
    <Field label={<span>{label} <Badge>{people.length}</Badge></span>}>
      <Input aria-label={`Search ${role.toLowerCase()} ${label.toLowerCase()}`} placeholder="Search by name or email" value={search}
        onChange={event => setSearch(event.target.value)} disabled={disabled} />
    </Field>
    <div className="sharing-list-surface">
      <DataTable items={visible} getId={person => person.uid} presentation="auto"
        emptyContent={people.length ? "No matches." : `No ${label.toLowerCase()}.`}
        columns={[{ id: "principal", header: kind === "users" ? "User" : "Team", importance: "primary", renderCell: person => <div className="sharing-principal">
          {editable && <ResourceSelectionCheckbox label={`Select ${person.name}`} checked={active.includes(person.uid)} disabled={disabled} onChange={() => onToggle(person.uid)} />}
          <Icon size={16} aria-hidden="true" />
          <div className="sharing-principal-identity"><strong>{person.name}</strong>
            {person.email && person.email !== person.name && <span className="muted">{person.email}</span>}
            {!person.available && <span className="muted">Name unavailable from the directory</span>}
          </div>
          {role === "Reader" && writers.includes(person.uid) && <Badge tone="accent">Writer</Badge>}
        </div> }]} />
    </div>
  </ApplicationPageStack>;
}

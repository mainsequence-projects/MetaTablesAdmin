import { ApplicationCardGrid, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { ResourceTransferList } from "@dev-mainsequence/command-center-sdk/views";
import { UserRound, UsersRound } from "lucide-react";
import type { PermissionAssignments, PermissionsDocument } from "../api";
import { sharingPrincipals } from "../permissionSelection";
import { Badge, DetailSection } from "../ui";
import "./sharing.css";

/** Adapt table sharing roles to the SDK's controlled transfer lists. */
export function SharingAssignmentMatrix({ data, value, disabled, namespace = false, onChange }: {
  data: PermissionsDocument;
  value: PermissionAssignments;
  disabled: boolean;
  namespace?: boolean;
  onChange: (scope: "view" | "edit", kind: "users" | "teams", values: readonly string[]) => void;
}) {
  return <ApplicationCardGrid minimumCardWidth="30rem">
    {(["view", "edit"] as const).map(scope => <DetailSection key={scope} titleAs="h3"
      title={scope === "view" ? "Readers" : "Writers / Owners"}
      description={scope === "view" ? "Read and query. Writers are also Readers." : `Edit data, delete ${namespace ? "tables" : "the table"}, and manage sharing.`}
      actions={<Badge>{value[scope].users.length + value[scope].teams.length} assigned</Badge>}>
      {(["users", "teams"] as const).map(kind => <ApplicationPageStack key={kind} as="section" data-sharing-section={`${scope}-${kind}`}>
        <ResourceTransferList
          itemLabel={`${scope === "view" ? "reader" : "writer"} ${kind}`}
          options={sharingPrincipals(data, kind).map(person => ({
            value: person.uid,
            label: person.name,
            subtitle: person.available
              ? person.email && person.email !== person.name ? person.email : undefined
              : "Name unavailable from the directory",
            icon: kind === "users" ? UserRound : UsersRound,
            disabled: !person.available && !value[scope][kind].includes(person.uid),
            meta: scope === "view" && value.edit[kind].includes(person.uid) ? "Writer" : undefined,
          }))}
          value={value[scope][kind]}
          onValueChange={values => onChange(scope, kind, values)}
          disabled={!data.can_edit}
          pending={disabled}
          description={data.can_edit ? scope === "view"
            ? "Removing Reader access also removes Writer access."
            : "Removing Writer access keeps Reader access." : undefined}
          emptyAvailableMessage={`No available ${kind}.`}
          emptySelectedMessage={`No ${kind} assigned.`}
        />
      </ApplicationPageStack>)}
    </DetailSection>)}
  </ApplicationCardGrid>;
}

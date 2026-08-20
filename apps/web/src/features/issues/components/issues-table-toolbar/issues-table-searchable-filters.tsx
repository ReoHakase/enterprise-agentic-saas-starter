"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
} from "@enterprise-agentic-saas/ui/components/avatar"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@enterprise-agentic-saas/ui/components/toggle-group"
import {
  ListChecksIcon,
  ListPlusIcon,
  TagsIcon,
  UserIcon,
  UserRoundIcon,
} from "lucide-react"
import { useCallback, useMemo } from "react"

import {
  DataTableFacetedFilter,
  type DataTableFilterOption,
} from "@/components/data-table/data-table-faceted-filter"
import {
  UserIdentity,
  UserProfileImage,
} from "@/components/user-identity/user-identity"

import type { IssueSearchPatch, IssueSearchState } from "../../search-params"
import type { IssueAssigneeOption } from "../types"

const assigneeFilterIcon = <UserRoundIcon aria-hidden="true" />
const labelFilterIcon = <TagsIcon aria-hidden="true" />

export type IssueTableDraftChange = <Key extends keyof IssueSearchPatch>(
  key: Key,
  value: IssueSearchPatch[Key]
) => void

const useApplyOnClose = (onApply: () => void) =>
  useCallback(
    (open: boolean) => {
      if (!open) onApply()
    },
    [onApply]
  )

const AssigneeOptionContent = ({
  assignee,
}: {
  assignee: IssueAssigneeOption
}) => {
  const user = useMemo(
    () => ({
      name: assignee.name,
      email: assignee.email,
      profileImage: assignee.profileImage ?? null,
    }),
    [assignee.email, assignee.name, assignee.profileImage]
  )
  return <UserIdentity user={user} profileImageClassName="size-7" />
}

const renderAssigneeOption = (
  option: DataTableFilterOption<string, { assignee?: IssueAssigneeOption }>,
  pinnedBadge?: string
) =>
  option.meta?.assignee ? (
    <span
      className="flex min-w-0 items-center gap-2"
      aria-label={`${option.label}${pinnedBadge ? ` ${pinnedBadge}` : ""}`}
    >
      <AssigneeOptionContent assignee={option.meta.assignee} />
      {pinnedBadge ? <Badge variant="secondary">{pinnedBadge}</Badge> : null}
    </span>
  ) : (
    option.label
  )

export const IssueAssigneeFilter = ({
  values,
  assignees,
  currentUserId,
  onChange,
  onApply,
}: {
  values: string[]
  assignees: IssueAssigneeOption[]
  currentUserId: string
  onChange: IssueTableDraftChange
  onApply: () => void
}) => {
  const options = useMemo<
    DataTableFilterOption<string, { assignee?: IssueAssigneeOption }>[]
  >(
    () => [
      { value: "unassigned", label: "Unassigned", pinnedBadge: "" },
      ...assignees.map((assignee) => ({
        value: assignee.id,
        label: assignee.name || assignee.email,
        keywords: [assignee.email],
        meta: { assignee },
        pinnedBadge: assignee.id === currentUserId ? "You" : undefined,
      })),
    ],
    [assignees, currentUserId]
  )
  const handleChange = useCallback(
    (next: string[]) => onChange("assignees", next),
    [onChange]
  )
  const summary = useMemo(
    () => <AssigneeFilterSummary values={values} assignees={assignees} />,
    [assignees, values]
  )
  const summaryLabel = useMemo(() => {
    const selected = values.map((value) => {
      const assignee = assignees.find((candidate) => candidate.id === value)
      return value === "unassigned"
        ? "Unassigned"
        : assignee?.name || assignee?.email || value
    })
    return `Selected assignees: ${selected.join(", ")}; ${selected.length} total`
  }, [assignees, values])
  return (
    <DataTableFacetedFilter
      label="Assignee"
      icon={assigneeFilterIcon}
      searchable
      values={values}
      options={options}
      renderOption={renderAssigneeOption}
      summary={summary}
      summaryLabel={summaryLabel}
      onValuesChange={handleChange}
      onOpenChange={useApplyOnClose(onApply)}
    />
  )
}

const AssigneeFilterSummary = ({
  values,
  assignees,
}: {
  values: string[]
  assignees: IssueAssigneeOption[]
}) => {
  const selected = values.map((value) => {
    const assignee = assignees.find((candidate) => candidate.id === value)
    return value === "unassigned"
      ? { id: value, label: "Unassigned", assignee: undefined }
      : { id: value, label: assignee?.name || value, assignee }
  })
  return (
    <span className="inline-flex items-center gap-1 leading-none">
      <AvatarGroup
        className="items-center -space-x-1.5 leading-none"
        aria-hidden="true"
      >
        {selected.slice(0, 3).map((item) =>
          item.assignee ? (
            <UserProfileImage
              key={item.id}
              user={item.assignee}
              className="size-5"
            />
          ) : (
            <Avatar key={item.id} className="size-5">
              <AvatarFallback>
                <UserIcon className="size-3" />
              </AvatarFallback>
            </Avatar>
          )
        )}
      </AvatarGroup>
      <span aria-hidden="true">{selected.length}</span>
    </span>
  )
}

export const IssueLabelFilter = ({
  values,
  mode,
  options: names,
  onSearchChange,
  onChange,
  onApply,
}: {
  values: string[]
  mode: IssueSearchState["labelMode"]
  options: string[]
  onSearchChange: (search: string) => void
  onChange: IssueTableDraftChange
  onApply: () => void
}) => {
  const options = useMemo(
    () => names.map((label) => ({ value: label, label })),
    [names]
  )
  const handleValuesChange = useCallback(
    (next: string[]) => onChange("labels", next),
    [onChange]
  )
  const handleModeChange = useCallback(
    (value: string | null) => {
      if (value === "any" || value === "all") onChange("labelMode", value)
    },
    [onChange]
  )
  const renderLabel = useCallback(
    (option: DataTableFilterOption<string>) => (
      <Badge variant="outline">{option.label}</Badge>
    ),
    []
  )
  const summary = useMemo(
    () => <LabelFilterSummary values={values} mode={mode} />,
    [mode, values]
  )
  const summaryLabel = `Selected labels: ${values.join(", ")}; ${values.length} total; match ${mode}`
  return (
    <DataTableFacetedFilter
      label="Labels"
      icon={labelFilterIcon}
      searchable
      values={values}
      options={options}
      renderOption={renderLabel}
      summary={summary}
      summaryLabel={summaryLabel}
      onSearchValueChange={onSearchChange}
      onValuesChange={handleValuesChange}
      onOpenChange={useApplyOnClose(onApply)}
    >
      <ToggleGroup
        type="single"
        value={mode}
        required
        size="sm"
        className="grid w-full grid-cols-2"
        aria-label="Label match mode"
        onValueChange={handleModeChange}
      >
        <ToggleGroupItem value="any" className="w-full">
          Match any
        </ToggleGroupItem>
        <ToggleGroupItem value="all" className="w-full">
          Match all
        </ToggleGroupItem>
      </ToggleGroup>
    </DataTableFacetedFilter>
  )
}

const LabelFilterSummary = ({
  values,
  mode,
}: {
  values: string[]
  mode: IssueSearchState["labelMode"]
}) => {
  const ModeIcon = mode === "all" ? ListChecksIcon : ListPlusIcon
  const remaining = Math.max(values.length - 1, 0)
  return (
    <span className="inline-flex max-w-40 min-w-0 items-center gap-1">
      <Badge
        variant="outline"
        className="max-w-24 truncate px-1.5"
        aria-hidden="true"
      >
        {values[0]}
      </Badge>
      {remaining > 0 ? (
        <span className="shrink-0 text-xs" aria-hidden="true">
          +{remaining}
        </span>
      ) : null}
      <ModeIcon className="size-4 shrink-0" aria-hidden="true" />
    </span>
  )
}

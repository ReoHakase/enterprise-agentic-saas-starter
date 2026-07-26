"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { HandIcon, ShieldCheckIcon } from "lucide-react"
import { useCallback } from "react"
import { toast } from "sonner"

import { apiClient } from "@/lib/api-client"

import { putAgentApprovalPolicy } from "../../api"
import { agentApprovalPolicyQueryOptions, agentKeys } from "../../queries"

const policyOptions = [
  {
    value: "ask_always",
    label: "Ask always",
    description: "Confirm each Issue creation, update, and deletion.",
    Icon: HandIcon,
  },
  {
    value: "full_access",
    label: "Full access",
    description:
      "Allow this thread to create, update, and delete Issues without confirmation.",
    Icon: ShieldCheckIcon,
  },
] as const

export type AgentPermissionMode = (typeof policyOptions)[number]["value"]

export const AgentPermissionSelect = ({
  mode,
  disabled,
  onModeChange,
}: {
  mode: AgentPermissionMode
  disabled: boolean
  onModeChange: (mode: AgentPermissionMode) => void
}) => {
  const selectMode = useCallback(
    (value: string | null) => {
      if (value === "ask_always" || value === "full_access") {
        onModeChange(value)
      }
    },
    [onModeChange]
  )
  const selected =
    policyOptions.find((option) => option.value === mode) ?? policyOptions[0]
  const SelectedIcon = selected.Icon

  return (
    <Select
      items={policyOptions}
      value={mode}
      disabled={disabled}
      onValueChange={selectMode}
    >
      <SelectTrigger
        className="min-w-40 sm:w-auto"
        aria-label="Agent permission"
      >
        <SelectedIcon data-icon="inline-start" />
        {selected.label}
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {policyOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <option.Icon className="mt-0.5 size-4 shrink-0" />
              <div className="py-0.5">
                <span className="block">{option.label}</span>
                <span className="block max-w-72 text-xs whitespace-normal text-muted-foreground">
                  {option.description}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export const AgentPolicyControl = ({
  organizationId,
  threadId,
  disabled,
}: {
  organizationId: string
  threadId: string
  disabled: boolean
}) => {
  const queryClient = useQueryClient()
  const policyQuery = useQuery(
    agentApprovalPolicyQueryOptions(apiClient, organizationId, threadId)
  )
  const mutation = useMutation({
    mutationFn: (mode: "ask_always" | "full_access") =>
      putAgentApprovalPolicy(apiClient, { threadId, mode }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: agentKeys.policy(organizationId, threadId),
      })
    },
    onError: () => toast.error("The Agent permission could not be updated."),
  })
  const { mutate: updatePermission, isPending: updatingPermission } = mutation
  const mode = policyQuery.data?.mode ?? "ask_always"

  return (
    <AgentPermissionSelect
      mode={mode}
      disabled={disabled || updatingPermission}
      onModeChange={updatePermission}
    />
  )
}

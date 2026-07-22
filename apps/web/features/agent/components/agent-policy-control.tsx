"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trash2Icon } from "lucide-react"
import { useCallback, useState, type ChangeEvent } from "react"
import { toast } from "sonner"

import { LocalDate } from "@/components/local-date"
import {
  deleteAgentApprovalPolicy,
  putAgentApprovalPolicy,
} from "@/features/agent/api"
import {
  agentApprovalPolicyQueryOptions,
  agentKeys,
} from "@/features/agent/queries"
import { apiClient } from "@/lib/api-client"

const policyOptions = [
  {
    value: "ask_each",
    label: "Ask each time",
    description: "Confirm every Issue creation, update, and deletion.",
  },
  {
    value: "auto_write",
    label: "Allow create/update for 15 minutes",
    description: "Issue deletion still asks every time.",
  },
  {
    value: "auto_all",
    label: "Allow changes and deletion for 15 minutes",
    description: "Deletion requires an explicit confirmation before enabling.",
  },
] as const

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
  const [destructiveConfirmation, setDestructiveConfirmation] = useState("")
  const [confirmingAutoAll, setConfirmingAutoAll] = useState(false)
  const mutation = useMutation({
    mutationFn: (mode: "ask_each" | "auto_write" | "auto_all") =>
      mode === "ask_each"
        ? deleteAgentApprovalPolicy(apiClient, threadId)
        : putAgentApprovalPolicy(apiClient, {
            threadId,
            mode,
            expiresInSeconds: 900,
            destructiveConfirmation:
              mode === "auto_all" ? "ALLOW_ISSUE_DELETE" : undefined,
          }),
    onSuccess: async () => {
      setConfirmingAutoAll(false)
      setDestructiveConfirmation("")
      await queryClient.invalidateQueries({
        queryKey: agentKeys.policy(organizationId, threadId),
      })
    },
    onError: () =>
      toast.error("The Agent approval policy could not be updated."),
  })
  const { mutate: updatePolicy, isPending: updatingPolicy } = mutation
  const selectMode = useCallback(
    (value: string | null) => {
      if (
        value !== "ask_each" &&
        value !== "auto_write" &&
        value !== "auto_all"
      )
        return
      if (value === "auto_all") {
        setConfirmingAutoAll(true)
        return
      }
      updatePolicy(value)
    },
    [updatePolicy]
  )
  const changeDestructiveConfirmation = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setDestructiveConfirmation(event.target.value),
    []
  )
  const enableAutoAll = useCallback(
    () => updatePolicy("auto_all"),
    [updatePolicy]
  )
  const cancelAutoAll = useCallback(() => setConfirmingAutoAll(false), [])

  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <Select
        items={policyOptions}
        value={policyQuery.data?.mode ?? "ask_each"}
        disabled={disabled || updatingPolicy}
        onValueChange={selectMode}
      >
        <SelectTrigger className="w-full max-w-sm min-w-52">
          {policyOptions.find(
            (option) => option.value === policyQuery.data?.mode
          )?.label ?? "Ask each time"}
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {policyOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
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
      {confirmingAutoAll ? (
        <div className="w-full max-w-sm space-y-2 rounded-xl border border-destructive/40 p-3">
          <p className="text-xs text-muted-foreground">
            This also allows Issue deletion for 15 minutes. Type
            ALLOW_ISSUE_DELETE.
          </p>
          <Input
            value={destructiveConfirmation}
            onChange={changeDestructiveConfirmation}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={
                destructiveConfirmation !== "ALLOW_ISSUE_DELETE" ||
                updatingPolicy ||
                disabled
              }
              onClick={enableAutoAll}
            >
              <Trash2Icon data-icon="inline-start" /> Enable
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={cancelAutoAll}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {policyQuery.data?.expiresAt ? (
        <p className="text-xs text-muted-foreground">
          Expires <LocalDate value={policyQuery.data.expiresAt} includeTime />
        </p>
      ) : null}
    </div>
  )
}

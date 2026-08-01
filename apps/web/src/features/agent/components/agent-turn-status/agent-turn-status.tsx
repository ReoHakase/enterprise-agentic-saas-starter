import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"

import type { AgentWaitingState } from "../agent-conversation/agent-waiting-state"

export const AgentTurnStatus = ({
  cancelState,
  error,
  turnStopped,
  waitingState,
}: {
  cancelState: "idle" | "canceling" | "failed"
  error?: Error
  turnStopped: boolean
  waitingState?: AgentWaitingState
}) => (
  <>
    {cancelState === "failed" ? (
      <p role="alert" className="text-sm text-destructive">
        Agent response could not be canceled safely. Retry stop.
      </p>
    ) : null}
    {error ? (
      <p role="alert" className="text-sm text-destructive">
        {error.message === "Agent response timed out."
          ? "Agent response timed out. You can retry the same draft safely."
          : "Agent response failed. You can retry the same draft safely."}
      </p>
    ) : null}
    {waitingState ? (
      <div
        className="flex items-center gap-2 py-2 text-sm text-muted-foreground"
        role="status"
      >
        <Spinner aria-hidden="true" />
        {waitingState === "continuation"
          ? "続きを待っています…"
          : "応答を待っています…"}
      </div>
    ) : null}
    {turnStopped ? (
      <div className="py-2 text-sm text-muted-foreground" role="status">
        Turn stopped.
      </div>
    ) : null}
  </>
)

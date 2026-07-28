import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"

export const AgentTurnStatus = ({
  busy,
  cancelState,
  error,
  transientStatus,
  turnStopped,
}: {
  busy: boolean
  cancelState: "idle" | "canceling" | "failed"
  error?: Error
  transientStatus?: string
  turnStopped: boolean
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
    {transientStatus && busy ? (
      <div
        className="flex w-full items-center gap-2 py-2 text-sm text-muted-foreground"
        role="status"
      >
        <Spinner /> {transientStatus}
      </div>
    ) : null}
    {turnStopped ? (
      <div className="py-2 text-sm text-muted-foreground" role="status">
        Turn stopped.
      </div>
    ) : null}
  </>
)

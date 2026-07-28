export const toolStateLabel = (
  state:
    | "input-streaming"
    | "input-available"
    | "approval-requested"
    | "approval-responded"
    | "output-available"
    | "output-denied"
    | "output-error",
  approvalApproved?: boolean
) => {
  switch (state) {
    case "input-streaming":
      return "preparing input"
    case "input-available":
      return "running"
    case "approval-requested":
      return "waiting for approval"
    case "approval-responded":
      return approvalApproved ? "running" : "denied"
    case "output-available":
      return "completed"
    case "output-denied":
      return "denied"
    case "output-error":
      return "failed"
  }
}

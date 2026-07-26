const agentConversationBottomThreshold = 96

export const isNearAgentConversationBottom = (
  metrics: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">,
  threshold = agentConversationBottomThreshold
) =>
  metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold

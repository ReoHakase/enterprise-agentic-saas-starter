export type AgentFeatureSwitches = {
  runs: boolean
  vision: boolean
  writes: boolean
}

const enabled = (value: string | undefined): boolean => value?.trim() === "1"

export const readAgentFeatureSwitches = (environment: {
  AGENT_RUNS_ENABLED?: string
  AGENT_VISION_ENABLED?: string
  AGENT_WRITES_ENABLED?: string
}): AgentFeatureSwitches => ({
  runs: enabled(environment.AGENT_RUNS_ENABLED),
  vision: enabled(environment.AGENT_VISION_ENABLED),
  writes: enabled(environment.AGENT_WRITES_ENABLED),
})

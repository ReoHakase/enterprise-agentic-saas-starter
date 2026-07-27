import { createOpenRouter } from "@openrouter/ai-sdk-provider"

const OPENROUTER_MODEL_ID = "qwen/qwen3.6-flash" as const

const requireLoopbackBaseURL = (value: string) => {
  const parsed = new URL(value)
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.pathname !== "/api/v1" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Agent model base URL is unavailable")
  }
  return parsed.href.replace(/\/$/u, "")
}

export const createAgentOpenRouter = (apiKey?: string, baseURL?: string) =>
  createOpenRouter({
    ...(apiKey ? { apiKey } : {}),
    ...(baseURL ? { baseURL: requireLoopbackBaseURL(baseURL) } : {}),
    appName: "enterprise-agentic-saas-agent",
    compatibility: "strict",
  })

export const createAgentModel = (apiKey?: string, baseURL?: string) =>
  createAgentOpenRouter(apiKey, baseURL).chat(OPENROUTER_MODEL_ID, {
    parallelToolCalls: false,
    reasoning: {
      effort: "none",
      enabled: false,
      exclude: true,
    },
  })

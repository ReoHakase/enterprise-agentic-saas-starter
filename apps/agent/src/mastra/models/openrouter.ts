import { createOpenRouter } from "@openrouter/ai-sdk-provider"

export const OPENROUTER_MODEL_ID = "qwen/qwen3.6-flash" as const

export const createAgentOpenRouter = (apiKey?: string) =>
  createOpenRouter({
    ...(apiKey ? { apiKey } : {}),
    appName: "enterprise-agentic-saas-agent",
    compatibility: "strict",
  })

export const createAgentModel = (apiKey?: string) =>
  createAgentOpenRouter(apiKey).chat(OPENROUTER_MODEL_ID)

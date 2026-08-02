import { createOpenRouter } from "@openrouter/ai-sdk-provider"

import {
  AGENT_MODEL_PROFILE,
  AUXILIARY_AGENT_REASONING,
  PRODUCT_AGENT_REASONING,
} from "../../core/model-profile"

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
  createAgentOpenRouter(apiKey, baseURL).chat(AGENT_MODEL_PROFILE.model, {
    parallelToolCalls: false,
    reasoning: PRODUCT_AGENT_REASONING,
    usage: { include: true },
  })

export const createAgentAuxiliaryModel = (apiKey?: string, baseURL?: string) =>
  createAgentOpenRouter(apiKey, baseURL).chat(AGENT_MODEL_PROFILE.model, {
    parallelToolCalls: false,
    reasoning: AUXILIARY_AGENT_REASONING,
    usage: { include: true },
  })

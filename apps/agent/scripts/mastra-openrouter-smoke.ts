import { Agent } from "@mastra/core/agent"

const MODEL = "openrouter/qwen/qwen3.6-flash"
const SENTINEL = "MASTRA_OPENROUTER_OK"

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is required for the paid smoke test")
}

const agent = new Agent({
  id: "openrouter-smoke",
  instructions: `Return exactly ${SENTINEL} and no other text.`,
  maxRetries: 0,
  model: MODEL,
  name: "OpenRouter smoke",
})

const result = await agent.generate(`Return exactly ${SENTINEL}.`, {
  modelSettings: {
    maxOutputTokens: 32,
    temperature: 0,
  },
})

if (result.text.trim() !== SENTINEL) {
  throw new Error("Mastra OpenRouter smoke returned an unexpected response")
}

console.info(
  JSON.stringify({ event: "mastra_openrouter_smoke_succeeded", model: MODEL })
)

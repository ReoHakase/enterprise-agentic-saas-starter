import { mastra } from "../src/mastra"

const SENTINEL = "MASTRA_OPENROUTER_OK"

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is required for the paid smoke test")
}

const agent = mastra.getAgentById("product-agent")

const result = await agent.generate(`Return exactly ${SENTINEL}.`, {
  modelSettings: {
    maxOutputTokens: 32,
    temperature: 0,
  },
})

if (result.text.trim() !== SENTINEL) {
  throw new Error("Mastra OpenRouter smoke returned an unexpected response")
}

console.info(SENTINEL)

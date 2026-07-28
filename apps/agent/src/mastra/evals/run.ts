import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { createAgentModel } from "../adapters/model/openrouter"
import { reportDevelopmentCauseChain } from "../adapters/telemetry/development-error"
import { parseAgentEvalDataset, type AgentEvalCase } from "./dataset"
import { classifyAgentEvalFailure } from "./failure"
import {
  readAgentEvalFailureStage,
  runAgentEvalStackCase,
} from "./stack-driver"

const evalDirectory = resolve(import.meta.dirname, "../../../evals")

const requireOpenRouterApiKey = () => {
  const value = process.env.OPENROUTER_API_KEY?.trim()
  if (!value || /[\r\n]/u.test(value)) {
    throw new Error("Agent eval requires OPENROUTER_API_KEY")
  }
  return value
}

const selectedCaseIds = () => {
  const index = process.argv.indexOf("--cases")
  const raw = index < 0 ? process.env.AGENT_EVAL_CASES : process.argv[index + 1]
  if (!raw?.trim()) return null
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  if (values.length === 0 || new Set(values).size !== values.length) {
    throw new Error("Agent eval case selection is invalid")
  }
  return new Set(values)
}

const selectCases = (
  cases: readonly AgentEvalCase[],
  selected: ReadonlySet<string> | null
) => {
  if (!selected) return cases
  const result = cases.filter((item) => selected.has(item.id))
  if (result.length !== selected.size) {
    throw new Error("Agent eval selected an unknown case")
  }
  return result
}

const main = async (signal: AbortSignal) => {
  const openRouterApiKey = requireOpenRouterApiKey()
  const rawDataset: unknown = JSON.parse(
    await readFile(resolve(evalDirectory, "cases.json"), "utf8")
  )
  const cases = selectCases(
    parseAgentEvalDataset(rawDataset).cases,
    selectedCaseIds()
  )
  const modelId = createAgentModel().modelId

  for (const caseDefinition of cases) {
    for (let trial = 1; trial <= caseDefinition.trials; trial += 1) {
      signal.throwIfAborted()
      const namespace = `${caseDefinition.id}-${trial}-${crypto.randomUUID()}`
      // Paid cases run serially and every trial starts a fresh local stack.
      // oxlint-disable-next-line no-await-in-loop
      const result = await runAgentEvalStackCase({
        caseDefinition,
        modelId,
        namespace,
        openRouterApiKey,
        signal,
      })
      console.log(
        JSON.stringify({
          caseId: caseDefinition.id,
          ...result,
          status: "passed",
          trial,
        })
      )
    }
  }
}

const shutdown = new AbortController()
const requestShutdown = () => {
  shutdown.abort(new DOMException("Agent eval interrupted", "AbortError"))
}
process.once("SIGINT", requestShutdown)
process.once("SIGTERM", requestShutdown)

try {
  await main(shutdown.signal)
} catch (cause) {
  reportDevelopmentCauseChain(process.env, "Agent eval", cause)
  console.error(
    JSON.stringify({
      failureCode: classifyAgentEvalFailure(cause),
      failureStage: readAgentEvalFailureStage(cause),
      message: "Agent eval failed",
      status: "failed",
    })
  )
  process.exitCode = 1
} finally {
  process.off("SIGINT", requestShutdown)
  process.off("SIGTERM", requestShutdown)
}

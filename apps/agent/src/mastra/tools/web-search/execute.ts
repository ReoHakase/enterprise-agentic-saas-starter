import { canonicalizePublicHttpUrl } from "@enterprise-agentic-saas/agent-contracts"
import * as v from "valibot"

import { publicWebSearchInputValueSchema } from "./schema"

const MAXIMUM_RESULT_CHARACTERS = 6_000
const MAXIMUM_SOURCE_TITLE_CHARACTERS = 200
const MAXIMUM_SOURCES = 5
const TOOL_CALL_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

type RawWebSearchSource = {
  type?: unknown
  payload?: unknown
}

export type RawPublicWebResearchResult = {
  error?: unknown
  finishReason?: unknown
  sources?: RawWebSearchSource[]
  text?: unknown
}

export type BoundedPublicWebSearchResult = {
  content: string
  sources: Array<{ title: string; url: string }>
  trust: "untrusted_public_web_content"
}

type PublicWebSearchDependencies = {
  operationId: string
  authorize: (query: string, operationId: string) => Promise<{ query: string }>
  search: (
    query: string,
    abortSignal?: AbortSignal
  ) => Promise<RawPublicWebResearchResult>
  consumeBudget: () => void
  abortSignal?: AbortSignal
}

const bounded = (value: string, maximum: number) =>
  value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`

const toBoundedSource = (
  source: RawWebSearchSource
): { title: string; url: string } | null => {
  if (source.type !== "source" || !isRecord(source.payload)) {
    return null
  }
  const payload = source.payload
  if (payload.sourceType !== "url") return null
  const url = canonicalizePublicHttpUrl(payload.url)
  if (!url) return null
  const title =
    typeof payload.title === "string" && payload.title.trim() !== ""
      ? bounded(payload.title.trim(), MAXIMUM_SOURCE_TITLE_CHARACTERS)
      : new URL(url).hostname
  return { title, url }
}

const toBoundedPublicWebSearchResult = (
  result: RawPublicWebResearchResult
): BoundedPublicWebSearchResult => {
  if (result.error || result.finishReason === "error") {
    throw new Error("Public Web search is unavailable")
  }
  const content = bounded(
    typeof result.text === "string" ? result.text.trim() : "",
    MAXIMUM_RESULT_CHARACTERS
  )
  const sources: Array<{ title: string; url: string }> = []
  const seen = new Set<string>()
  for (const rawSource of result.sources ?? []) {
    const source = toBoundedSource(rawSource)
    if (!source || seen.has(source.url)) continue
    seen.add(source.url)
    sources.push(source)
    if (sources.length === MAXIMUM_SOURCES) break
  }
  return {
    content,
    sources,
    trust: "untrusted_public_web_content",
  }
}

const normalizeOperationId = async (value: string) => {
  if (TOOL_CALL_ID_PATTERN.test(value)) return value
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  )
  return `call_${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`
}

export const executePublicWebSearch = async (
  input: unknown,
  dependencies: PublicWebSearchDependencies
): Promise<BoundedPublicWebSearchResult> => {
  const parsed = v.safeParse(publicWebSearchInputValueSchema, input)
  if (!parsed.success) {
    throw new Error("Web search accepts public information only")
  }
  dependencies.consumeBudget()
  const operationId = await normalizeOperationId(dependencies.operationId)
  const authorization = await dependencies.authorize(
    parsed.output.query,
    operationId
  )
  const guarded = v.safeParse(publicWebSearchInputValueSchema, {
    query: authorization.query,
  })
  if (!guarded.success) {
    throw new Error("Web search accepts public information only")
  }
  const result = await dependencies.search(
    guarded.output.query,
    dependencies.abortSignal
  )
  return toBoundedPublicWebSearchResult(result)
}

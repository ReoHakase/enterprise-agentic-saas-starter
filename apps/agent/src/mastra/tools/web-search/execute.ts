import { publicWebSearchInputSchema } from "./schema"

const MAXIMUM_RESULT_CHARACTERS = 6_000
const MAXIMUM_SOURCE_TITLE_CHARACTERS = 200
const MAXIMUM_SOURCE_URL_CHARACTERS = 2_048
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
  guard: (query: string) => Promise<{ query: string }>
  reserve: (operationId: string) => Promise<unknown>
  search: (
    query: string,
    abortSignal?: AbortSignal
  ) => Promise<RawPublicWebResearchResult>
  consumeBudget: () => void
  abortSignal?: AbortSignal
}

const bounded = (value: string, maximum: number) =>
  value.length <= maximum ? value : `${value.slice(0, maximum)}…`

const isPrivateSourceHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase()
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".invalid") ||
    normalized.endsWith(".test") ||
    normalized.includes(":")
  ) {
    return true
  }
  const octets = normalized.split(".").map(Number)
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  )
}

const toPublicSourceUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length > MAXIMUM_SOURCE_URL_CHARACTERS)
    return null
  try {
    const url = new URL(value)
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username !== "" ||
      url.password !== "" ||
      isPrivateSourceHostname(url.hostname)
    ) {
      return null
    }
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

const toBoundedSource = (
  source: RawWebSearchSource
): { title: string; url: string } | null => {
  if (source.type !== "source" || !isRecord(source.payload)) {
    return null
  }
  const payload = source.payload
  if (payload.sourceType !== "url") return null
  const url = toPublicSourceUrl(payload.url)
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
  const parsed = publicWebSearchInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error("Web search accepts public information only")
  }
  dependencies.consumeBudget()
  const guarded = await dependencies.guard(parsed.data.query)
  const operationId = await normalizeOperationId(dependencies.operationId)
  await dependencies.reserve(operationId)
  const result = await dependencies.search(
    guarded.query,
    dependencies.abortSignal
  )
  return toBoundedPublicWebSearchResult(result)
}

const MAX_REASONING_DETAILS = 64
const MAX_REASONING_TEXT_LENGTH = 50_000
const MAX_REASONING_OPAQUE_LENGTH = 100_000
const MAX_REASONING_IDENTIFIER_LENGTH = 256
const REASONING_FORMATS = new Set([
  "unknown",
  "openai-responses-v1",
  "azure-openai-responses-v1",
  "xai-responses-v1",
  "anthropic-claude-v1",
  "google-gemini-v1",
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const boundedString = (value: unknown, maximum: number) =>
  typeof value === "string" && value.length <= maximum ? value : undefined

const nullableBoundedString = (value: unknown, maximum: number) =>
  value === null ? null : boundedString(value, maximum)

const commonFields = (detail: Record<string, unknown>) => {
  const id = nullableBoundedString(detail.id, MAX_REASONING_IDENTIFIER_LENGTH)
  const format =
    detail.format === null ||
    (typeof detail.format === "string" && REASONING_FORMATS.has(detail.format))
      ? detail.format
      : undefined
  const index =
    typeof detail.index === "number" &&
    Number.isInteger(detail.index) &&
    detail.index >= 0 &&
    detail.index <= 10_000
      ? detail.index
      : undefined
  return {
    ...(id !== undefined ? { id } : {}),
    ...(format !== undefined ? { format } : {}),
    ...(index !== undefined ? { index } : {}),
  }
}

const projectReasoningDetail = (value: unknown) => {
  if (!isRecord(value) || typeof value.type !== "string") return
  const common = commonFields(value)
  if (value.type === "reasoning.summary") {
    const summary = boundedString(value.summary, MAX_REASONING_TEXT_LENGTH)
    return summary === undefined
      ? undefined
      : { type: value.type, summary, ...common }
  }
  if (value.type === "reasoning.encrypted") {
    const data = boundedString(value.data, MAX_REASONING_OPAQUE_LENGTH)
    return data === undefined
      ? undefined
      : { type: value.type, data, ...common }
  }
  if (value.type === "reasoning.text") {
    const text = nullableBoundedString(value.text, MAX_REASONING_TEXT_LENGTH)
    const signature = nullableBoundedString(
      value.signature,
      MAX_REASONING_OPAQUE_LENGTH
    )
    if (text === undefined && signature === undefined) return
    return {
      type: value.type,
      ...(text !== undefined ? { text } : {}),
      ...(signature !== undefined ? { signature } : {}),
      ...common,
    }
  }
}

const reasoningDetailsFrom = (value: unknown): unknown[] | undefined => {
  if (!isRecord(value)) return
  const openrouter = value.openrouter
  if (!isRecord(openrouter) || !Array.isArray(openrouter.reasoning_details)) {
    return
  }
  return openrouter.reasoning_details
}

export const projectOpenRouterReasoningOptions = (...candidates: unknown[]) => {
  const source = candidates
    .map(reasoningDetailsFrom)
    .find((details) => details !== undefined)
  if (!source) return
  const reasoningDetails = source
    .slice(0, MAX_REASONING_DETAILS)
    .flatMap((detail) => {
      const projected = projectReasoningDetail(detail)
      return projected ? [projected] : []
    })
  if (reasoningDetails.length === 0) return
  return { openrouter: { reasoning_details: reasoningDetails } }
}

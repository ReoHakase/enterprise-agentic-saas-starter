import { toStandardJsonSchema } from "@valibot/to-json-schema"
import * as v from "valibot"

const MAXIMUM_QUERY_CHARACTERS = 200

const forbiddenPublicQueryPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /(?:^|\s)\+?\d[\d ()-]{7,}\d(?:\s|$)/u,
  /〒?\s*\d{3}-\d{4}/u,
  /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr)\b/iu,
  /\b(?:sk-or-v1|sk-proj|sk-live|sk-test|gh[pousr]|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/iu,
  /\bAKIA[A-Z0-9]{16}\b/u,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/iu,
  /\b(?:authorization|proxy-authorization|cookie|set-cookie)\s*:/iu,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passwd|secret|session[_ -]?token)\s*[:=]\s*\S+/iu,
  /\b(?:organization|org|issue|user|member|asset|thread|session|run|action)(?:[_ -]?id)?\s*[:=#/]\s*[A-Za-z0-9_-]{4,}\b/iu,
  /\b(?:org|issue|user|member|asset|thread|session|run|action)_[A-Za-z0-9_-]{8,}\b/iu,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu,
  /\b(?:localhost|[A-Za-z0-9.-]+\.(?:local|internal|invalid|test))(?::\d{1,5})?\b/iu,
  /\b(?:127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/u,
  /\b(?:private issue|internal note|customer data|tenant data|confidential data)\s*[:=]/iu,
] as const

const containsControlCharacter = (query: string) =>
  [...query].some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127)
  })

const isPublicWebSearchQuery = (query: string) =>
  !containsControlCharacter(query) &&
  forbiddenPublicQueryPatterns.every((pattern) => !pattern.test(query))

const publicWebSearchQueryTransportSchema = v.pipe(
  v.string(),
  v.minLength(2),
  v.maxLength(MAXIMUM_QUERY_CHARACTERS)
)

export const publicWebSearchInputValueSchema = v.strictObject({
  query: v.pipe(
    publicWebSearchQueryTransportSchema,
    v.check(
      (query) => query === query.trim() && isPublicWebSearchQuery(query),
      "Web search accepts public information only"
    )
  ),
})

export const publicWebSearchInputSchema = toStandardJsonSchema(
  v.strictObject({ query: publicWebSearchQueryTransportSchema })
)

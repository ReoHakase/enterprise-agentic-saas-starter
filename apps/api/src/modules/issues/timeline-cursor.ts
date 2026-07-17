const cursorVersion = 1 as const
const cursorPattern = /^[A-Za-z0-9_-]+$/
const maxCursorLength = 1_024

export type IssueTimelineItemType = "activity" | "comment"

export type IssueTimelineCursorPosition = {
  type: IssueTimelineItemType
  createdAt: Date
  position: number
  id: string
}

type IssueTimelineCursorPayload = {
  v: typeof cursorVersion
  type: IssueTimelineItemType
  createdAt: string
  position: number
  id: string
}

const encodeBase64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "")
}

const decodeBase64Url = (value: string) => {
  if (
    value.length < 1 ||
    value.length > maxCursorLength ||
    !cursorPattern.test(value) ||
    value.length % 4 === 1
  ) {
    throw new Error("Invalid timeline cursor encoding")
  }

  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  )
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
}

const ownValue = (value: object, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor && "value" in descriptor ? descriptor.value : undefined
}

const isCursorPayload = (
  value: unknown
): value is IssueTimelineCursorPayload => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const version = ownValue(value, "v")
  const type = ownValue(value, "type")
  const createdAtValue = ownValue(value, "createdAt")
  const position = ownValue(value, "position")
  const id = ownValue(value, "id")
  if (
    version !== cursorVersion ||
    (type !== "activity" && type !== "comment") ||
    typeof createdAtValue !== "string" ||
    typeof id !== "string" ||
    id.length < 1 ||
    typeof position !== "number" ||
    !Number.isSafeInteger(position) ||
    position < 0 ||
    (type === "comment" && position !== 0)
  ) {
    return false
  }

  const createdAt = new Date(createdAtValue)
  return (
    !Number.isNaN(createdAt.getTime()) &&
    createdAt.toISOString() === createdAtValue
  )
}

export const encodeIssueTimelineCursor = (
  cursor: IssueTimelineCursorPosition
) =>
  encodeBase64Url(
    JSON.stringify({
      v: cursorVersion,
      type: cursor.type,
      createdAt: cursor.createdAt.toISOString(),
      position: cursor.position,
      id: cursor.id,
    } satisfies IssueTimelineCursorPayload)
  )

export const decodeIssueTimelineCursor = (
  value: string
): IssueTimelineCursorPosition => {
  const payload: unknown = JSON.parse(decodeBase64Url(value))
  if (!isCursorPayload(payload)) {
    throw new Error("Invalid timeline cursor payload")
  }

  return {
    type: payload.type,
    createdAt: new Date(payload.createdAt),
    position: payload.position,
    id: payload.id,
  }
}

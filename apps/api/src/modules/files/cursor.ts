const cursorVersion = 1 as const
const cursorPattern = /^[A-Za-z0-9_-]+$/
const maximumCursorLength = 1024

type FileCursorPayload = {
  v: typeof cursorVersion
  createdAt: string
  id: string
}

export type FileCursor = {
  createdAt: Date
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
    value.length > maximumCursorLength ||
    !cursorPattern.test(value) ||
    value.length % 4 === 1
  ) {
    throw new Error("Invalid file cursor encoding")
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

const isPayload = (value: unknown): value is FileCursorPayload => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const version = ownValue(value, "v")
  const createdAtValue = ownValue(value, "createdAt")
  const id = ownValue(value, "id")
  if (
    version !== cursorVersion ||
    typeof createdAtValue !== "string" ||
    typeof id !== "string" ||
    id.length < 1
  ) {
    return false
  }
  const createdAt = new Date(createdAtValue)
  return (
    !Number.isNaN(createdAt.getTime()) &&
    createdAt.toISOString() === createdAtValue
  )
}

export const encodeFileCursor = (cursor: FileCursor) =>
  encodeBase64Url(
    JSON.stringify({
      v: cursorVersion,
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    } satisfies FileCursorPayload)
  )

export const decodeFileCursor = (value: string): FileCursor => {
  const payload: unknown = JSON.parse(decodeBase64Url(value))
  if (!isPayload(payload)) throw new Error("Invalid file cursor payload")
  return { createdAt: new Date(payload.createdAt), id: payload.id }
}

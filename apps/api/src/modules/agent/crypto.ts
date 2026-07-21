const encoder = new TextEncoder()

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "")

export const hashAgentToken = async (token: string) =>
  toHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token)))
  )

export const createAgentToken = async () => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const token = toBase64Url(bytes)
  return { token, tokenHash: await hashAgentToken(token) }
}

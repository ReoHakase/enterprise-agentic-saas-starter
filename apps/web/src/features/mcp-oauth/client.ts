type PropertyContainer = Record<PropertyKey, unknown>

const isPropertyContainer = (value: unknown): value is PropertyContainer =>
  (typeof value === "object" && value !== null) || typeof value === "function"

const oauthMethod = (authClient: unknown, method: "consent" | "continue") => {
  if (!isPropertyContainer(authClient)) return null
  const oauth2 = Reflect.get(authClient, "oauth2")
  if (!isPropertyContainer(oauth2)) return null
  const capability = Reflect.get(oauth2, method)
  return typeof capability === "function"
    ? { capability, receiver: oauth2 }
    : null
}

const redirectFromResult = (result: unknown) => {
  if (!isPropertyContainer(result) || Reflect.get(result, "error")) {
    throw new Error("MCP OAuth request failed")
  }
  const data = Reflect.get(result, "data")
  const payload = isPropertyContainer(data) ? data : result
  const url = Reflect.get(payload, "url")
  if (Reflect.get(payload, "redirect") !== true || typeof url !== "string") {
    throw new Error("MCP OAuth redirect was not returned")
  }
  window.location.assign(url)
}

const callOAuthMethod = async (
  authClient: unknown,
  method: "consent" | "continue",
  body: Record<string, unknown>
) => {
  const target = oauthMethod(authClient, method)
  if (!target) throw new Error("MCP OAuth client is unavailable")
  const result: unknown = await Reflect.apply(
    target.capability,
    target.receiver,
    [body]
  )
  redirectFromResult(result)
}

export const continueMcpOAuth = (authClient: unknown) =>
  callOAuthMethod(authClient, "continue", { postLogin: true })

export const decideMcpOAuthConsent = (
  authClient: unknown,
  input: { accept: boolean; scopes: readonly string[] }
) =>
  callOAuthMethod(authClient, "consent", {
    accept: input.accept,
    ...(input.accept ? { scope: input.scopes.join(" ") } : {}),
  })

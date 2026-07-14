const localEmailFrom = "noreply@example.test"
const localMailpitUrl = "https://mailpit.enterprise-agentic-saas.localhost"

/**
 * ローカル起動だけは安全なRFC準拠アドレスを補い、本番は設定漏れをfail-fastする。
 */
export const resolveEmailFrom = (
  configuredValue: string | undefined,
  nodeEnv: string | undefined
): string | undefined => {
  const normalized = configuredValue?.trim()
  if (normalized) return normalized

  return nodeEnv === "production" ? undefined : localEmailFrom
}

/**
 * 明示値はValibotで検証できるよう保持し、runtimeごとの安全な既定providerだけを補う。
 */
export const resolveEmailProvider = (
  configuredValue: string | undefined,
  nodeEnv: string | undefined
): string => {
  const normalized = configuredValue?.trim()
  if (normalized) return normalized

  if (nodeEnv === "production") return "cloudflare"
  if (nodeEnv === "test") return "noop"
  return "mailpit"
}

/**
 * Portlessを介さない単体起動向けのmain checkout URLだけをlocal developmentに補う。
 * 通常のAPI dev scriptはworktree-awareなURLをMAILPIT_URLへ先に注入する。
 */
export const resolveMailpitUrl = (
  configuredValue: string | undefined,
  nodeEnv: string | undefined
): string | undefined => {
  const normalized = configuredValue?.trim()
  if (normalized) return normalized

  return nodeEnv === undefined || nodeEnv === "development"
    ? localMailpitUrl
    : undefined
}

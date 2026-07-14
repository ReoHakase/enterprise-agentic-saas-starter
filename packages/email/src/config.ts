const localEmailFrom = "noreply@example.test"

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

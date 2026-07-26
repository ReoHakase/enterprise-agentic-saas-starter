import * as v from "valibot"

const webSearchOutputSchema = v.object({
  sources: v.pipe(
    v.array(
      v.object({
        title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
        url: v.pipe(v.string(), v.minLength(1), v.maxLength(2_048)),
      })
    ),
    v.maxLength(5)
  ),
})

const privateHostnamePattern =
  /(?:^localhost$|\.(?:localhost|local|internal|invalid|test)$)/u
const isPrivateIpv4 = (hostname: string) => {
  const values = hostname.split(".").map(Number)
  if (
    values.length !== 4 ||
    !values.every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 255
    )
  ) {
    return false
  }
  const first = values[0]
  const second = values[1]
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && (second ?? 0) >= 16 && (second ?? 0) <= 31) ||
    (first === 192 && second === 168)
  )
}

const isPrivateHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase()
  return (
    normalized.includes(":") ||
    privateHostnamePattern.test(normalized) ||
    isPrivateIpv4(normalized)
  )
}

const publicUrl = (value: string): string | null => {
  try {
    const url = new URL(value)
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username !== "" ||
      url.password !== "" ||
      isPrivateHostname(url.hostname)
    ) {
      return null
    }
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

export const webSearchLinksFromToolOutput = (
  toolName: string,
  output: unknown
) => {
  if (toolName !== "web_search") return []
  const parsed = v.safeParse(webSearchOutputSchema, output)
  if (!parsed.success) return []
  return parsed.output.sources.flatMap((source) => {
    const url = publicUrl(source.url)
    return url ? [{ title: source.title, url }] : []
  })
}

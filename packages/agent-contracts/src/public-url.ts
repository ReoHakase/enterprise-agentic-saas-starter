const MAXIMUM_PUBLIC_URL_CHARACTERS = 2_048
const parseIpv6Half = (value: string) =>
  value === ""
    ? []
    : value.split(":").map((part) => {
        if (!/^[0-9a-f]{1,4}$/u.test(part)) return Number.NaN
        return Number.parseInt(part, 16)
      })

const isReservedIpv4Range = (first: number, second: number, third: number) =>
  first === 0 ||
  first === 10 ||
  first === 127 ||
  (first === 100 && second >= 64 && second <= 127) ||
  (first === 169 && second === 254) ||
  (first === 172 && second >= 16 && second <= 31) ||
  (first === 192 &&
    (second === 0 || second === 168 || (second === 88 && third === 99))) ||
  (first === 198 && (second === 18 || second === 19 || second === 51)) ||
  (first === 203 && second === 0 && third === 113) ||
  first >= 224

const isReservedIpv4 = (hostname: string) => {
  const octets = hostname.split(".").map(Number)
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false
  }
  const [first = 0, second = 0, third = 0] = octets
  return isReservedIpv4Range(first, second, third)
}

const parseIpv6 = (hostname: string): number[] | null => {
  const raw = hostname.replace(/^\[|\]$/gu, "").toLowerCase()
  if (!raw.includes(":") || raw.includes("%")) return null
  const halves = raw.split("::")
  if (halves.length > 2) return null
  const left = parseIpv6Half(halves[0] ?? "")
  const right = parseIpv6Half(halves[1] ?? "")
  if ([...left, ...right].some(Number.isNaN)) return null
  if (halves.length === 1) return left.length === 8 ? left : null
  const omitted = 8 - left.length - right.length
  if (omitted < 1) return null
  return [...left, ...Array.from({ length: omitted }, () => 0), ...right]
}

const ipv6PrefixMatches = (
  words: readonly number[],
  prefixWords: readonly number[],
  prefixBits: number
) => {
  const fullWords = Math.floor(prefixBits / 16)
  const remainingBits = prefixBits % 16
  for (let index = 0; index < fullWords; index += 1) {
    if (words[index] !== prefixWords[index]) return false
  }
  if (remainingBits === 0) return true
  const mask = (0xffff << (16 - remainingBits)) & 0xffff
  return (
    ((words[fullWords] ?? 0) & mask) === ((prefixWords[fullWords] ?? 0) & mask)
  )
}

const isReservedIpv6 = (hostname: string) => {
  const words = parseIpv6(hostname)
  if (!words) return false
  if (ipv6PrefixMatches(words, [0, 0, 0, 0, 0, 0xffff], 96)) {
    return isReservedIpv4(
      `${(words[6] ?? 0) >> 8}.${(words[6] ?? 0) & 0xff}.${(words[7] ?? 0) >> 8}.${(words[7] ?? 0) & 0xff}`
    )
  }
  const prefixes = [
    { words: [0, 0, 0, 0, 0, 0], bits: 96 },
    { words: [0x2001, 0x0002, 0], bits: 48 },
    { words: [0x2001, 0x0010], bits: 28 },
    { words: [0x2001, 0x0db8], bits: 32 },
    { words: [0x2002], bits: 16 },
    { words: [0x3fff], bits: 20 },
    { words: [0xfc00], bits: 7 },
    { words: [0xfe80], bits: 10 },
    { words: [0xff00], bits: 8 },
  ] as const
  return prefixes.some((prefix) =>
    ipv6PrefixMatches(words, prefix.words, prefix.bits)
  )
}

const isReservedHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase().replace(/\.+$/u, "")
  return (
    normalized === "" ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".invalid") ||
    normalized.endsWith(".test") ||
    isReservedIpv4(normalized) ||
    isReservedIpv6(normalized)
  )
}

export const canonicalizePublicHttpUrl = (value: unknown): string | null => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAXIMUM_PUBLIC_URL_CHARACTERS
  ) {
    return null
  }
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/\.+$/u, "")
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username !== "" ||
      url.password !== "" ||
      isReservedHostname(hostname)
    ) {
      return null
    }
    url.hostname = hostname
    url.search = ""
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

const allowedExternalProfileImageHosts = new Set([
  "avatars.githubusercontent.com",
  "cdn.jsdelivr.net",
  "api.dicebear.com",
])

const profileImagePathPrefix = "/files/profile-images/"

const isLocalDevelopmentHost = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname.endsWith(".localhost")

const isAllowedFirstPartyApiUrl = (url: URL) =>
  !url.username &&
  !url.password &&
  (url.protocol === "https:" ||
    (url.protocol === "http:" && isLocalDevelopmentHost(url.hostname)))

const hasCredentials = (url: URL) => Boolean(url.username || url.password)

export const isFirstPartyProfileImageUrl = (
  value: string | null | undefined,
  apiBaseUrl: string
) => {
  if (!value) return false
  try {
    const apiUrl = new URL(apiBaseUrl)
    const url = new URL(value, apiUrl)
    return (
      isAllowedFirstPartyApiUrl(apiUrl) &&
      !hasCredentials(url) &&
      url.origin === apiUrl.origin &&
      url.pathname.startsWith(profileImagePathPrefix)
    )
  } catch {
    return false
  }
}

export const getSafeProfileImageUrl = (
  value: string | null | undefined,
  apiBaseUrl: string
) => {
  if (!value) return undefined

  try {
    const apiUrl = new URL(apiBaseUrl)
    const url = new URL(value, apiUrl)

    if (!isAllowedFirstPartyApiUrl(apiUrl) || hasCredentials(url)) {
      return undefined
    }

    const firstPartyProfileImage = isFirstPartyProfileImageUrl(
      value,
      apiBaseUrl
    )
    if (firstPartyProfileImage) return url.toString()

    if (
      url.protocol !== "https:" ||
      !allowedExternalProfileImageHosts.has(url.hostname)
    ) {
      return undefined
    }

    return url.toString()
  } catch {
    return undefined
  }
}

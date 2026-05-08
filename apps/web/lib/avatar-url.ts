const allowedAvatarHosts = new Set([
  "avatars.githubusercontent.com",
  "cdn.jsdelivr.net",
  "api.dicebear.com",
])

export const getSafeAvatarUrl = (value: string | null | undefined) => {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value)
    if (url.protocol !== "https:") {
      return undefined
    }
    if (!allowedAvatarHosts.has(url.hostname)) {
      return undefined
    }
    return url.toString()
  } catch {
    return undefined
  }
}

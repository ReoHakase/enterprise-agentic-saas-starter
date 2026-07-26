import Bowser from "bowser"

export type SessionClientDetails = {
  browser: string
  device: string
  engine: string
  operatingSystem: string
  platform: string
  userAgent: string
}

const withVersion = (name?: string, version?: string) =>
  [name, version].filter(Boolean).join(" ")

const titleCase = (value: string) =>
  value.replace(/(^|[-_ ])\w/g, (match) => match.toUpperCase())

const fallbackDeviceName = (osName?: string, platformType?: string) => {
  if (osName === "macOS") return "Mac"
  if (osName === "Windows") return "Windows PC"
  if (osName === "Chrome OS") return "Chromebook"
  if (osName === "Linux") return "Linux computer"
  if (platformType) return `${titleCase(platformType)} device`
  return "Unknown device"
}

export const describeSessionClient = (
  userAgent: string | null
): SessionClientDetails => {
  if (!userAgent) {
    return {
      browser: "Unknown browser",
      device: "Unknown device",
      engine: "Unknown engine",
      operatingSystem: "Unknown OS",
      platform: "Unknown platform",
      userAgent: "No User-Agent recorded",
    }
  }

  const { browser, engine, os, platform } = Bowser.parse(userAgent)
  const fallbackName = fallbackDeviceName(os.name, platform.type)
  const hardwareName = platform.model
    ? [platform.vendor, platform.model].filter(Boolean).join(" ")
    : [platform.vendor, fallbackName].filter(Boolean).join(" ")

  return {
    browser: withVersion(browser.name, browser.version) || "Unknown browser",
    device: hardwareName || fallbackName,
    engine: withVersion(engine.name, engine.version) || "Unknown engine",
    operatingSystem:
      withVersion(os.name, os.versionName ?? os.version) || "Unknown OS",
    platform: platform.type ? titleCase(platform.type) : "Unknown platform",
    userAgent,
  }
}

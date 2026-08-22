import { defineConfig, type PlaywrightTestConfig } from "@playwright/test"

import { createAppPlaywrightProfile } from "./e2e/fixtures/playwright-profile-app"
import { createDeterministicPlaywrightProfile } from "./e2e/fixtures/playwright-profile-deterministic"
import { createFullPlaywrightProfile } from "./e2e/fixtures/playwright-profile-full"

type WebPlaywrightProfile = "app" | "deterministic" | "full"

const parseWebPlaywrightProfile = (
  value: string | undefined
): WebPlaywrightProfile => {
  const profile = value?.trim() || "deterministic"
  if (profile === "app" || profile === "deterministic" || profile === "full") {
    return profile
  }

  throw new Error("WEB_PLAYWRIGHT_PROFILE must be app, deterministic, or full")
}

const profileFactories = {
  app: createAppPlaywrightProfile,
  deterministic: createDeterministicPlaywrightProfile,
  full: createFullPlaywrightProfile,
} satisfies Record<WebPlaywrightProfile, () => PlaywrightTestConfig>

const profile = parseWebPlaywrightProfile(process.env.WEB_PLAYWRIGHT_PROFILE)

export default defineConfig(profileFactories[profile]())

import * as Sentry from "@sentry/bun"

import { env } from "../env"
import { configureObservability } from "./runtime"
import { createSentryObservabilityRuntime } from "./sentry-adapter"
import {
  filterSentryIntegrations,
  sentryPrivacyOptions,
  SPOTLIGHT_DSN,
} from "./sentry-options"
import { resolveSpotlightTarget } from "./spotlight"
import { withStructuredConsole } from "./structured-console"

export const initializeBunObservability = (): void => {
  const spotlight = resolveSpotlightTarget(env.SENTRY_SPOTLIGHT, env.NODE_ENV)
  const spotlightEnabled = spotlight !== false
  const dsn = spotlightEnabled
    ? SPOTLIGHT_DSN
    : env.NODE_ENV === "production"
      ? env.SENTRY_DSN
      : undefined

  if (dsn) {
    Sentry.init({
      ...sentryPrivacyOptions,
      dsn,
      enableLogs: true,
      enabled: true,
      environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
      integrations: filterSentryIntegrations,
      release: env.SENTRY_RELEASE,
      sampleRate: 1,
      spotlight,
      tracesSampleRate: spotlightEnabled ? 1 : env.SENTRY_TRACES_SAMPLE_RATE,
    })
  }

  configureObservability(
    withStructuredConsole(
      createSentryObservabilityRuntime(Sentry, env.APP_NAME),
      env.APP_NAME
    )
  )
}

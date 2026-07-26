import {
  captureRouterTransitionStart,
  consoleLoggingIntegration,
  init,
} from "@sentry/nextjs"

import { clientEnv } from "@/lib/env.client"
import {
  resolveSampleRate,
  resolveSentryDsn,
  resolveSpotlightConfig,
} from "@/lib/observability/sentry-runtime"
import {
  beforeSendSentryError,
  beforeSendSentryLog,
  beforeSendSentryTransaction,
  scrubSentryBreadcrumb,
} from "@/lib/observability/sentry-scrub"

const spotlight = resolveSpotlightConfig(
  clientEnv.NEXT_PUBLIC_SENTRY_SPOTLIGHT,
  process.env.NODE_ENV
)
const dsn = resolveSentryDsn(
  clientEnv.NEXT_PUBLIC_SENTRY_DSN,
  process.env.NODE_ENV,
  spotlight
)

if (spotlight || dsn) {
  init({
    beforeBreadcrumb: scrubSentryBreadcrumb,
    beforeSend: beforeSendSentryError,
    beforeSendLog: beforeSendSentryLog,
    beforeSendTransaction: beforeSendSentryTransaction,
    dsn,
    enableLogs: true,
    environment: spotlight
      ? "local"
      : (clientEnv.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production"),
    initialScope: {
      tags: {
        runtime: "browser",
        service: "web",
      },
    },
    integrations: spotlight
      ? [
          consoleLoggingIntegration({
            levels: ["log", "warn", "error"],
          }),
        ]
      : [],
    maxBreadcrumbs: 50,
    normalizeDepth: 3,
    sampleRate: spotlight
      ? 1
      : resolveSampleRate(clientEnv.NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE, 1),
    sendDefaultPii: false,
    spotlight,
    tracePropagationTargets: [clientEnv.NEXT_PUBLIC_API_BASE_URL],
    tracesSampleRate: spotlight
      ? 1
      : resolveSampleRate(clientEnv.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, 0.1),
  })
}

export const onRouterTransitionStart = captureRouterTransitionStart

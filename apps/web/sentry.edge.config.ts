import * as Sentry from "@sentry/nextjs"

import { serverEnv } from "@/lib/env.server"
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
  serverEnv.SENTRY_SPOTLIGHT,
  process.env.NODE_ENV
)
const dsn = resolveSentryDsn(
  serverEnv.SENTRY_DSN,
  process.env.NODE_ENV,
  spotlight
)

if (spotlight || dsn) {
  Sentry.init({
    beforeBreadcrumb: scrubSentryBreadcrumb,
    beforeSend: beforeSendSentryError,
    beforeSendLog: beforeSendSentryLog,
    beforeSendTransaction: beforeSendSentryTransaction,
    dsn,
    enableLogs: true,
    environment: spotlight
      ? "local"
      : (serverEnv.SENTRY_ENVIRONMENT ?? "production"),
    initialScope: {
      tags: {
        runtime: "nextjs-edge",
        service: "web",
      },
    },
    integrations: spotlight
      ? [
          Sentry.consoleLoggingIntegration({
            levels: ["log", "warn", "error"],
          }),
        ]
      : [],
    maxBreadcrumbs: 50,
    normalizeDepth: 3,
    sampleRate: spotlight
      ? 1
      : resolveSampleRate(serverEnv.SENTRY_ERROR_SAMPLE_RATE, 1),
    sendDefaultPii: false,
    spotlight,
    tracePropagationTargets: [serverEnv.API_PUBLIC_URL],
    tracesSampleRate: spotlight
      ? 1
      : resolveSampleRate(serverEnv.SENTRY_TRACES_SAMPLE_RATE, 0.1),
  })
}

import { db } from "@enterprise-agentic-saas/db"
import {
  captureException,
  getActiveSpan,
  getIsolationScope,
  logger,
  setHttpStatus,
  startSpan,
  updateSpanName,
  withScope,
  withSentry,
} from "@sentry/cloudflare"
import { WorkerEntrypoint } from "cloudflare:workers"
import { Elysia } from "elysia"
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker"

import { createApp } from "./app"
import { handleDevelopmentFileSeedRequest } from "./development/file-seed-handler"
import { sweepAgentActions } from "./modules/agent/actions/repository"
import { createAgentInternalApp } from "./modules/agent/internal-api"
import {
  agentMaintenanceResponse,
  isAgentMaintenanceMode,
  publicAgentRuntimeGateResponse,
} from "./modules/agent/maintenance"
import {
  configureAgentRuntime,
  type AgentRuntimeBinding,
} from "./modules/agent/runtime"
import { processAgentAssetLifecycle } from "./modules/files/agent-assets-cleanup"
import { processFileCleanupJobs } from "./modules/files/cleanup-jobs"
import {
  type FileImagesBinding,
  type FileR2Bucket,
} from "./modules/files/runtime"
import { configureFileStorageRuntimeFromWorkerEnvironment } from "./modules/files/worker-runtime"
import {
  processOrganizationDeletionJobs,
  type OrganizationFilesBucket,
} from "./modules/organizations/deletion-jobs"
import { processInvitationEmailJobs } from "./modules/organizations/invitation-email-jobs"
import { processProfileImageCleanupJobs } from "./modules/profile-images/cleanup-jobs"
import { configureObservability } from "./platform/observability/runtime"
import { createSentryObservabilityRuntime } from "./platform/observability/sentry-adapter"
import {
  filterSentryIntegrations,
  sentryPrivacyOptions,
  SPOTLIGHT_DSN,
} from "./platform/observability/sentry-options"
import { resolveSpotlightTarget } from "./platform/observability/spotlight"
import { withStructuredConsole } from "./platform/observability/structured-console"
import { authPlugin } from "./platform/plugins/auth"
import { corsPlugin } from "./platform/plugins/cors"
import { serverTimingPlugin } from "./platform/plugins/server-timing"

type WorkerSentryEnv = {
  AGENT_RUNTIME?: AgentRuntimeBinding
  AGENT_ASSET_UPLOAD_ENABLED?: string
  AGENT_MAINTENANCE_MODE?: string
  DEV_FILE_SEED_TOKEN?: string
  FILES: FileR2Bucket & OrganizationFilesBucket
  IMAGES: FileImagesBinding
  NODE_ENV?: string
  SENTRY_DSN?: string
  SENTRY_ENVIRONMENT?: string
  SENTRY_RELEASE?: string
  SENTRY_SPOTLIGHT?: string
  SENTRY_TRACES_SAMPLE_RATE?: string
  TURSO_DATABASE_URL?: string
}

type WorkerExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void
}

type WorkerScheduledController = {
  cron: string
  scheduledTime: number
}

const tracesSampleRate = (value: string | undefined): number => {
  const parsed = Number(value ?? "0.1")
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.1
}

const createWorkerSentryOptions = (workerEnv: WorkerSentryEnv) => {
  const development = workerEnv.NODE_ENV === "development"
  const spotlight = resolveSpotlightTarget(
    workerEnv.SENTRY_SPOTLIGHT,
    development ? "development" : "production"
  )
  const spotlightEnabled = spotlight !== false

  return {
    ...sentryPrivacyOptions,
    dsn: spotlightEnabled
      ? SPOTLIGHT_DSN
      : development
        ? undefined
        : workerEnv.SENTRY_DSN,
    enableLogs: true,
    environment:
      workerEnv.SENTRY_ENVIRONMENT ??
      (development ? "development" : "production"),
    integrations: filterSentryIntegrations,
    release: workerEnv.SENTRY_RELEASE,
    sampleRate: 1,
    spotlight,
    tracesSampleRate: spotlightEnabled
      ? 1
      : tracesSampleRate(workerEnv.SENTRY_TRACES_SAMPLE_RATE),
  }
}

const sentryRuntimeApi = {
  captureException,
  getActiveSpan,
  getIsolationScope,
  logger,
  setHttpStatus,
  startSpan,
  updateSpanName,
  withScope,
}

configureObservability(
  withStructuredConsole(
    createSentryObservabilityRuntime(
      sentryRuntimeApi,
      "enterprise-agentic-saas-api"
    ),
    "enterprise-agentic-saas-api"
  )
)

// Bun向けSentry SDKをbundleせず、Worker requestごとにCloudflare SDKを初期化する。
const worker = new Elysia({ adapter: CloudflareAdapter })
  .use(createApp(db))
  .use(authPlugin)
  .use(corsPlugin)
  .use(serverTimingPlugin)
  .compile()

const appFetch = worker.fetch.bind(worker)

const agentInternalWorker = new Elysia({ adapter: CloudflareAdapter })
  .use(createAgentInternalApp(db))
  .compile()
const agentInternalFetch = agentInternalWorker.fetch.bind(agentInternalWorker)

class AgentInternalApiBase extends WorkerEntrypoint<WorkerSentryEnv> {
  fetch(request: Request): Promise<Response> | Response {
    if (isAgentMaintenanceMode(this.env.AGENT_MAINTENANCE_MODE)) {
      return agentMaintenanceResponse()
    }
    // named entrypointはdefault/public Workerとは別isolateになり得るため、
    // asset prepare/execute/model imageの全経路でbindingを初期化する。
    configureFileStorageRuntimeFromWorkerEnvironment(this.env)
    return agentInternalFetch(request)
  }
}

export const AgentInternalApi = withSentry(
  createWorkerSentryOptions,
  AgentInternalApiBase
)

const workerWithScheduled = {
  async fetch(
    request: Request,
    workerEnv: WorkerSentryEnv,
    _context: WorkerExecutionContext
  ) {
    const agentGateResponse = publicAgentRuntimeGateResponse(request, {
      maintenanceMode: workerEnv.AGENT_MAINTENANCE_MODE,
      runtimeAvailable: workerEnv.AGENT_RUNTIME !== undefined,
    })
    if (agentGateResponse) return agentGateResponse
    if (workerEnv.AGENT_RUNTIME) configureAgentRuntime(workerEnv.AGENT_RUNTIME)
    configureFileStorageRuntimeFromWorkerEnvironment(workerEnv)
    const seedResponse = await handleDevelopmentFileSeedRequest(
      db,
      request,
      workerEnv
    )
    return seedResponse ?? appFetch(request)
  },
  scheduled(
    _controller: WorkerScheduledController,
    workerEnv: WorkerSentryEnv,
    context: WorkerExecutionContext
  ) {
    if (isAgentMaintenanceMode(workerEnv.AGENT_MAINTENANCE_MODE)) return
    const deletionJobs = processOrganizationDeletionJobs({
      bucket: workerEnv.FILES,
      database: db,
      onFailure: ({ attempts }) => {
        const error = new Error("Organization file cleanup failed")
        captureException(error, {
          tags: {
            component: "organization-deletion",
            errorCode: "r2_cleanup_failed",
          },
          extra: { attempts },
        })
        console.error({
          attempts,
          component: "organization-deletion",
          errorCode: "r2_cleanup_failed",
          event: "cleanup_job_failed",
          level: "error",
        })
      },
    }).then((result) => {
      console.info({
        component: "organization-deletion",
        event: "cleanup_batch_completed",
        level: "info",
        ...result,
      })
      return result
    })
    const fileCleanupJobs = processFileCleanupJobs({
      bucket: workerEnv.FILES,
      database: db,
      onFailure: ({ attempts }) => {
        const error = new Error("File cleanup failed")
        captureException(error, {
          tags: {
            component: "file-cleanup",
            errorCode: "r2_cleanup_failed",
          },
          extra: { attempts },
        })
        console.error({
          attempts,
          component: "file-cleanup",
          errorCode: "r2_cleanup_failed",
          event: "cleanup_job_failed",
          level: "error",
        })
      },
    }).then((result) => {
      console.info({
        component: "file-cleanup",
        event: "cleanup_batch_completed",
        level: "info",
        ...result,
      })
      return result
    })
    const profileImageCleanupJobs = processProfileImageCleanupJobs({
      bucket: workerEnv.FILES,
      database: db,
      onFailure: ({ attempts }) => {
        const error = new Error("Profile image cleanup failed")
        captureException(error, {
          tags: {
            component: "profile-image-cleanup",
            errorCode: "r2_cleanup_failed",
          },
          extra: { attempts },
        })
        console.error({
          attempts,
          component: "profile-image-cleanup",
          errorCode: "r2_cleanup_failed",
          event: "cleanup_job_failed",
          level: "error",
        })
      },
    }).then((result) => {
      console.info({
        component: "profile-image-cleanup",
        event: "cleanup_batch_completed",
        level: "info",
        ...result,
      })
      return result
    })
    const agentAssetLifecycle = processAgentAssetLifecycle({
      bucket: workerEnv.FILES,
      database: db,
      onFailure: ({ attempts, errorCode }) => {
        const error = new Error("Agent asset cleanup failed")
        captureException(error, {
          tags: {
            component: "agent-asset-cleanup",
            errorCode,
          },
          extra: { attempts },
        })
        console.error({
          attempts,
          component: "agent-asset-cleanup",
          errorCode,
          event: "cleanup_job_failed",
          level: "error",
        })
      },
    }).then((result) => {
      console.info({
        component: "agent-asset-cleanup",
        event: "cleanup_batch_completed",
        level: "info",
        cleanupClaimed: result.cleanup.claimed,
        cleanupCompleted: result.cleanup.completed,
        cleanupFailed: result.cleanup.failed,
        cleanupStale: result.cleanup.stale,
        expiryConsidered: result.expiry.considered,
        expiryCompleted: result.expiry.expired,
        usageBucketsDeleted: result.usagePurge.bucketsDeleted,
        usageOperationsDeleted: result.usagePurge.operationsDeleted,
      })
      return result
    })
    const invitationJobs = processInvitationEmailJobs({
      database: db,
      onFailure: ({ attempts, errorCode, retryable }) => {
        const error = new Error("Organization invitation delivery failed")
        captureException(error, {
          tags: {
            component: "invitation-email",
            errorCode,
            retryable,
          },
          extra: { attempts },
        })
        console.error({
          attempts,
          component: "invitation-email",
          errorCode,
          event: "delivery_job_failed",
          level: "error",
          retryable,
        })
      },
    }).then((result) => {
      console.info({
        component: "invitation-email",
        event: "delivery_batch_completed",
        level: "info",
        ...result,
      })
      return result
    })
    const agentActionSweep = sweepAgentActions(db).then((result) => {
      console.info({
        component: "agent-action-sweep",
        event: "agent_action_sweep_completed",
        level: "info",
        ...result,
      })
      return result
    })

    context.waitUntil(
      Promise.all([
        agentActionSweep,
        deletionJobs,
        fileCleanupJobs,
        profileImageCleanupJobs,
        agentAssetLifecycle,
        invitationJobs,
      ]).then(() => undefined)
    )
  },
}

export default withSentry<WorkerSentryEnv>(
  createWorkerSentryOptions,
  workerWithScheduled
)

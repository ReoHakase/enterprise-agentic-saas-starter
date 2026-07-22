import { db } from "@enterprise-agentic-saas/db"
import * as Sentry from "@sentry/cloudflare"
import { WorkerEntrypoint } from "cloudflare:workers"
import { Elysia } from "elysia"
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker"

import type { AgentInternalApiContract } from "./agent-client"
import { createApp } from "./app"
import { handleDevelopmentFileSeedRequest } from "./development/file-seed-handler"
import { sweepAgentActions } from "./modules/agent/action-repository"
import { createAgentInternalApi } from "./modules/agent/internal-api"
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
import { configureObservability } from "./observability/runtime"
import { createSentryObservabilityRuntime } from "./observability/sentry-adapter"
import {
  filterSentryIntegrations,
  sentryPrivacyOptions,
  SPOTLIGHT_DSN,
} from "./observability/sentry-options"
import { resolveSpotlightTarget } from "./observability/spotlight"
import { withStructuredConsole } from "./observability/structured-console"
import { authPlugin } from "./plugins/auth"
import { corsPlugin } from "./plugins/cors"
import { serverTimingPlugin } from "./plugins/server-timing"

type WorkerSentryEnv = {
  AGENT_ASSET_UPLOAD_ENABLED?: string
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

const agentInternalApi = createAgentInternalApi(db)

export class AgentInternalApi
  extends WorkerEntrypoint<WorkerSentryEnv>
  implements AgentInternalApiContract
{
  consumeConnectionTicket(
    input: Parameters<AgentInternalApiContract["consumeConnectionTicket"]>[0]
  ) {
    return agentInternalApi.consumeConnectionTicket(input)
  }

  startRun(input: Parameters<AgentInternalApiContract["startRun"]>[0]) {
    return agentInternalApi.startRun(input)
  }

  cancelRun(input: Parameters<AgentInternalApiContract["cancelRun"]>[0]) {
    return agentInternalApi.cancelRun(input)
  }

  finishRun(input: Parameters<AgentInternalApiContract["finishRun"]>[0]) {
    return agentInternalApi.finishRun(input)
  }

  readAccountContext(
    input: Parameters<AgentInternalApiContract["readAccountContext"]>[0]
  ) {
    return agentInternalApi.readAccountContext(input)
  }

  readActiveOrganization(
    input: Parameters<AgentInternalApiContract["readActiveOrganization"]>[0]
  ) {
    return agentInternalApi.readActiveOrganization(input)
  }

  searchOrganizationMembers(
    input: Parameters<AgentInternalApiContract["searchOrganizationMembers"]>[0]
  ) {
    return agentInternalApi.searchOrganizationMembers(input)
  }

  searchIssueLabels(
    input: Parameters<AgentInternalApiContract["searchIssueLabels"]>[0]
  ) {
    return agentInternalApi.searchIssueLabels(input)
  }

  searchIssues(input: Parameters<AgentInternalApiContract["searchIssues"]>[0]) {
    return agentInternalApi.searchIssues(input)
  }

  getIssue(input: Parameters<AgentInternalApiContract["getIssue"]>[0]) {
    return agentInternalApi.getIssue(input)
  }

  prepareCreateIssue(
    input: Parameters<AgentInternalApiContract["prepareCreateIssue"]>[0]
  ) {
    return agentInternalApi.prepareCreateIssue(input)
  }

  prepareUpdateIssue(
    input: Parameters<AgentInternalApiContract["prepareUpdateIssue"]>[0]
  ) {
    return agentInternalApi.prepareUpdateIssue(input)
  }

  prepareDeleteIssue(
    input: Parameters<AgentInternalApiContract["prepareDeleteIssue"]>[0]
  ) {
    return agentInternalApi.prepareDeleteIssue(input)
  }

  getIssueActionDecision(
    input: Parameters<AgentInternalApiContract["getIssueActionDecision"]>[0]
  ) {
    return agentInternalApi.getIssueActionDecision(input)
  }

  resumeApprovedAction(
    input: Parameters<AgentInternalApiContract["resumeApprovedAction"]>[0]
  ) {
    return agentInternalApi.resumeApprovedAction(input)
  }

  executeApprovedAction(
    input: Parameters<AgentInternalApiContract["executeApprovedAction"]>[0]
  ) {
    return agentInternalApi.executeApprovedAction(input)
  }

  getAgentImageForModel(
    input: Parameters<AgentInternalApiContract["getAgentImageForModel"]>[0]
  ) {
    configureFileStorageRuntimeFromWorkerEnvironment(this.env)
    return agentInternalApi.getAgentImageForModel(input)
  }
}

const tracesSampleRate = (value: string | undefined): number => {
  const parsed = Number(value ?? "0.1")
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.1
}

configureObservability(
  withStructuredConsole(
    createSentryObservabilityRuntime(Sentry, "enterprise-agentic-saas-api"),
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

const workerWithScheduled = {
  async fetch(
    request: Request,
    workerEnv: WorkerSentryEnv,
    _context: WorkerExecutionContext
  ) {
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
    const deletionJobs = processOrganizationDeletionJobs({
      bucket: workerEnv.FILES,
      database: db,
      onFailure: ({ attempts }) => {
        const error = new Error("Organization file cleanup failed")
        Sentry.captureException(error, {
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
        Sentry.captureException(error, {
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
        Sentry.captureException(error, {
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
        Sentry.captureException(error, {
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
        Sentry.captureException(error, {
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

export default Sentry.withSentry<WorkerSentryEnv>((workerEnv) => {
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
}, workerWithScheduled)

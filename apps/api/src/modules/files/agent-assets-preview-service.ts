import { HttpError } from "../../errors/http-error"
import { agentAssetProviderUnavailable as providerUnavailable } from "./agent-assets-runtime"
import { FILE_PREVIEW_WIDTHS } from "./constants"
import { createModelImageResponse } from "./model-image-service"
import type { AgentAssetPreviewPorts } from "./ports"
import { requestImagePreview } from "./read-support"

export const createAgentAssetPreviewService = (
  ports: AgentAssetPreviewPorts
) => {
  const previewAgentAsset = async (input: {
    actorUserId: string
    assetId: string
    organizationId: string
    request: Request
    sessionId: string
    width: string
  }) => {
    const width = FILE_PREVIEW_WIDTHS.find(
      (candidate) => String(candidate) === input.width
    )
    if (width === undefined) {
      throw new HttpError({ code: "validation_error" })
    }
    const value = await ports.findPreviewableAgentAssetForSession({
      assetId: input.assetId,
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      userId: input.actorUserId,
    })
    if (!value.storage.objectKey || !value.storage.etag) {
      throw providerUnavailable("r2", "readAgentAssetPreviewMetadata")
    }
    const cacheTtlSeconds =
      value.asset.status === "promoted"
        ? 3 * 24 * 60 * 60
        : Math.max(
            1,
            Math.min(
              3 * 24 * 60 * 60,
              Math.floor((value.asset.expiresAt.getTime() - Date.now()) / 1000)
            )
          )
    return requestImagePreview(ports.getRuntime(), {
      browserRequest: input.request,
      cacheTtlSeconds,
      objectKey: value.storage.objectKey,
      organizationId: input.organizationId,
      resourceId: value.asset.id,
      resourceKind: "agent-asset",
      sourceEtag: value.storage.etag,
      width,
    })
  }

  const getAgentImageForModel = async (input: {
    grant: string
    assetId: string
  }): Promise<Response> => {
    const access = await ports.findAgentRunAssetForModel(input)
    if (!access.storage.objectKey || !access.storage.etag) {
      throw providerUnavailable("r2", "readAgentAssetImage")
    }
    return createModelImageResponse(ports.getRuntime(), {
      etag: access.storage.etag,
      objectKey: access.storage.objectKey,
      resource: "agent_asset",
    })
  }

  const removeAgentAsset = async (input: {
    actorUserId: string
    assetId: string
    organizationId: string
    sessionId: string
  }) => {
    const deleted = await ports.deleteReadyAgentAsset({
      assetId: input.assetId,
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      userId: input.actorUserId,
    })
    if (!deleted) {
      throw new HttpError({ code: "not_found" })
    }
  }

  return { getAgentImageForModel, previewAgentAsset, removeAgentAsset }
}

export type AgentAssetPreviewService = ReturnType<
  typeof createAgentAssetPreviewService
>

import { resolveExplicitlyEnabledFlag } from "../../runtime-flags"
import {
  configureFileStorageRuntime,
  type FileImagesBinding,
  type FilePreviewBinding,
  type FileR2Bucket,
  type FileStorageRuntime,
} from "./runtime"

export type FileStorageWorkerEnvironment = {
  AGENT_ASSET_UPLOAD_ENABLED?: string
  FILES: FileR2Bucket
  IMAGE_PREVIEWS: FilePreviewBinding
  IMAGES: FileImagesBinding
}

/** HTTP fetchとnamed RPCを同じcapability/flag設定へ収束させる。 */
export const configureFileStorageRuntimeFromWorkerEnvironment = (
  environment: FileStorageWorkerEnvironment
): FileStorageRuntime => {
  const runtime: FileStorageRuntime = {
    agentAssetUploadEnabled: resolveExplicitlyEnabledFlag(
      environment.AGENT_ASSET_UPLOAD_ENABLED
    ),
    bucket: environment.FILES,
    images: environment.IMAGES,
    previews: environment.IMAGE_PREVIEWS,
  }
  configureFileStorageRuntime(runtime)
  return runtime
}

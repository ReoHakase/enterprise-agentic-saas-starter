import { createModelImageResponse } from "./model-image-service"
import type { AgentIssueAttachmentPorts } from "./ports"

export const createAgentIssueAttachmentService = (
  ports: AgentIssueAttachmentPorts
) => {
  const getIssueAttachmentImageForModel = async (input: {
    fileId: string
    grant: string
    issueId: string
  }): Promise<Response> => {
    const stored = await ports.findIssueAttachmentForModel(input)
    if (!stored.etag) {
      throw new Error("Ready issue attachment is missing its etag")
    }
    return createModelImageResponse(ports.getRuntime(), {
      etag: stored.etag,
      objectKey: stored.objectKey,
      resource: "issue_attachment",
    })
  }

  return { getIssueAttachmentImageForModel }
}

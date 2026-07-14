import { createApiClient } from "@enterprise-agentic-saas/api/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ConsoleApiError } from "@/features/console/api"

import {
  createIssue,
  createIssueComment,
  deleteIssue,
  deleteIssueComment,
  listIssueComments,
  listIssues,
  updateIssue,
  updateIssueComment,
} from "./api"

const issue = {
  id: "issue-1",
  organizationId: "org-1",
  number: 1,
  title: "Keep date-only contracts",
  description: "",
  status: "open" as const,
  priority: "high" as const,
  assigneeId: null,
  creatorId: "user-1",
  labels: ["contract"],
  dueDate: "2026-07-21",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
}

const comment = {
  id: "comment-1",
  organizationId: "org-1",
  todoId: "issue-1",
  authorId: "user-1",
  author: { id: "user-1", name: "Reo", image: null },
  body: "Verified",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
}

const requestFrom = (input: RequestInfo | URL, init?: RequestInit) =>
  new Request(input, init)

describe("issues Eden API", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("parses issue and comment CRUD while preserving date-only due dates", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json([issue]))
      .mockResolvedValueOnce(Response.json(issue))
      .mockResolvedValueOnce(Response.json(issue))
      .mockResolvedValueOnce(Response.json(issue))
      .mockResolvedValueOnce(Response.json([comment]))
      .mockResolvedValueOnce(Response.json(comment))
      .mockResolvedValueOnce(Response.json(comment))
      .mockResolvedValueOnce(Response.json(comment))
    const client = createApiClient("https://api.example.test")

    await expect(listIssues(client, "org-1")).resolves.toEqual([issue])
    await expect(
      createIssue(client, {
        organizationId: "org-1",
        title: issue.title,
        dueDate: "2026-07-21",
      })
    ).resolves.toEqual(issue)
    await expect(
      updateIssue(client, {
        id: issue.id,
        organizationId: "org-1",
        title: issue.title,
        dueDate: "2026-07-21",
      })
    ).resolves.toEqual(issue)
    await expect(
      deleteIssue(client, { id: issue.id, organizationId: "org-1" })
    ).resolves.toEqual(issue)
    await expect(
      listIssueComments(client, { id: issue.id, organizationId: "org-1" })
    ).resolves.toEqual([comment])
    await expect(
      createIssueComment(client, {
        id: issue.id,
        organizationId: "org-1",
        body: comment.body,
      })
    ).resolves.toEqual(comment)
    await expect(
      updateIssueComment(client, {
        id: issue.id,
        commentId: comment.id,
        organizationId: "org-1",
        body: "Updated",
      })
    ).resolves.toEqual(comment)
    await expect(
      deleteIssueComment(client, {
        id: issue.id,
        commentId: comment.id,
        organizationId: "org-1",
      })
    ).resolves.toEqual(comment)

    const updateCall = fetchMock.mock.calls[2]
    if (!updateCall) throw new Error("Expected an issue update request")
    const updateRequest = requestFrom(...updateCall)
    expect(updateRequest.method).toBe("PATCH")
    await expect(updateRequest.json()).resolves.toEqual(
      expect.objectContaining({ dueDate: "2026-07-21" })
    )
  })

  it("rejects a successful response without data", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(null))
    const client = createApiClient("https://api.example.test")

    await expect(listIssues(client, "org-1")).rejects.toThrow(
      "API response did not include data"
    )
  })

  it("normalizes Eden errors and keeps safe field errors", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          error: {
            code: "validation_failed",
            message: "Fix the highlighted fields",
            fieldErrors: { title: ["Enter an issue title."] },
          },
        },
        { status: 400 }
      )
    )
    const client = createApiClient("https://api.example.test")

    const request = listIssues(client, "org-1")
    await expect(request).rejects.toBeInstanceOf(ConsoleApiError)
    await expect(request).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { title: ["Enter an issue title."] },
      message: "Fix the highlighted fields",
      status: 400,
    })
  })
})

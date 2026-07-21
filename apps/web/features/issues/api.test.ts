import { createApiClient } from "@enterprise-agentic-saas/api/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ConsoleApiError } from "@/features/console/api"

import {
  createIssue,
  createIssueComment,
  deleteIssue,
  deleteIssueComment,
  getIssueTimeline,
  listIssueComments,
  listIssues,
  updateIssue,
  updateIssueComment,
} from "./api"

const issue = {
  id: "issue-1",
  organizationId: "org-1",
  number: 1,
  title: "Keep date-time contracts",
  description: "",
  status: "open" as const,
  priority: "high" as const,
  assigneeId: null,
  creatorId: "user-1",
  labels: ["contract"],
  dueDate: "2026-07-21T09:30:00.000Z",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
}

const comment = {
  id: "comment-1",
  organizationId: "org-1",
  issueId: "issue-1",
  authorId: "user-1",
  author: { id: "user-1", name: "Reo", profileImage: null },
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

  it("parses issue and comment CRUD while preserving due date-times", async () => {
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
        dueDate: "2026-07-21T09:30:00.000Z",
      })
    ).resolves.toEqual(issue)
    await expect(
      updateIssue(client, {
        id: issue.id,
        organizationId: "org-1",
        title: issue.title,
        dueDate: "2026-07-21T09:30:00.000Z",
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
      expect.objectContaining({ dueDate: "2026-07-21T09:30:00.000Z" })
    )
  })

  it("rejects a successful response without data", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(null))
    const client = createApiClient("https://api.example.test")

    await expect(listIssues(client, "org-1")).rejects.toThrow(
      "API response did not include data"
    )
  })

  it("accepts file activity while treating timeline cursors as opaque strings", async () => {
    const opaqueCursor = "eyJ2IjoxLCJ0eXBlIjoiY29tbWVudCJ9"
    const nextCursor = "eyJ2IjoxLCJ0eXBlIjoiYWN0aXZpdHkifQ"
    fetchMock.mockResolvedValueOnce(
      Response.json({
        items: [
          {
            type: "activity",
            id: "activity-1",
            kind: "file_added",
            field: null,
            fromValue: null,
            toValue: "notes.txt",
            actor: { id: "user-1", name: "Reo", profileImage: null },
            createdAt: "2026-07-14T00:00:00.000Z",
          },
        ],
        nextCursor,
      })
    )
    const client = createApiClient("https://api.example.test")

    await expect(
      getIssueTimeline(client, {
        id: issue.id,
        organizationId: "org-1",
        cursor: opaqueCursor,
        limit: 1,
      })
    ).resolves.toMatchObject({
      items: [{ kind: "file_added", toValue: "notes.txt" }],
      nextCursor,
    })

    const timelineCall = fetchMock.mock.calls[0]
    if (!timelineCall) throw new Error("Expected a timeline request")
    const request = requestFrom(...timelineCall)
    const url = new URL(request.url)
    expect(url.searchParams.get("cursor")).toBe(opaqueCursor)
    expect(url.searchParams.get("limit")).toBe("1")
  })

  it("passes query cancellation through Eden to fetch", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([issue]))
    const client = createApiClient("https://api.example.test")
    const controller = new AbortController()

    await listIssues(client, "org-1", controller.signal)

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
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

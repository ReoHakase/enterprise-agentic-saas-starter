import {
  createApiClient,
  EdenFetchError,
} from "@enterprise-agentic-saas/api/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createIssue,
  createIssueComment,
  deleteIssue,
  deleteIssueComment,
  getIssueThumbnail,
  getIssueTimeline,
  listIssueLabels,
  listIssues,
  updateIssue,
  updateIssueComment,
  updateIssueThumbnail,
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
  revision: 1,
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
}

const issueListItem = {
  ...issue,
  attachmentCount: 0,
  commentCount: 0,
  thumbnail: null,
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

  it("uses typed issue and comment responses while preserving due date-times", async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          items: [issueListItem],
          page: 1,
          pageSize: 20,
          total: 1,
        })
      )
      .mockResolvedValueOnce(Response.json(issue))
      .mockResolvedValueOnce(Response.json(issue))
      .mockResolvedValueOnce(Response.json(issue))
      .mockResolvedValueOnce(Response.json(comment))
      .mockResolvedValueOnce(Response.json(comment))
      .mockResolvedValueOnce(Response.json(comment))
    const client = createApiClient("https://api.example.test")

    await expect(listIssues(client, "org-1")).resolves.toEqual([issueListItem])
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

  it("forwards AbortSignal to stale Issue label requests", async () => {
    let requestSignal: AbortSignal | undefined
    fetchMock.mockImplementationOnce(async (input, init) => {
      requestSignal = requestFrom(input, init).signal
      return Response.json({ items: ["bug"] })
    })
    const controller = new AbortController()
    const client = createApiClient("https://api.example.test")

    await expect(
      listIssueLabels(
        client,
        { organizationId: "org-1", search: "bu" },
        controller.signal
      )
    ).resolves.toEqual(["bug"])
    expect(requestSignal?.aborted).toBe(false)
    controller.abort()
    expect(requestSignal?.aborted).toBe(true)
  })

  it("gets, selects, and resets an Issue thumbnail", async () => {
    const thumbnail = {
      mode: "selected" as const,
      file: {
        id: "file-1",
        filename: "thumbnail.png",
        imageWidth: 640,
        imageHeight: 480,
      },
    }
    fetchMock
      .mockResolvedValueOnce(Response.json(thumbnail))
      .mockResolvedValueOnce(Response.json(thumbnail))
      .mockResolvedValueOnce(
        Response.json({ mode: "automatic", file: thumbnail.file })
      )
    const client = createApiClient("https://api.example.test")

    await expect(
      getIssueThumbnail(client, {
        id: issue.id,
        organizationId: "org-1",
      })
    ).resolves.toEqual(thumbnail)
    await updateIssueThumbnail(client, {
      id: issue.id,
      organizationId: "org-1",
      fileId: "file-1",
    })
    await updateIssueThumbnail(client, {
      id: issue.id,
      organizationId: "org-1",
      fileId: null,
    })

    const selectCall = fetchMock.mock.calls[1]
    const resetCall = fetchMock.mock.calls[2]
    if (!selectCall || !resetCall) {
      throw new Error("Expected thumbnail update requests")
    }
    const selectRequest = requestFrom(...selectCall)
    const resetRequest = requestFrom(...resetCall)
    expect(selectRequest.method).toBe("PUT")
    await expect(selectRequest.json()).resolves.toMatchObject({
      organizationId: "org-1",
      fileId: "file-1",
    })
    await expect(resetRequest.json()).resolves.toMatchObject({
      organizationId: "org-1",
      fileId: null,
    })
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
    fetchMock.mockResolvedValueOnce(
      Response.json({
        items: [issueListItem],
        page: 1,
        pageSize: 20,
        total: 1,
      })
    )
    const client = createApiClient("https://api.example.test")
    const controller = new AbortController()

    await listIssues(client, "org-1", controller.signal)

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })

  it("keeps the native Eden error", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "validation_error" }, { status: 400 })
    )
    const client = createApiClient("https://api.example.test")

    const request = listIssues(client, "org-1")
    await expect(request).rejects.toBeInstanceOf(EdenFetchError)
    await expect(request).rejects.toMatchObject({
      status: 400,
      value: { error: "validation_error" },
    })
  })
})

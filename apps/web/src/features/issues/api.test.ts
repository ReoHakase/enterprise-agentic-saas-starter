import { createApiClient } from "@enterprise-agentic-saas/api/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createIssue,
  getIssueTimeline,
  listIssues,
  updateIssue,
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

const requestFrom = (input: RequestInfo | URL, init?: RequestInit) =>
  new Request(input, init)

describe("IssueのEden API", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("型付きIssue一覧レスポンスを使う", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        items: [issueListItem],
        page: 1,
        pageSize: 20,
        total: 1,
      })
    )
    const client = createApiClient("https://api.example.test")

    await expect(listIssues(client, "org-1")).resolves.toEqual([issueListItem])
  })

  it("期日時刻を保持してIssueを作成する", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(issue))
    const client = createApiClient("https://api.example.test")

    await expect(
      createIssue(client, {
        organizationId: "org-1",
        title: issue.title,
        dueDate: issue.dueDate,
      })
    ).resolves.toEqual(issue)

    const call = fetchMock.mock.calls[0]
    if (!call) throw new Error("Expected an issue creation request")
    const request = requestFrom(...call)
    expect(request.method).toBe("POST")
    await expect(request.json()).resolves.toMatchObject({
      dueDate: issue.dueDate,
    })
  })

  it("期日時刻を保持してIssueを更新する", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(issue))
    const client = createApiClient("https://api.example.test")

    await expect(
      updateIssue(client, {
        id: issue.id,
        organizationId: "org-1",
        title: issue.title,
        dueDate: issue.dueDate,
      })
    ).resolves.toEqual(issue)

    const call = fetchMock.mock.calls[0]
    if (!call) throw new Error("Expected an issue update request")
    const request = requestFrom(...call)
    expect(request.method).toBe("PATCH")
    await expect(request.json()).resolves.toMatchObject({
      dueDate: issue.dueDate,
    })
  })

  it("Issue thumbnailを明示的に選択する", async () => {
    const thumbnail = {
      mode: "selected" as const,
      file: {
        id: "file-1",
        filename: "thumbnail.png",
        imageWidth: 640,
        imageHeight: 480,
      },
    }
    fetchMock.mockResolvedValueOnce(Response.json(thumbnail))
    const client = createApiClient("https://api.example.test")

    await expect(
      updateIssueThumbnail(client, {
        id: issue.id,
        organizationId: "org-1",
        fileId: "file-1",
      })
    ).resolves.toEqual(thumbnail)

    const call = fetchMock.mock.calls[0]
    if (!call) throw new Error("Expected a thumbnail selection request")
    const request = requestFrom(...call)
    expect(request.method).toBe("PUT")
    await expect(request.json()).resolves.toMatchObject({
      organizationId: "org-1",
      fileId: "file-1",
    })
  })

  it("Issue thumbnailを自動選択へ戻す", async () => {
    const automatic = {
      mode: "automatic" as const,
      file: {
        id: "file-1",
        filename: "thumbnail.png",
        imageWidth: 640,
        imageHeight: 480,
      },
    }
    fetchMock.mockResolvedValueOnce(Response.json(automatic))
    const client = createApiClient("https://api.example.test")

    await expect(
      updateIssueThumbnail(client, {
        id: issue.id,
        organizationId: "org-1",
        fileId: null,
      })
    ).resolves.toEqual(automatic)

    const call = fetchMock.mock.calls[0]
    if (!call) throw new Error("Expected a thumbnail reset request")
    await expect(requestFrom(...call).json()).resolves.toMatchObject({
      organizationId: "org-1",
      fileId: null,
    })
  })

  it("timeline cursorをopaqueな文字列として扱いつつファイルactivityを受け入れる", async () => {
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
})

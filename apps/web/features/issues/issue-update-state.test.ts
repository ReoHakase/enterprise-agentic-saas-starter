import { describe, expect, it } from "vitest"

import {
  getIssueUpdateFields,
  mergeIssueUpdateResponse,
} from "./issue-update-state"
import type { Issue } from "./schema"

const currentIssue: Issue = {
  id: "issue-1",
  organizationId: "organization-1",
  number: 1,
  title: "Current title",
  description: "Current description",
  status: "open",
  priority: "medium",
  assigneeId: "user-1",
  creatorId: "user-1",
  labels: ["frontend"],
  dueDate: "2026-07-18T00:00:00.000Z",
  revision: 1,
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
}

describe("issue update state", () => {
  it("merges only the fields included in a response's update", () => {
    const response: Issue = {
      ...currentIssue,
      status: "closed",
      priority: "low",
      updatedAt: "2026-07-17T00:01:00.000Z",
    }

    expect(
      mergeIssueUpdateResponse(currentIssue, response, { status: "closed" })
    ).toMatchObject({
      status: "closed",
      priority: "medium",
      updatedAt: "2026-07-17T00:01:00.000Z",
    })
  })

  it("treats null and empty collection values as explicit updates", () => {
    expect(
      getIssueUpdateFields({ assigneeId: null, dueDate: null, labels: [] })
    ).toEqual(["assigneeId", "labels", "dueDate"])
  })
})

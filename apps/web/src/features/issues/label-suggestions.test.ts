import { describe, expect, it } from "vitest"

import { deriveIssueLabelSuggestions } from "./label-suggestions"
import type { Issue } from "./schema"

const issue = (id: string, labels: string[]): Issue => ({
  id,
  organizationId: "organization-1",
  number: Number(id),
  title: `Issue ${id}`,
  description: "",
  status: "open",
  priority: "no_priority",
  assigneeId: null,
  creatorId: "user-1",
  labels,
  dueDate: null,
  revision: 1,
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
})

describe("deriveIssueLabelSuggestionsの契約", () => {
  it("大文字と小文字を区別せずに組織ラベルの重複を排除する", () => {
    const labels = deriveIssueLabelSuggestions([
      issue("1", ["Backend", " urgent ", ""]),
      issue("2", ["backend", "Frontend", "URGENT"]),
    ])

    expect(labels).toHaveLength(3)
    expect(labels.map((label) => label.toLocaleLowerCase("en-US"))).toEqual([
      "backend",
      "frontend",
      "urgent",
    ])
    expect(labels.every((label) => label === label.trim())).toBe(true)
  })
})

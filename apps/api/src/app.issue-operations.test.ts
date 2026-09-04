import * as schema from "@enterprise-agentic-saas/db/schema"
import { describe, expect, it } from "vitest"

import { createApp } from "./app"
import { createSeededDb, jsonRequest } from "./app.test-support"

const createIssueFilterFixture = async () => {
  const db = await createSeededDb()
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const nextMonth = new Date(now)
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
  await db.insert(schema.issues).values([
    {
      id: "filter-low",
      organizationId: "org_1",
      number: 2,
      title: "100% literal low",
      status: "open",
      priority: "low",
      assigneeId: "user_4",
      creatorId: "user_1",
      labels: ["Bug", "Alpha"],
      dueDate: tomorrow,
    },
    {
      id: "filter-medium",
      organizationId: "org_1",
      number: 3,
      title: "1000 literal medium",
      status: "in_progress",
      priority: "medium",
      creatorId: "user_1",
      labels: ["bug", "Security"],
      dueDate: null,
    },
    {
      id: "filter-urgent",
      organizationId: "org_1",
      number: 4,
      title: "Urgent closed",
      status: "closed",
      priority: "urgent",
      assigneeId: "user_5",
      creatorId: "user_1",
      labels: ["Security", "Ops"],
      dueDate: nextMonth,
    },
    {
      id: "filter-other-tenant",
      organizationId: "org_2",
      number: 1,
      title: "Other tenant secret",
      status: "open",
      priority: "low",
      creatorId: "user_2",
      labels: ["Secret", "Bug"],
    },
  ])
  return { app: createApp(db), tomorrow }
}

const issueIds = async (response: Response) =>
  (await response.json()).items.map((item: { id: string }) => item.id)

const createIssueSortFixture = async () => {
  const db = await createSeededDb()
  await db.insert(schema.issues).values([
    {
      id: "sort-open-low",
      organizationId: "org_1",
      number: 51,
      title: "sort-probe open low",
      description: "literal_value",
      status: "open",
      priority: "low",
      creatorId: "user_1",
    },
    {
      id: "sort-open-high",
      organizationId: "org_1",
      number: 52,
      title: "sort-probe open high",
      description: "literalXvalue",
      status: "open",
      priority: "high",
      creatorId: "user_1",
    },
    {
      id: "sort-progress",
      organizationId: "org_1",
      number: 53,
      title: "sort-probe progress",
      status: "in_progress",
      priority: "medium",
      creatorId: "user_1",
    },
    {
      id: "sort-open-low-later",
      organizationId: "org_1",
      number: 55,
      title: "sort-probe open low later",
      status: "open",
      priority: "low",
      creatorId: "user_1",
    },
    {
      id: "sort-closed",
      organizationId: "org_1",
      number: 54,
      title: "sort-probe closed",
      status: "closed",
      priority: "urgent",
      creatorId: "user_1",
    },
  ])
  const app = createApp(db)
  const titles = async (query: string) => {
    const response = await app.handle(
      jsonRequest(
        `/issues?organizationId=org_1&search=sort-probe&${query}&pageSize=20`,
        { userId: "user_1" }
      )
    )
    return (await response.json()).items.map(
      (item: { title: string }) => item.title
    )
  }
  return { app, titles }
}

describe("Issue一覧queryとlabel候補", () => {
  it("呼出側が選んだ件数で安定したserver絞り込み済みIssue pageを返す", async () => {
    const db = await createSeededDb()
    const now = new Date("2026-07-22T00:00:00.000Z")
    await db.insert(schema.issues).values(
      Array.from({ length: 22 }, (_, index) => ({
        id: `paged-issue-${index + 2}`,
        organizationId: "org_1",
        number: index + 2,
        title: `Paged Issue ${index + 2}`,
        description: "server pagination fixture",
        status: "open" as const,
        priority: "medium" as const,
        creatorId: "user_1",
        labels: ["pagination"],
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }))
    )
    const response = await createApp(db).handle(
      jsonRequest(
        "/issues?organizationId=org_1&sortBy=number&sortDirection=asc&page=2&pageSize=20",
        { userId: "user_1" }
      )
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      items: [
        expect.objectContaining({ number: 21 }),
        expect.objectContaining({ number: 22 }),
        expect.objectContaining({ number: 23 }),
      ],
      page: 2,
      pageSize: 20,
      total: 23,
    })
  })

  it("複数のstatusとpriority範囲とassignee条件を同時に適用する", async () => {
    const { app } = await createIssueFilterFixture()
    const response = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&statuses=open&statuses=in_progress&priorityFrom=low&priorityTo=medium&assigneeIds=user_4&assigneeIds=unassigned&labels=bug&labels=security&labelMode=any&sortBy=priority&sortDirection=asc&pageSize=50",
        { userId: "user_1" }
      )
    )

    expect(response.status).toBe(200)
    await expect(issueIds(response)).resolves.toEqual([
      "filter-low",
      "filter-medium",
    ])
  })

  it("labelをすべて含むIssueだけを返す", async () => {
    const { app } = await createIssueFilterFixture()
    const response = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&labels=bug&labels=security&labelMode=all&pageSize=20",
        { userId: "user_1" }
      )
    )

    await expect(issueIds(response)).resolves.toEqual(["filter-medium"])
  })

  it("旧dueDatePreset queryを拒否する", async () => {
    const { app } = await createIssueFilterFixture()
    const response = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&dueDatePreset=no_due&pageSize=20",
        { userId: "user_1" }
      )
    )

    expect(response.status).toBe(400)
  })

  it.each([
    { date: "2026-02-29", expectedStatus: 400, label: "平年の2月29日" },
    { date: "2026-02-31", expectedStatus: 400, label: "存在しない2月31日" },
    { date: "2028-02-29", expectedStatus: 200, label: "閏年の2月29日" },
  ])("$labelを期日境界として検証する", async ({ date, expectedStatus }) => {
    const { app } = await createIssueFilterFixture()
    const response = await app.handle(
      jsonRequest(
        `/issues?organizationId=org_1&dueDateFrom=${date}&pageSize=20`,
        { userId: "user_1" }
      )
    )

    expect(response.status).toBe(expectedStatus)
  })

  it("同じ開始日と終了日で期日範囲を絞り込む", async () => {
    const { app, tomorrow } = await createIssueFilterFixture()
    const date = tomorrow.toISOString().slice(0, 10)
    const response = await app.handle(
      jsonRequest(
        `/issues?organizationId=org_1&dueDateFrom=${date}&dueDateTo=${date}&pageSize=20`,
        { userId: "user_1" }
      )
    )

    await expect(issueIds(response)).resolves.toEqual(["filter-low"])
  })

  it("検索内のpercent記号をwildcardではなく文字として扱う", async () => {
    const { app } = await createIssueFilterFixture()
    const response = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&search=%25&sortBy=number&sortDirection=asc&pageSize=20",
        { userId: "user_1" }
      )
    )
    expect(
      (await response.json()).items.map((item: { title: string }) => item.title)
    ).toEqual(["100% literal low"])
  })

  it("label候補を大文字小文字なしで検索して別tenantを除外する", async () => {
    const { app } = await createIssueFilterFixture()
    const response = await app.handle(
      jsonRequest("/issues/labels?organizationId=org_1&search=b", {
        userId: "user_1",
      })
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      items: ["backend", "Bug"],
    })
    expect(JSON.stringify(body)).not.toContain("Secret")
  })

  it("Issue label候補をテナント所属とactive organizationで保護する", async () => {
    const app = createApp(await createSeededDb())

    const otherTenant = await app.handle(
      jsonRequest("/issues/labels?organizationId=org_2", {
        userId: "user_1",
      })
    )
    expect(otherTenant.status).toBe(404)

    const nonexistent = await app.handle(
      jsonRequest("/issues/labels?organizationId=org_missing", {
        userId: "user_1",
      })
    )
    expect(nonexistent.status).toBe(404)

    const inactive = await app.handle(
      jsonRequest("/issues/labels?organizationId=org_1", {
        userId: "user_1",
        activeOrganizationId: "org_2",
      })
    )
    expect(inactive.status).toBe(409)
  })
})

describe("Issue一覧filterの境界", () => {
  it("表示した日付filterへlocal dayのUTC境界を使う", async () => {
    const db = await createSeededDb()
    await db.insert(schema.issues).values([
      {
        id: "local-before",
        organizationId: "org_1",
        number: 41,
        title: "Local boundary before",
        status: "open",
        priority: "medium",
        creatorId: "user_1",
        dueDate: new Date("2026-07-26T14:59:59.999Z"),
      },
      {
        id: "local-start",
        organizationId: "org_1",
        number: 42,
        title: "Local boundary start",
        status: "open",
        priority: "medium",
        creatorId: "user_1",
        dueDate: new Date("2026-07-26T15:00:00.000Z"),
      },
      {
        id: "local-end",
        organizationId: "org_1",
        number: 43,
        title: "Local boundary end",
        status: "open",
        priority: "medium",
        creatorId: "user_1",
        dueDate: new Date("2026-07-27T14:59:59.999Z"),
      },
      {
        id: "local-after",
        organizationId: "org_1",
        number: 44,
        title: "Local boundary after",
        status: "open",
        priority: "medium",
        creatorId: "user_1",
        dueDate: new Date("2026-07-27T15:00:00.000Z"),
      },
    ])
    const app = createApp(db)
    const request = async (query: string) => {
      const response = await app.handle(
        jsonRequest(`/issues?organizationId=org_1&${query}&pageSize=20`, {
          userId: "user_1",
        })
      )
      expect(response.status).toBe(200)
      return (await response.json()).items.map(
        (item: { id: string }) => item.id
      )
    }

    await expect(
      request(
        "dueDateFrom=2026-07-27&dueDateTo=2026-07-27&dueDateFromOffsetMinutes=-540&dueDateToExclusiveOffsetMinutes=-540"
      )
    ).resolves.toEqual(["local-end", "local-start"])
    await expect(
      request(
        "dueDateFrom=2026-07-27&dueDateTo=2026-08-02&dueDateFromOffsetMinutes=-540&dueDateToExclusiveOffsetMinutes=-540"
      )
    ).resolves.toEqual(["local-after", "local-end", "local-start"])
    await expect(
      request("dueDateFrom=2026-07-28&dueDateFromOffsetMinutes=-540")
    ).resolves.toContain("local-after")
  })

  it("DST遷移をまたぐ開始日と終了日へ独立したUTC境界を適用する", async () => {
    const db = await createSeededDb()
    await db.insert(schema.issues).values([
      {
        id: "dst-before",
        organizationId: "org_1",
        number: 45,
        title: "DST boundary before",
        status: "open",
        priority: "medium",
        creatorId: "user_1",
        dueDate: new Date("2026-03-07T04:59:59.999Z"),
      },
      {
        id: "dst-start",
        organizationId: "org_1",
        number: 46,
        title: "DST boundary start",
        status: "open",
        priority: "medium",
        creatorId: "user_1",
        dueDate: new Date("2026-03-07T05:00:00.000Z"),
      },
      {
        id: "dst-end",
        organizationId: "org_1",
        number: 47,
        title: "DST boundary end",
        status: "open",
        priority: "medium",
        creatorId: "user_1",
        dueDate: new Date("2026-03-14T03:59:59.999Z"),
      },
      {
        id: "dst-after",
        organizationId: "org_1",
        number: 48,
        title: "DST boundary after",
        status: "open",
        priority: "medium",
        creatorId: "user_1",
        dueDate: new Date("2026-03-14T04:00:00.000Z"),
      },
    ])
    const app = createApp(db)
    const response = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&search=DST%20boundary&dueDateFrom=2026-03-07&dueDateTo=2026-03-13&dueDateFromOffsetMinutes=300&dueDateToExclusiveOffsetMinutes=240&pageSize=20",
        { userId: "user_1" }
      )
    )

    expect(response.status).toBe(200)
    expect(
      (await response.json()).items.map((item: { id: string }) => item.id)
    ).toEqual(["dst-end", "dst-start"])
  })

  it("frontendで解決した期日shortcutを日付範囲として適用する", async () => {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const addDays = (days: number, hours = 0) => {
      const date = new Date(today)
      date.setUTCDate(date.getUTCDate() + days)
      date.setUTCHours(hours)
      return date
    }
    const db = await createSeededDb()
    await db.insert(schema.issues).values([
      {
        id: "preset-yesterday",
        organizationId: "org_1",
        number: 61,
        title: "preset-probe yesterday",
        status: "open",
        priority: "medium",
        creatorId: "user_1",
        dueDate: addDays(-1, 23),
      },
      {
        id: "preset-earlier-today",
        organizationId: "org_1",
        number: 62,
        title: "preset-probe earlier today",
        status: "open",
        priority: "medium",
        creatorId: "user_1",
        dueDate: addDays(0, 1),
      },
      {
        id: "preset-day-six",
        organizationId: "org_1",
        number: 63,
        title: "preset-probe day six",
        status: "open",
        priority: "medium",
        creatorId: "user_1",
        dueDate: addDays(6, 23),
      },
      {
        id: "preset-day-seven",
        organizationId: "org_1",
        number: 64,
        title: "preset-probe day seven",
        status: "open",
        priority: "medium",
        creatorId: "user_1",
        dueDate: addDays(7),
      },
    ])
    const app = createApp(db)
    const requestRange = async (range: string) => {
      const response = await app.handle(
        jsonRequest(
          `/issues?organizationId=org_1&search=preset-probe&${range}&pageSize=20`,
          { userId: "user_1" }
        )
      )
      expect(response.status).toBe(200)
      return (await response.json()).items.map(
        (item: { id: string }) => item.id
      )
    }

    const todayDate = addDays(0).toISOString().slice(0, 10)
    const yesterdayDate = addDays(-1).toISOString().slice(0, 10)
    const daySixDate = addDays(6).toISOString().slice(0, 10)
    await expect(requestRange(`dueDateTo=${yesterdayDate}`)).resolves.toEqual([
      "preset-yesterday",
    ])
    await expect(
      requestRange(`dueDateFrom=${todayDate}&dueDateTo=${todayDate}`)
    ).resolves.toEqual(["preset-earlier-today"])
    await expect(
      requestRange(`dueDateFrom=${todayDate}&dueDateTo=${daySixDate}`)
    ).resolves.toEqual(["preset-day-six", "preset-earlier-today"])
  })

  it("Web正本の配列上限をvalidation errorなしで受理する", async () => {
    const query = new URLSearchParams({
      organizationId: "org_1",
      pageSize: "20",
    })
    for (let index = 0; index < 50; index += 1) {
      query.append("assigneeIds", `user-${index.toString().padStart(2, "0")}`)
    }
    for (let index = 0; index < 20; index += 1) {
      query.append("labels", `label-${index.toString().padStart(2, "0")}`)
    }
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest(`/issues?${query.toString()}`, { userId: "user_1" })
    )

    expect(response.status).toBe(200)
  })

  it.each([
    {
      key: "dueDateFromOffsetMinutes",
      label: "開始offsetが上限を超える場合",
      value: "841",
    },
    {
      key: "dueDateToExclusiveOffsetMinutes",
      label: "終了offsetが下限を下回る場合",
      value: "-841",
    },
  ])("$labelを拒否する", async ({ key, value }) => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest(
        `/issues?organizationId=org_1&dueDateFrom=2026-03-07&dueDateTo=2026-03-13&${key}=${value}&pageSize=20`,
        { userId: "user_1" }
      )
    )

    expect(response.status).toBe(400)
  })

  it("statusを意味順に並べ同順位を昇順と降順で決定的に保つ", async () => {
    const { titles } = await createIssueSortFixture()
    await expect(titles("sortBy=status&sortDirection=asc")).resolves.toEqual([
      "sort-probe open low",
      "sort-probe open high",
      "sort-probe open low later",
      "sort-probe progress",
      "sort-probe closed",
    ])
    await expect(titles("sortBy=status&sortDirection=desc")).resolves.toEqual([
      "sort-probe closed",
      "sort-probe progress",
      "sort-probe open low later",
      "sort-probe open high",
      "sort-probe open low",
    ])
  })

  it("priorityを意味順に並べ同順位を昇順と降順で決定的に保つ", async () => {
    const { titles } = await createIssueSortFixture()
    await expect(titles("sortBy=priority&sortDirection=asc")).resolves.toEqual([
      "sort-probe open low",
      "sort-probe open low later",
      "sort-probe progress",
      "sort-probe open high",
      "sort-probe closed",
    ])
    await expect(titles("sortBy=priority&sortDirection=desc")).resolves.toEqual(
      [
        "sort-probe closed",
        "sort-probe open high",
        "sort-probe progress",
        "sort-probe open low later",
        "sort-probe open low",
      ]
    )
  })

  it("検索文字列のunderscoreをwildcardではなくliteralとして扱う", async () => {
    const { app } = await createIssueSortFixture()
    const literalUnderscore = await app.handle(
      jsonRequest("/issues?organizationId=org_1&search=_&pageSize=20", {
        userId: "user_1",
      })
    )
    expect(
      (await literalUnderscore.json()).items.map(
        (item: { id: string }) => item.id
      )
    ).toContain("sort-open-low")
    expect(
      (
        await app
          .handle(
            jsonRequest(
              "/issues?organizationId=org_1&search=literal_value&pageSize=20",
              { userId: "user_1" }
            )
          )
          .then((response) => response.json())
      ).items.map((item: { id: string }) => item.id)
    ).toEqual(["sort-open-low"])
  })

  it("大文字小文字を区別しないlabelをprefix一致優先で決定的な先頭50件として返す", async () => {
    const db = await createSeededDb()
    await db.insert(schema.issues).values(
      Array.from({ length: 52 }, (_, index) => ({
        id: `label-limit-${index}`,
        organizationId: "org_1",
        number: 100 + index,
        title: `Label limit ${index}`,
        status: "open" as const,
        priority: "medium" as const,
        creatorId: "user_1",
        labels: [
          index === 0 ? "Needle" : `z-${index.toString().padStart(2, "0")}`,
          index === 1 ? "needle" : `contains-needle-${index}`,
        ],
      }))
    )
    const response = await createApp(db).handle(
      jsonRequest("/issues/labels?organizationId=org_1&search=needle", {
        userId: "user_1",
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items).toHaveLength(50)
    expect(body.items[0]).toBe("Needle")
    expect(
      body.items.filter(
        (label: string) => label.toLocaleLowerCase("en-US") === "needle"
      )
    ).toHaveLength(1)
    expect(body.items).toEqual([
      "Needle",
      ...body.items
        .slice(1)
        .toSorted((left: string, right: string) =>
          left.localeCompare(right, "en-US", { sensitivity: "base" })
        ),
    ])
  })
})

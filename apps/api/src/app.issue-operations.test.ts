import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq, sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createApp } from "./app"
import { createSeededDb, jsonRequest } from "./app.test-support"

describe("Issue queries, mutations, and profile images", () => {
  it("returns stable server-filtered Issue pages with a caller-selected size", async () => {
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

  it("applies multi-value, range, due-date, literal wildcard, and tenant-safe label filters", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
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

    const multi = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&statuses=open&statuses=in_progress&priorityFrom=low&priorityTo=medium&assigneeIds=user_4&assigneeIds=unassigned&labels=bug&labels=security&labelMode=any&sortBy=priority&sortDirection=asc&pageSize=50",
        { userId: "user_1" }
      )
    )
    expect(multi.status).toBe(200)
    expect(
      (await multi.json()).items.map((item: { id: string }) => item.id)
    ).toEqual(["filter-low", "filter-medium"])

    const labelsAll = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&labels=bug&labels=security&labelMode=all&pageSize=20",
        { userId: "user_1" }
      )
    )
    expect(
      (await labelsAll.json()).items.map((item: { id: string }) => item.id)
    ).toEqual(["filter-medium"])

    const legacyPreset = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&dueDatePreset=no_due&pageSize=20",
        { userId: "user_1" }
      )
    )
    expect(legacyPreset.status).toBe(400)

    const invalidDateRanges = await Promise.all(
      ["2026-02-29", "2026-02-31"].map((invalidDate) =>
        app.handle(
          jsonRequest(
            `/issues?organizationId=org_1&dueDateFrom=${invalidDate}&pageSize=20`,
            { userId: "user_1" }
          )
        )
      )
    )
    for (const invalidDateRange of invalidDateRanges) {
      expect(invalidDateRange.status).toBe(400)
    }
    const leapDayRange = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&dueDateFrom=2028-02-29&pageSize=20",
        { userId: "user_1" }
      )
    )
    expect(leapDayRange.status).toBe(200)

    const dateRange = await app.handle(
      jsonRequest(
        `/issues?organizationId=org_1&dueDateFrom=${tomorrow.toISOString().slice(0, 10)}&dueDateTo=${tomorrow.toISOString().slice(0, 10)}&pageSize=20`,
        { userId: "user_1" }
      )
    )
    expect(
      (await dateRange.json()).items.map((item: { id: string }) => item.id)
    ).toEqual(["filter-low"])

    const literalWildcard = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&search=%25&sortBy=number&sortDirection=asc&pageSize=20",
        { userId: "user_1" }
      )
    )
    expect(
      (await literalWildcard.json()).items.map(
        (item: { title: string }) => item.title
      )
    ).toEqual(["100% literal low"])

    const labelOptions = await app.handle(
      jsonRequest("/issues/labels?organizationId=org_1&search=b", {
        userId: "user_1",
      })
    )
    expect(labelOptions.status).toBe(200)
    const labelOptionsBody = await labelOptions.json()
    expect(labelOptionsBody).toEqual({
      items: ["backend", "Bug"],
    })
    expect(JSON.stringify(labelOptionsBody)).not.toContain("Secret")
  })

  it("protects Issue label options with tenant membership and active organization", async () => {
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

describe("Issue list filter boundaries", () => {
  it("uses local-day UTC boundaries for displayed date filters", async () => {
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

  it("applies independent UTC boundaries across a DST transition", async () => {
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

  it("applies frontend-resolved due shortcuts as date-only ranges", async () => {
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

  it("accepts the canonical Web array limits without validation failure", async () => {
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
    ["dueDateFromOffsetMinutes", "841"],
    ["dueDateToExclusiveOffsetMinutes", "-841"],
  ])("rejects an out-of-range %s", async (key, value) => {
    const app = createApp(await createSeededDb())
    const response = await app.handle(
      jsonRequest(
        `/issues?organizationId=org_1&dueDateFrom=2026-03-07&dueDateTo=2026-03-13&${key}=${value}&pageSize=20`,
        { userId: "user_1" }
      )
    )

    expect(response.status).toBe(400)
  })

  it("sorts statuses semantically and keeps rank ties deterministic in both directions", async () => {
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

  it("returns the deterministic first 50 case-insensitive labels with prefix matches first", async () => {
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

describe("Issue mutations, summaries, and profile images", () => {
  it("returns Issue summaries and selects or resets an authenticated thumbnail", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    const oldest = new Date("2026-07-20T00:00:00.000Z")
    const newer = new Date("2026-07-21T00:00:00.000Z")
    await db.insert(schema.issues).values({
      id: "thumbnail-other-issue",
      organizationId: "org_1",
      number: 2,
      title: "Other thumbnail owner",
      creatorId: "user_1",
      createdAt: oldest,
      updatedAt: oldest,
    })
    await db.insert(schema.files).values([
      {
        id: "thumbnail-oldest",
        organizationId: "org_1",
        uploaderId: "user_1",
        uploadId: "thumbnail-upload-oldest",
        ownerType: "issue",
        objectKey: "thumbnail/object-oldest",
        filename: "oldest.png",
        sizeBytes: 100,
        declaredContentType: "image/png",
        detectedImageFormat: "png",
        imageWidth: 640,
        imageHeight: 480,
        etag: "etag-oldest",
        status: "ready",
        createdAt: oldest,
        updatedAt: oldest,
      },
      {
        id: "thumbnail-newer",
        organizationId: "org_1",
        uploaderId: "user_1",
        uploadId: "thumbnail-upload-newer",
        ownerType: "issue",
        objectKey: "thumbnail/object-newer",
        filename: "newer.jpg",
        sizeBytes: 120,
        declaredContentType: "image/jpeg",
        detectedImageFormat: "jpeg",
        imageWidth: 800,
        imageHeight: 800,
        etag: "etag-newer",
        status: "ready",
        createdAt: newer,
        updatedAt: newer,
      },
      {
        id: "thumbnail-avif",
        organizationId: "org_1",
        uploaderId: "user_1",
        uploadId: "thumbnail-upload-avif",
        ownerType: "issue",
        objectKey: "thumbnail/object-avif",
        filename: "unsupported.avif",
        sizeBytes: 80,
        declaredContentType: "image/avif",
        detectedImageFormat: "avif",
        imageWidth: 320,
        imageHeight: 320,
        etag: "etag-avif",
        status: "ready",
        createdAt: newer,
        updatedAt: newer,
      },
      {
        id: "thumbnail-other-owner",
        organizationId: "org_1",
        uploaderId: "user_1",
        uploadId: "thumbnail-upload-other",
        ownerType: "issue",
        objectKey: "thumbnail/object-other",
        filename: "other.png",
        sizeBytes: 90,
        declaredContentType: "image/png",
        detectedImageFormat: "png",
        imageWidth: 400,
        imageHeight: 400,
        etag: "etag-other",
        status: "ready",
        createdAt: newer,
        updatedAt: newer,
      },
    ])
    await db.insert(schema.issueFileOwners).values([
      {
        fileId: "thumbnail-oldest",
        organizationId: "org_1",
        issueId: "issue_1",
      },
      {
        fileId: "thumbnail-newer",
        organizationId: "org_1",
        issueId: "issue_1",
      },
      {
        fileId: "thumbnail-avif",
        organizationId: "org_1",
        issueId: "issue_1",
      },
      {
        fileId: "thumbnail-other-owner",
        organizationId: "org_1",
        issueId: "thumbnail-other-issue",
      },
    ])
    await db.insert(schema.issueComments).values([
      {
        id: "thumbnail-comment-1",
        organizationId: "org_1",
        issueId: "issue_1",
        authorId: "user_1",
        body: "First",
      },
      {
        id: "thumbnail-comment-2",
        organizationId: "org_1",
        issueId: "issue_1",
        authorId: "user_1",
        body: "Second",
      },
    ])

    const listResponse = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&sortBy=number&sortDirection=asc",
        { userId: "user_1" }
      )
    )
    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toMatchObject({
      items: [
        expect.objectContaining({
          id: "issue_1",
          attachmentCount: 3,
          commentCount: 2,
          thumbnail: expect.objectContaining({
            id: "thumbnail-oldest",
            filename: "oldest.png",
          }),
        }),
        expect.objectContaining({
          id: "thumbnail-other-issue",
          attachmentCount: 1,
          commentCount: 0,
        }),
      ],
    })

    const automatic = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail?organizationId=org_1", {
        userId: "user_1",
      })
    )
    expect(automatic.status).toBe(200)
    expect(await automatic.json()).toMatchObject({
      mode: "automatic",
      file: { id: "thumbnail-oldest" },
    })

    const select = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail", {
        method: "PUT",
        userId: "user_1",
        body: { organizationId: "org_1", fileId: "thumbnail-newer" },
      })
    )
    expect(select.status).toBe(200)
    expect(await select.json()).toMatchObject({
      mode: "selected",
      file: { id: "thumbnail-newer" },
    })

    const afterSelect = await db
      .select({ revision: schema.issues.revision })
      .from(schema.issues)
      .where(eq(schema.issues.id, "issue_1"))
    expect(afterSelect[0]?.revision).toBe(2)
    const auditsAfterSelect = await db
      .select()
      .from(schema.auditLogs)
      .where(
        sql`${schema.auditLogs.targetId} = 'issue_1' and ${schema.auditLogs.action} = 'issue.updated'`
      )
    expect(auditsAfterSelect).toHaveLength(1)

    const noOp = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail", {
        method: "PUT",
        userId: "user_1",
        body: { organizationId: "org_1", fileId: "thumbnail-newer" },
      })
    )
    expect(noOp.status).toBe(200)
    const afterNoOp = await db
      .select({ revision: schema.issues.revision })
      .from(schema.issues)
      .where(eq(schema.issues.id, "issue_1"))
    expect(afterNoOp[0]?.revision).toBe(2)

    const wrongOwner = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail", {
        method: "PUT",
        userId: "user_1",
        body: {
          organizationId: "org_1",
          fileId: "thumbnail-other-owner",
        },
      })
    )
    expect(wrongOwner.status).toBe(404)
    const unsupported = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail", {
        method: "PUT",
        userId: "user_1",
        body: { organizationId: "org_1", fileId: "thumbnail-avif" },
      })
    )
    expect(unsupported.status).toBe(400)

    const reset = await app.handle(
      jsonRequest("/issues/issue_1/thumbnail", {
        method: "PUT",
        userId: "user_1",
        body: { organizationId: "org_1", fileId: null },
      })
    )
    expect(reset.status).toBe(200)
    expect(await reset.json()).toMatchObject({
      mode: "automatic",
      file: { id: "thumbnail-oldest" },
    })
    const afterReset = await db
      .select({ revision: schema.issues.revision })
      .from(schema.issues)
      .where(eq(schema.issues.id, "issue_1"))
    expect(afterReset[0]?.revision).toBe(3)
  })
})

describe("Issue lifecycle operations", () => {
  it("creates, filters, updates, loads, and comments on an issue", async () => {
    const db = await createSeededDb()
    const app = createApp(db)
    const createResponse = await app.handle(
      jsonRequest("/issues", {
        method: "POST",
        userId: "user_1",
        body: {
          organizationId: "org_1",
          title: " Login bug ",
          description: "OAuth callback fails",
          priority: "urgent",
          assigneeId: "user_4",
          labels: ["bug", "auth"],
          dueDate: "2026-08-15T10:30:00.000Z",
        },
      })
    )
    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(created).toMatchObject({
      number: 2,
      title: "Login bug",
      dueDate: "2026-08-15T10:30:00.000Z",
    })
    expect(typeof created.dueDate).toBe("string")

    const storedIssue = await db
      .select({ dueDate: schema.issues.dueDate })
      .from(schema.issues)
      .where(eq(schema.issues.id, created.id))
    expect(storedIssue[0]?.dueDate?.toISOString()).toBe(
      "2026-08-15T10:30:00.000Z"
    )

    const filtered = await app.handle(
      jsonRequest(
        "/issues?organizationId=org_1&search=OAuth&priorityFrom=urgent&priorityTo=urgent&labels=auth&sortBy=number&sortDirection=asc",
        { userId: "user_1" }
      )
    )
    expect(await filtered.json()).toMatchObject({
      items: [expect.objectContaining({ id: created.id })],
      page: 1,
      pageSize: 20,
      total: 1,
    })

    const update = await app.handle(
      jsonRequest(`/issues/${created.id}`, {
        method: "PATCH",
        userId: "user_1",
        body: { organizationId: "org_1", status: "in_progress" },
      })
    )
    expect(await update.json()).toMatchObject({ status: "in_progress" })

    const detail = await app.handle(
      jsonRequest(`/issues/${created.id}?organizationId=org_1`, {
        userId: "user_1",
      })
    )
    expect(detail.status).toBe(200)
    expect((await detail.json()).dueDate).toBe("2026-08-15T10:30:00.000Z")

    const comment = await app.handle(
      jsonRequest(`/issues/${created.id}/comments`, {
        method: "POST",
        userId: "user_4",
        body: { organizationId: "org_1", body: "I can reproduce this." },
      })
    )
    expect(comment.status).toBe(201)
    expect(await comment.json()).toMatchObject({
      authorId: "user_4",
      author: { id: "user_4", name: "User 4", profileImage: null },
    })

    const byNumber = await app.handle(
      jsonRequest(`/issues/by-number/${created.number}?organizationId=org_1`, {
        userId: "user_1",
      })
    )
    expect(byNumber.status).toBe(200)
    expect(await byNumber.json()).toMatchObject({ id: created.id, number: 2 })

    const timeline = await app.handle(
      jsonRequest(`/issues/${created.id}/timeline?organizationId=org_1`, {
        userId: "user_1",
      })
    )
    expect(timeline.status).toBe(200)
    const timelineBody = await timeline.json()
    expect(timelineBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "activity", kind: "created" }),
        expect.objectContaining({
          type: "activity",
          kind: "field_changed",
          field: "status",
          fromValue: "open",
          toValue: "in_progress",
        }),
        expect.objectContaining({
          type: "comment",
          body: "I can reproduce this.",
        }),
      ])
    )
    expect(
      timelineBody.items.filter(
        (item: { type: string }) => item.type === "comment"
      )
    ).toHaveLength(1)

    const audit = await app.handle(
      jsonRequest("/organizations/org_1/audit-logs?limit=100", {
        userId: "user_3",
      })
    )
    expect(
      (await audit.json()).map((event: { action: string }) => event.action)
    ).toEqual(
      expect.arrayContaining([
        "issue.created",
        "issue.updated",
        "issue.comment.created",
      ])
    )
  })
})

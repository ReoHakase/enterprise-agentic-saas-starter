import * as schema from "@enterprise-agentic-saas/db/schema"
import { expect, it } from "vitest"

import { createSeededDb } from "./app.test-database-support"

it("本番マイグレーションのテナント複合外部キーをAPI fixtureへ適用する", async () => {
  const db = await createSeededDb()

  await expect(
    db.insert(schema.issueComments).values({
      id: "cross-tenant-comment",
      issueId: "issue_1",
      organizationId: "org_2",
      authorId: "user_5",
      body: "Cross-tenant comment",
    })
  ).rejects.toMatchObject({
    cause: {
      code: "SQLITE_CONSTRAINT",
      extendedCode: "SQLITE_CONSTRAINT_FOREIGNKEY",
    },
  })
})

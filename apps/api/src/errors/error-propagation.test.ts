import { describe, expect, it, vi } from "vitest"

import { testDb } from "../app.test-database-support"
import { insertOrganizationWithOwner } from "../modules/organizations/repository"
import { findUserProfile } from "../modules/users/repository"
import { HttpError } from "./http-error"

describe("repository errorの伝播", () => {
  it("terminal handlerへ未知error instanceを維持する", async () => {
    const cause = new Error("database sentinel")
    const db = testDb()
    vi.spyOn(db, "select").mockImplementation(() => {
      throw cause
    })

    await expect(findUserProfile(db, "user-1")).rejects.toBe(cause)
  })

  it("認識済みconstraintを1回だけwrapして同一causeを維持する", async () => {
    const cause = new Error("UNIQUE constraint failed: organization.slug")
    const db = testDb()
    vi.spyOn(db, "transaction").mockImplementation(async () => {
      throw cause
    })

    const failure = await insertOrganizationWithOwner(db, {
      activate: false,
      sessionId: "session-1",
      userId: "user-1",
      name: "Example",
      slug: "example",
    }).then(
      () => undefined,
      (error: unknown) => error
    )

    expect(failure).toBeInstanceOf(HttpError)
    expect(failure).toMatchObject({ code: "conflict" })
    if (!(failure instanceof HttpError)) {
      throw new Error("Expected HttpError")
    }
    expect(failure.cause).toBe(cause)
  })
})

import { describe, expect, it } from "vitest"

import {
  FILE_ACTIVITY_BACKFILL_MIGRATION_AT,
  FILE_STORAGE_SCHEMA_MIGRATION_AT,
  needsFileActivityCompatibilityDeploy,
} from "./file-activity-rollout"

describe("file activity rollout", () => {
  it("predeploys the compatible API only across the 0010 to 0011 gap", () => {
    expect(needsFileActivityCompatibilityDeploy(null)).toBe(false)
    expect(
      needsFileActivityCompatibilityDeploy(FILE_STORAGE_SCHEMA_MIGRATION_AT - 1)
    ).toBe(false)
    expect(
      needsFileActivityCompatibilityDeploy(FILE_STORAGE_SCHEMA_MIGRATION_AT)
    ).toBe(true)
    expect(
      needsFileActivityCompatibilityDeploy(
        FILE_ACTIVITY_BACKFILL_MIGRATION_AT - 1
      )
    ).toBe(true)
    expect(
      needsFileActivityCompatibilityDeploy(FILE_ACTIVITY_BACKFILL_MIGRATION_AT)
    ).toBe(false)
  })
})

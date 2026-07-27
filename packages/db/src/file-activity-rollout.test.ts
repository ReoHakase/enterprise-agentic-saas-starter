import { describe, expect, it } from "vitest"

import {
  AGENT_REFACTOR_DESTRUCTIVE_MIGRATION_AT,
  AGENT_REFACTOR_PREVIOUS_MIGRATION_AT,
  FILE_ACTIVITY_BACKFILL_MIGRATION_AT,
  FILE_STORAGE_SCHEMA_MIGRATION_AT,
  getCompatibilityDeployReasons,
  needsCompatibilityDeploy,
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

  it("predeploys the current API before the destructive 0022 Agent refactor", () => {
    expect(
      needsCompatibilityDeploy(AGENT_REFACTOR_PREVIOUS_MIGRATION_AT - 1)
    ).toBe(false)
    expect(needsCompatibilityDeploy(AGENT_REFACTOR_PREVIOUS_MIGRATION_AT)).toBe(
      true
    )
    expect(
      getCompatibilityDeployReasons(AGENT_REFACTOR_PREVIOUS_MIGRATION_AT)
    ).toEqual(["agent_refactor_destructive"])
    expect(
      needsCompatibilityDeploy(AGENT_REFACTOR_DESTRUCTIVE_MIGRATION_AT - 1)
    ).toBe(true)
    expect(
      needsCompatibilityDeploy(AGENT_REFACTOR_DESTRUCTIVE_MIGRATION_AT)
    ).toBe(false)
  })
})

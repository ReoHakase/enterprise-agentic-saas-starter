import { describe, expect, it } from "vitest"

import {
  AGENT_CONTROL_PLANE_MIGRATION_AT,
  AGENT_REFACTOR_DESTRUCTIVE_MIGRATION_AT,
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

  it.each([
    ["0013", AGENT_CONTROL_PLANE_MIGRATION_AT],
    ["0016", 1_784_700_578_372],
    ["0020", 1_784_745_738_668],
    ["0021", 1_784_805_352_094],
  ])("predeploys the current API before 0022 from %s", (_name, createdAt) => {
    expect(needsCompatibilityDeploy(createdAt)).toBe(true)
    expect(getCompatibilityDeployReasons(createdAt)).toContain(
      "agent_refactor_destructive"
    )
  })

  it("skips compatibility only after 0022 or for a truly fresh Agent schema", () => {
    expect(
      needsCompatibilityDeploy(AGENT_REFACTOR_DESTRUCTIVE_MIGRATION_AT)
    ).toBe(false)
    expect(needsCompatibilityDeploy(null, [])).toBe(false)
    expect(
      needsCompatibilityDeploy(AGENT_CONTROL_PLANE_MIGRATION_AT - 1, [])
    ).toBe(false)
  })

  it("fails closed for partial or unknown Agent schema without a reliable ledger", () => {
    expect(needsCompatibilityDeploy(null, ["agent_threads"])).toBe(true)
    expect(
      needsCompatibilityDeploy(AGENT_CONTROL_PLANE_MIGRATION_AT - 1, [
        "agent_unknown_partial",
      ])
    ).toBe(true)
  })
})

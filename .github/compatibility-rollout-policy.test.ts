import { describe, expect, it } from "vitest"

import {
  allowsMissingWorkerSecretInventory,
  requiresCompatibilityRollout,
} from "./compatibility-rollout-policy"

describe("compatibility rollout policy", () => {
  it.each([
    {
      bootstrapRequired: true,
      migrationCompatibilityRequired: false,
      staleWorkerSecretsFound: false,
    },
    {
      bootstrapRequired: false,
      migrationCompatibilityRequired: true,
      staleWorkerSecretsFound: false,
    },
    {
      bootstrapRequired: false,
      migrationCompatibilityRequired: false,
      staleWorkerSecretsFound: true,
    },
  ])("requires isolation and drain for $#", (input) => {
    expect(requiresCompatibilityRollout(input)).toBe(true)
  })

  it("skips compatibility only for an already-clean current rollout", () => {
    expect(
      requiresCompatibilityRollout({
        bootstrapRequired: false,
        migrationCompatibilityRequired: false,
        staleWorkerSecretsFound: false,
      })
    ).toBe(false)
  })

  it("allows a secret inventory 404 only for that same missing Worker", () => {
    expect(
      allowsMissingWorkerSecretInventory({
        inventoryStatus: 404,
        workerExists: false,
      })
    ).toBe(true)
    expect(
      allowsMissingWorkerSecretInventory({
        inventoryStatus: 404,
        workerExists: true,
      })
    ).toBe(false)
    expect(
      allowsMissingWorkerSecretInventory({
        inventoryStatus: 200,
        workerExists: false,
      })
    ).toBe(false)
  })

  it("does not confuse a forced bootstrap with either Worker being absent", () => {
    const apiExists = true
    const agentExists = true
    expect(
      requiresCompatibilityRollout({
        bootstrapRequired: true,
        migrationCompatibilityRequired: false,
        staleWorkerSecretsFound: false,
      })
    ).toBe(true)
    expect(
      allowsMissingWorkerSecretInventory({
        inventoryStatus: 404,
        workerExists: apiExists,
      })
    ).toBe(false)
    expect(
      allowsMissingWorkerSecretInventory({
        inventoryStatus: 404,
        workerExists: agentExists,
      })
    ).toBe(false)
  })

  it("keeps one missing Worker from authorizing the existing Worker's 404", () => {
    expect(
      allowsMissingWorkerSecretInventory({
        inventoryStatus: 404,
        workerExists: false,
      })
    ).toBe(true)
    expect(
      allowsMissingWorkerSecretInventory({
        inventoryStatus: 404,
        workerExists: true,
      })
    ).toBe(false)
  })
})

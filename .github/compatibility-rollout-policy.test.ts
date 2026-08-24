import { describe, expect, it } from "vitest"

import {
  allowsMissingWorkerSecretInventory,
  requiresCompatibilityRollout,
} from "./compatibility-rollout-policy"

describe("compatibility rollout policyの契約", () => {
  it.each([
    {
      bootstrapRequired: true,
      staleWorkerSecretsFound: false,
    },
    {
      bootstrapRequired: false,
      staleWorkerSecretsFound: true,
    },
  ])("case $#でisolationとdrainを要求する", (input) => {
    expect(requiresCompatibilityRollout(input)).toBe(true)
  })

  it("clean済みcurrent rolloutの場合だけcompatibilityを省略する", () => {
    expect(
      requiresCompatibilityRollout({
        bootstrapRequired: false,
        staleWorkerSecretsFound: false,
      })
    ).toBe(false)
  })

  it("同じ欠損Workerに限ってsecret inventory 404を許可する", () => {
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

  it("強制bootstrapと各Worker欠損を混同しない", () => {
    const apiExists = true
    const agentExists = true
    expect(
      requiresCompatibilityRollout({
        bootstrapRequired: true,
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

  it("一方のWorker欠損で既存Workerの404を許可しない", () => {
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

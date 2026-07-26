import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import type { StagedAgentAsset } from "../runtime-state/runtime-state"
import { AgentStagedAsset } from "./agent-staged-asset"

const remove = fn(async () => undefined)
const stagedAsset = {
  asset: {
    id: "asset_01K1TENANTPOLICY000000",
    filename: "tenant-policy.png",
    sizeBytes: 2_048,
    imageWidth: 640,
    imageHeight: 480,
    previewable: true,
    expiresAt: "2026-07-26T10:00:00.000Z",
  },
  file: new File(["fictional image"], "tenant-policy.png", {
    type: "image/png",
  }),
  blobUrl:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23dbeafe'/%3E%3C/svg%3E",
} satisfies StagedAgentAsset

const meta = preview.meta({
  title: "Web/Agent/Staged Asset",
  component: AgentStagedAsset,
  tags: ["autodocs"],
  args: { disabled: false, item: stagedAsset, onRemove: remove },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("Remove the staged image", async () => {
      await expect(
        canvas.getByRole("img", { name: "tenant-policy.png" })
      ).toBeVisible()
      await userEvent.click(
        canvas.getByRole("button", { name: "Remove tenant-policy.png" })
      )
      await expect(remove).toHaveBeenCalledWith(stagedAsset.asset.id)
    })
  },
})

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Remove tenant-policy.png" })
    ).toBeDisabled()
  },
})

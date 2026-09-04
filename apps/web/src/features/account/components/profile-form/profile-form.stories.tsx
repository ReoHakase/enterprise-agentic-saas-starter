import { delay, http, HttpResponse } from "msw"
import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"

import { fictionalAccountUser } from "../../test-support/fixtures"
import { ProfileForm } from "./profile-form"

const meta = preview.meta({
  title: "Web/Account/Profile Form",
  component: ProfileForm,
  tags: ["autodocs"],
  parameters: { disableGlobalToaster: true },
  decorators: [
    (Story) => (
      <Providers>
        <div className="mx-auto max-w-4xl">
          <Story />
        </div>
      </Providers>
    ),
  ],
  args: { user: fictionalAccountUser },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("空白の表示名を検証する", async () => {
      const name = canvas.getByRole("textbox", { name: "Display name" })
      await userEvent.clear(name)
      await userEvent.click(
        canvas.getByRole("button", { name: "Save profile" })
      )
      await expect(name).toBeInvalid()
      await expect(canvas.getByText("Enter your name.")).toBeVisible()
    })
  },
})

export const Saved = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.patch("*/me", async ({ request }) => {
        const payload: unknown = await request.json()
        const name =
          payload && typeof payload === "object"
            ? Reflect.get(payload, "name")
            : undefined
        return HttpResponse.json({
          ...fictionalAccountUser,
          name: typeof name === "string" ? name : fictionalAccountUser.name,
        })
      })
    )
  },
  play: async ({ canvas, step }) => {
    await step("編集したプロフィールを保存する", async () => {
      const name = canvas.getByRole("textbox", { name: "Display name" })
      await userEvent.clear(name)
      await userEvent.type(name, "Avery Quinn")
      await userEvent.click(
        canvas.getByRole("button", { name: "Save profile" })
      )
      await expect(
        await canvas.findByText("Profile updated")
      ).toBeInTheDocument()
    })
  },
})

export const Saving = meta.story({
  tags: ["manual", "!test"],
  beforeEach({ msw }) {
    msw.use(
      http.patch("*/me", async () => {
        await delay("infinite")
        return HttpResponse.json(fictionalAccountUser)
      })
    )
  },
  play: async ({ canvas, step }) => {
    const name = canvas.getByRole("textbox", { name: "Display name" })
    await step("表示名を変更して保存する", async () => {
      await userEvent.clear(name)
      await userEvent.type(name, "Avery Pending")
      await userEvent.click(
        canvas.getByRole("button", { name: "Save profile" })
      )
    })
    await step("保存中は再送信を無効にする", async () => {
      await expect(
        canvas.getByRole("button", { name: "Save profile" })
      ).toBeDisabled()
    })
  },
})

export const ApiFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.patch("*/me", () =>
        HttpResponse.json(
          {
            error: "service_unavailable",
            message: "The service is temporarily unavailable.",
          },
          { status: 503 }
        )
      )
    )
  },
  play: async ({ canvas, step }) => {
    await step("安全なAPIエラーをフォーム内に保持する", async () => {
      const name = canvas.getByRole("textbox", { name: "Display name" })
      await userEvent.clear(name)
      await userEvent.type(name, "Avery Failure")
      await userEvent.click(
        canvas.getByRole("button", { name: "Save profile" })
      )
      await expect(
        await canvas.findByText(/The profile was not saved/)
      ).toBeVisible()
    })
  },
})

import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"

import { ProfileImageEditor } from "./profile-image-editor"

const profileImageSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e2e8f0"/></svg>'
const profileImageResponse = () =>
  HttpResponse.text(profileImageSvg, {
    headers: { "Content-Type": "image/svg+xml" },
  })

const meta = preview.meta({
  title: "Web/Profile Images/Profile Image Editor",
  component: ProfileImageEditor,
  tags: ["autodocs"],
  parameters: { layout: "padded", disableGlobalToaster: true },
  decorators: [
    (Story) => (
      <Providers>
        <Story />
      </Providers>
    ),
  ],
})

export const UserWithoutImage = meta.story({
  tags: ["theme-sensitive"],
  args: {
    subject: "user",
    userId: "user-1",
    name: "Avery Stone",
    profileImage: null,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Choose image" })
    ).toBeVisible()
    await expect(
      canvas.queryByRole("button", { name: "Remove" })
    ).not.toBeInTheDocument()
  },
})

export const OrganizationWithoutImage = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.delete(
        "*/files/profile-images/organizations/org-1",
        () => new HttpResponse(null, { status: 204 })
      )
    )
  },
  args: {
    subject: "organization",
    organizationId: "org-1",
    name: "Acme Cloud",
    profileImage: null,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Choose image" })
    ).toBeVisible()
  },
})

export const ExistingImage = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("*/files/profile-images/users/:userId", profileImageResponse)
    )
  },
  args: {
    subject: "user",
    userId: "user-1",
    name: "Avery Stone",
    profileImage:
      "/files/profile-images/users/user_01K1AVERY00000000000000?v=profile_story",
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("Cancel profile image removal and restore focus", async () => {
      const trigger = canvas.getByRole("button", { name: "Remove" })
      await userEvent.click(trigger)
      await expect(
        body.getByRole("alertdialog", { name: "Remove profile image?" })
      ).toBeInTheDocument()
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(trigger).toHaveFocus())
      await waitFor(() =>
        expect(
          body.queryByRole("alertdialog", {
            name: "Remove profile image?",
          })
        ).not.toBeInTheDocument()
      )
    })
  },
})

export const RemovalFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("*/files/profile-images/users/:userId", profileImageResponse),
      http.delete("*/files/profile-images/users/me", () =>
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
  args: {
    subject: "user",
    userId: "user-1",
    name: "Avery Stone",
    profileImage:
      "/files/profile-images/users/user_01K1AVERY00000000000000?v=profile_story",
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step(
      "Keep a safe failure inside the confirmation dialog",
      async () => {
        await userEvent.click(canvas.getByRole("button", { name: "Remove" }))
        await userEvent.click(
          body.getByRole("button", { name: "Remove image" })
        )
        const error = await body.findByRole("alert")
        await waitFor(() =>
          expect(error).toHaveTextContent(
            "The profile image could not be removed. Try again. Try again. If the problem continues, contact support."
          )
        )
        await expect(
          body.getByRole("alertdialog", { name: "Remove profile image?" })
        ).toBeInTheDocument()
        await userEvent.click(body.getByRole("button", { name: "Cancel" }))
        await waitFor(() =>
          expect(
            body.queryByRole("alertdialog", {
              name: "Remove profile image?",
            })
          ).not.toBeInTheDocument()
        )
      }
    )
  },
})

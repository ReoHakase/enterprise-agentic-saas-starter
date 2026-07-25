import { http, HttpResponse } from "msw"

import preview from "#storybook/preview"

import { ProfileImageEditor } from "./profile-image-editor"

const meta = preview.meta({
  title: "Web/Profile Images/Profile Image Editor",
  component: ProfileImageEditor,
  parameters: { layout: "padded" },
})

export const UserWithoutImage = meta.story({
  args: {
    subject: "user",
    name: "Avery Stone",
    profileImage: null,
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
})

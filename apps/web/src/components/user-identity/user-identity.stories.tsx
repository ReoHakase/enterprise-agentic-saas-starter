import { http, HttpResponse } from "msw"

import preview from "#storybook/preview"

import { UserIdentity, UserProfileImage } from "./user-identity"

const fictionalUser = {
  name: "Avery Stone",
  email: "avery@example.test",
  profileImage: null,
}
const fictionalMissingImageUser = {
  ...fictionalUser,
  profileImage:
    "/files/profile-images/users/user_01K1AVERY00000000000000?v=missing",
}

const meta = preview.meta({
  title: "Web/Shared/User Identity",
  component: UserIdentity,
  tags: ["autodocs"],
  args: { user: fictionalUser },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
})

export const EmailFallback = meta.story({
  args: {
    user: { name: null, email: "support@example.test", profileImage: null },
  },
})

export const ImageFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("*/files/profile-images/users/:userId", () =>
        HttpResponse.error()
      )
    )
  },
  render: () => <UserProfileImage user={fictionalMissingImageUser} />,
})

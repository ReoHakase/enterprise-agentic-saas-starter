import type { SendEmailInput } from "../contracts/email"

export const privateMailCommandFixture = {
  to: "user@example.com",
  template: "magic_link",
  subject: "Invitation to join Private Organization",
  text: "Text",
  html: "<p>Text</p>",
  renderProps: {
    appName: "App",
    url: "https://example.com/token?secret=1",
  },
} as const satisfies SendEmailInput

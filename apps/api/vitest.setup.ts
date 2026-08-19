import type {
  OrganizationInvitationEmailProps,
  RenderedEmail,
} from "@enterprise-agentic-saas/email"
import { vi } from "vitest"

vi.mock(import("@enterprise-agentic-saas/email"), async (importOriginal) => ({
  ...(await importOriginal()),
  renderOrganizationInvitationEmail: async (
    props: OrganizationInvitationEmailProps
  ): Promise<RenderedEmail<OrganizationInvitationEmailProps>> => ({
    template: "organization_invitation",
    subject: "Organization invitation",
    html: "<p>Organization invitation</p>",
    text: "Organization invitation",
    renderProps: props,
  }),
}))

vi.mock("@enterprise-agentic-saas/email/runtime", () => ({
  backgroundTaskHandler: undefined,
  createRuntimeEmailSender: () => async () => undefined,
}))

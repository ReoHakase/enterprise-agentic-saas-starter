import { AppEmail, EmailParagraph } from "../components/app-email"
import { renderEmail } from "../render"
import type { RenderedEmail } from "../types"

export type OrganizationInvitationEmailProps = {
  appName: string
  organizationName: string
  invitationUrl: string
  inviterName?: string
}

export const OrganizationInvitationEmail = ({
  appName,
  organizationName,
  invitationUrl,
  inviterName,
}: OrganizationInvitationEmailProps) => {
  const inviterText = inviterName
    ? `${inviterName} invited you`
    : "You were invited"

  return (
    <AppEmail
      appName={appName}
      preview={`${inviterText} to join ${organizationName}`}
      eyebrow="Organization invitation"
      title={`Join ${organizationName}`}
      actionLabel="Review invitation"
      actionUrl={invitationUrl}
      securityNote="Only accept this invitation if you recognize the organization and inviter. The link is intended for the invited email address and should not be forwarded."
    >
      <EmailParagraph>
        {inviterText} to collaborate in {organizationName} on {appName}.
      </EmailParagraph>
      <EmailParagraph>
        Review the organization before joining. Your access is scoped to the
        role selected by its administrator and can be changed later.
      </EmailParagraph>
    </AppEmail>
  )
}

export default OrganizationInvitationEmail // email devで表示するために必要

export const renderOrganizationInvitationEmail = async (
  props: OrganizationInvitationEmailProps
): Promise<RenderedEmail<OrganizationInvitationEmailProps>> => {
  const { html, text } = await renderEmail(
    <OrganizationInvitationEmail {...props} />
  )

  return {
    template: "organization_invitation",
    subject: `Invitation to join ${props.organizationName}`,
    html,
    text,
    renderProps: props,
  }
}

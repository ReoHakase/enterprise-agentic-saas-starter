import { AppEmail, EmailParagraph } from "../components/app-email"
import type { RenderedEmail } from "../contracts/email"
import { renderEmail } from "../render/index"

export type VerificationEmailProps = {
  appName: string
  url: string
}

const VerificationEmail = ({ appName, url }: VerificationEmailProps) => (
  <AppEmail
    appName={appName}
    preview={`Verify your email for ${appName}`}
    eyebrow="Email verification"
    title="Confirm this email address"
    actionLabel="Verify email"
    actionUrl={url}
    securityNote="If you did not create or update an account with this email address, do not use the link. You can safely ignore this message."
  >
    <EmailParagraph>
      Confirm that this email address belongs to you before it is used for
      account recovery, invitations, and security notifications.
    </EmailParagraph>
  </AppEmail>
)

export default VerificationEmail

export const renderVerificationEmail = async (
  props: VerificationEmailProps
): Promise<RenderedEmail<VerificationEmailProps>> => {
  const { html, text } = await renderEmail(<VerificationEmail {...props} />)

  return {
    template: "verification",
    subject: `Verify your email for ${props.appName}`,
    html,
    text,
    renderProps: props,
  }
}

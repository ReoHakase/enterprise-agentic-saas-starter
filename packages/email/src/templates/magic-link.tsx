import { AppEmail, EmailParagraph } from "../components/app-email"
import type { RenderedEmail } from "../contracts/email"
import { renderEmail } from "../render/index"

export type MagicLinkEmailProps = {
  appName: string
  url: string
}

const MagicLinkEmail = ({ appName, url }: MagicLinkEmailProps) => (
  <AppEmail
    appName={appName}
    preview={`Your secure sign-in link for ${appName}`}
    eyebrow="Secure sign in"
    title="Continue to your workspace"
    actionLabel="Sign in securely"
    actionUrl={url}
    securityNote="This one-time link is tied to your sign-in request. If you did not request it, you can safely ignore this email. Never forward this message."
  >
    <EmailParagraph>
      Use the button below to finish signing in to {appName}. You will return to
      the organization and task workspace you were using.
    </EmailParagraph>
    <EmailParagraph>
      For your security, this link may expire and can only be used as intended.
    </EmailParagraph>
  </AppEmail>
)

export default MagicLinkEmail // email devで表示するために必要

export const renderMagicLinkEmail = async (
  props: MagicLinkEmailProps
): Promise<RenderedEmail<MagicLinkEmailProps>> => {
  const { html, text } = await renderEmail(<MagicLinkEmail {...props} />)

  return {
    template: "magic_link",
    subject: `Your secure sign-in link for ${props.appName}`,
    html,
    text,
    renderProps: props,
  }
}

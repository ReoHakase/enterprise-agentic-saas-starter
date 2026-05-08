import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"

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
    <Html>
      <Head />
      <Preview>
        {inviterText} to join {organizationName}
      </Preview>
      <Body>
        <Container>
          <Text>{inviterText}</Text>
          <Text>
            Join {organizationName} on {appName}.
          </Text>
          <Section>
            <Button href={invitationUrl}>Accept invitation</Button>
          </Section>
          <Text>If you did not expect this invitation, you can ignore it.</Text>
        </Container>
      </Body>
    </Html>
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
    subject: `Join ${props.organizationName}`,
    html,
    text,
    renderProps: props,
  }
}

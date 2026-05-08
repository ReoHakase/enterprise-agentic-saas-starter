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

export type MagicLinkEmailProps = {
  appName: string
  url: string
}

export const MagicLinkEmail = ({ appName, url }: MagicLinkEmailProps) => (
  <Html>
    <Head />
    <Preview>Sign in to {appName}</Preview>
    <Body>
      <Container>
        <Text>Sign in to {appName}</Text>
        <Section>
          <Button href={url}>Sign in</Button>
        </Section>
        <Text>If you did not request this, you can ignore this email.</Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail // email devで表示するために必要

export const renderMagicLinkEmail = async (
  props: MagicLinkEmailProps
): Promise<RenderedEmail<MagicLinkEmailProps>> => {
  const { html, text } = await renderEmail(<MagicLinkEmail {...props} />)

  return {
    subject: `Sign in to ${props.appName}`,
    html,
    text,
    renderProps: props,
  }
}

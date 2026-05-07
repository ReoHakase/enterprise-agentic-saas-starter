# Email Reference

## render helper

```ts
import { render } from "@react-email/render"
import type { ReactElement } from "react"

export async function renderEmail(component: ReactElement) {
  const html = await render(component)
  const text = await render(component, { plainText: true })

  return { html, text }
}
```

## magic link template

```tsx
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

export type MagicLinkEmailProps = {
  appName: string
  url: string
}

export function MagicLinkEmail({ appName, url }: MagicLinkEmailProps) {
  return (
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
}
```

## console sender

```ts
import type { SendEmail, SendEmailInput } from "../types"

export type ConsoleEmailLogger = (input: SendEmailInput) => void

export function createConsoleSender(
  logger: ConsoleEmailLogger = (input) => {
    console.info("email:send", input)
  }
): SendEmail {
  return async (input: SendEmailInput) => {
    logger(input)
  }
}
```

## app側composition

```ts
import {
  createConsoleSender,
  MagicLinkEmail,
  renderEmail,
} from "@enterprise-agentic-saas/email";

const sendEmail = createConsoleSender();

export async function sendMagicLinkEmail(input: {
  email: string;
  url: string;
}) {
  const { html, text } = await renderEmail(
    <MagicLinkEmail appName="Todo SaaS" url={input.url} />,
  );

  await sendEmail({
    to: input.email,
    subject: "Sign in",
    html,
    text,
  });
}
```

## package exports

```json
{
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./templates": {
      "types": "./src/templates/index.ts",
      "default": "./src/templates/index.ts"
    }
  }
}
```

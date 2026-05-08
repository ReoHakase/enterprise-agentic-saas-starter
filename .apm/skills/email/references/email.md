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

const defaultConsoleLogger: ConsoleEmailLogger = (input: SendEmailInput) => {
  const payload: Record<string, unknown> = {
    to: input.to,
    subject: input.subject,
    textLength: input.text.length,
  }
  if (input.html !== undefined) payload.htmlLength = input.html.length
  if (input.renderProps !== undefined) payload.renderProps = input.renderProps
  console.info("email:send", payload)
}

export function createConsoleSender(
  logger: ConsoleEmailLogger = defaultConsoleLogger
): SendEmail {
  return async (input: SendEmailInput) => {
    logger(input)
  }
}
```

## app側composition

```ts
import { createConsoleSender, renderMagicLinkEmail } from "@enterprise-agentic-saas/email";

const sendEmail = createConsoleSender();

export async function sendMagicLinkEmail(input: {
  email: string;
  url: string;
}) {
  const rendered = await renderMagicLinkEmail({
    appName: "Todo SaaS",
    url: input.url,
  });

  await sendEmail({ to: input.email, ...rendered });
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

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
import type { EmailTemplate, SendEmail, SendEmailInput } from "../types"

export type ConsoleEmailEvent = {
  template: EmailTemplate
  recipientDomain: string | null
}

export type ConsoleEmailLogger = (event: ConsoleEmailEvent) => void

const defaultConsoleLogger: ConsoleEmailLogger = (event) => {
  console.info("email:send", event)
}

const eventFromInput = (input: SendEmailInput): ConsoleEmailEvent => {
  const separator = input.to.lastIndexOf("@")
  return {
    template: input.template,
    recipientDomain:
      separator < 0 ? null : input.to.slice(separator + 1).toLowerCase(),
  }
}

export function createConsoleSender(
  logger: ConsoleEmailLogger = defaultConsoleLogger
): SendEmail {
  return async (input: SendEmailInput) => {
    logger(eventFromInput(input))
  }
}
```

loggerへ`SendEmailInput`そのものを渡さない。`renderProps`の値、recipient全文、text/htmlにはtokenや認証URLが含まれ、subjectにはorganization名等が含まれる。

## app側composition

```ts
import { renderMagicLinkEmail } from "@enterprise-agentic-saas/email";
import { createRuntimeEmailSender } from "@enterprise-agentic-saas/email/runtime";

const sendEmail = createRuntimeEmailSender({
  provider: env.EMAIL_PROVIDER,
  runtime: env.NODE_ENV,
  from: env.EMAIL_FROM,
  fromName: env.APP_NAME,
});

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
    },
    "./runtime": {
      "types": "./src/runtime/types.ts",
      "workerd": "./src/runtime/workerd.ts",
      "default": "./src/runtime/default.ts"
    }
  }
}
```

Wranglerは`workerd` conditionを選ぶ。ここだけで`cloudflare:workers`の`env.EMAIL`と`waitUntil`を解決し、通常のBun/Node importではdefault runtimeを使う。

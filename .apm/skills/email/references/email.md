# Email Reference

## render helper

```ts
import { render } from "@react-email/render";
import type { ReactElement } from "react";

export async function renderEmail(component: ReactElement) {
  const html = await render(component);
  const text = await render(component, { plainText: true });

  return { html, text };
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
} from "@react-email/components";

export type MagicLinkEmailProps = {
  appName: string;
  url: string;
};

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
  );
}
```

## Resend sender

```ts
import { Resend } from "resend";
import type { SendEmail, SendEmailInput } from "../types";

export function createResendSender(options: {
  apiKey: string;
  from: string;
}): SendEmail {
  const resend = new Resend(options.apiKey);

  return async (input: SendEmailInput) => {
    await resend.emails.send({
      from: options.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  };
}
```

## app側composition

```ts
import {
  createResendSender,
  MagicLinkEmail,
  renderEmail,
} from "@repo/email";
import { env } from "../env";

const sendEmail = createResendSender({
  apiKey: env.RESEND_API_KEY,
  from: env.EMAIL_FROM,
});

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

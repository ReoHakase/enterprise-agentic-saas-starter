# Auth Reference

## createAuth

```ts
export type CreateAuthOptions = {
  db: Db;
  appUrl: string;
  apiUrl: string;
  trustedOrigins: string[];
  sendMagicLinkEmail: (input: { email: string; url: string }) => Promise<void>;
  sendInvitationEmail: (input: {
    email: string;
    organizationName: string;
  }) => Promise<void>;
  google: { clientId: string; clientSecret: string };
  github: { clientId: string; clientSecret: string };
};

export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(options.db, {
      provider: "sqlite",
    }),
    trustedOrigins: options.trustedOrigins,
    socialProviders: {
      google: options.google,
      github: options.github,
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await options.sendMagicLinkEmail({ email, url });
        },
      }),
      passkey(),
      organization({
        async sendInvitationEmail(data) {
          await options.sendInvitationEmail({
            email: data.email,
            organizationName: data.organization.name,
          });
        },
      }),
    ],
  });
}
```

## email callback境界

`packages/auth` はReact EmailやResendをimportしない。callback typeだけを受ける。

```ts
export type SendMagicLinkEmail = (input: {
  email: string;
  url: string;
}) => Promise<void>;

export type SendInvitationEmail = (input: {
  email: string;
  organizationName: string;
}) => Promise<void>;
```

`apps/api` が `packages/email` のtemplate/render/senderを組み合わせ、このcallbackとして `createAuth()` に渡す。

## client export

```json
{
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./client": {
      "types": "./src/client.ts",
      "default": "./src/client.ts"
    }
  }
}
```

## permission境界

auth packageに入れる:

- identity
- session
- organization membership
- coarse roles

app側に置く:

- todo/project/group resource permission
- billing permission
- audit log
- tenant data access check

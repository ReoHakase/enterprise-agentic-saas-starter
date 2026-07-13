export type EmailTemplate =
  | "magic_link"
  | "organization_invitation"
  | "verification"

export type SendEmailInput = {
  to: string
  template: EmailTemplate
  subject: string
  text: string
  html?: string
  /** Template props for provider adapters. Sender logs must never emit their raw values. */
  renderProps?: unknown
}

export type SendEmail = (input: SendEmailInput) => Promise<void>

export type RenderedEmail<P = unknown> = {
  template: EmailTemplate
  subject: string
  text: string
  html: string
  renderProps: P
}

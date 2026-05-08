export type SendEmailInput = {
  to: string
  subject: string
  text: string
  html?: string
  /** Template props echoed from `render*Email` for debug logging (may include secrets in dev). */
  renderProps?: unknown
}

export type SendEmail = (input: SendEmailInput) => Promise<void>

export type RenderedEmail<P = unknown> = {
  subject: string
  text: string
  html: string
  renderProps: P
}

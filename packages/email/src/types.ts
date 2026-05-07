export type SendEmailInput = {
  to: string
  subject: string
  text: string
  html?: string
}

export type SendEmail = (input: SendEmailInput) => Promise<void>

export type RenderedEmail = {
  subject: string
  text: string
  html: string
}

export {
  resolveEmailFrom,
  resolveEmailProvider,
  resolveMailpitUrl,
} from "./config"
export type {
  EmailProvider,
  EmailRuntime,
  EmailTemplate,
  RenderedEmail,
  SendEmail,
  SendEmailInput,
} from "./contracts/email"
export {
  createCloudflareEmailSender,
  EmailDeliveryError,
} from "./providers/cloudflare"
export { MailpitDeliveryError } from "./providers/mailpit"
export { renderEmail } from "./render/index"
export * from "./templates/index"

import type { SendEmail } from "../contracts/email"

export const createNoopSender = (): SendEmail => async () => {}

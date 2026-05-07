import type { SendEmail } from "../types"

export const createNoopSender = (): SendEmail => async () => {}

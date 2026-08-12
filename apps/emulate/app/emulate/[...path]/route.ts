import { createEmulateHandler } from "@emulators/adapter-next"
import github, { seedFromConfig } from "@emulators/github"

export const runtime = "nodejs"

export const { GET, POST, PUT, PATCH, DELETE } = createEmulateHandler({
  services: {
    github: {
      emulator: { default: github, seedFromConfig },
      seed: {
        users: [
          {
            login: "oauth-alice",
            name: "OAuth Alice",
            email: "oauth-alice@example.test",
          },
          {
            login: "oauth-bob",
            name: "OAuth Bob",
            email: "oauth-bob@example.test",
          },
          {
            login: "oauth-carol",
            name: "OAuth Carol",
            email: "oauth-carol@example.test",
          },
        ],
      },
    },
  },
})

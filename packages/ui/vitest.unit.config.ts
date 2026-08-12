import { defineProject } from "vitest/config"

export default defineProject({
  test: {
    name: "unit",
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
})

import { defineProject } from "vitest/config"

export default defineProject({
  root: import.meta.dirname,
  optimizeDeps: {
    include: [
      "@base-ui/react/alert-dialog",
      "@base-ui/react/drawer",
      "@base-ui/react/toggle",
      "@base-ui/react/toggle-group",
    ],
  },
  test: {
    name: "ui-unit",
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
})

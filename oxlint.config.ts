import { defineConfig, type OxlintConfig, type OxlintOverride } from "oxlint"

type Rules = NonNullable<OxlintConfig["rules"]>

type RestrictedImportPattern = {
  group: string[]
  message: string
}

type WorkspaceName =
  | "agent"
  | "agent-contracts"
  | "agent-tools"
  | "api"
  | "auth"
  | "db"
  | "email"
  | "emulate"
  | "portless-topology"
  | "ui"
  | "web"

type BudgetProfileOptions = {
  adapter?: string[]
  react?: string[]
  testReact?: boolean
}

const executableExtensions = "{js,jsx,mjs,cjs,ts,tsx,mts,cts}"

export const lintIgnorePatterns = [
  "**/{node_modules,dist,coverage,.next,.wrangler,.mastra,.open-next,.turbo}/**",
  "**/.next-*/**",
  "**/generated/**",
  `**/*.generated.${executableExtensions}`,
  "**/cloudflare-env.d.ts",
  "**/drizzle/**",
  "**/storybook-static/**",
  "**/playwright-report/**",
  "**/test-results/**",
] as const

const testCodeGlobs = [
  `**/*.{test,spec}.${executableExtensions}`,
  "**/*.stories.{js,jsx,ts,tsx}",
  `**/{test,tests,testing,__tests__,e2e,test-support,fixtures,__fixtures__}/**/*.${executableExtensions}`,
] as const

const productionBudgets: Rules = {
  complexity: ["error", { max: 25, variant: "modified" }],
  "max-depth": ["error", { max: 6 }],
  "max-lines": [
    "error",
    { max: 500, skipBlankLines: true, skipComments: true },
  ],
  "max-lines-per-function": [
    "error",
    {
      max: 250,
      skipBlankLines: true,
      skipComments: true,
      IIFEs: true,
    },
  ],
  "max-params": ["error", { max: 6, countThis: "never" }],
  "max-statements": ["error", { max: 100, ignoreTopLevelFunctions: false }],
  "max-nested-callbacks": ["error", { max: 4 }],
  "max-classes-per-file": ["error", { max: 2 }],
  "unicorn/max-nested-calls": ["error", { max: 6 }],
}

const adapterBudgets: Rules = {
  ...productionBudgets,
  complexity: ["error", { max: 30, variant: "modified" }],
}

const reactBudgets: Rules = {
  ...adapterBudgets,
  "react/jsx-max-depth": ["error", { max: 9 }],
}

const testBudgets: Rules = {
  complexity: ["error", { max: 50, variant: "modified" }],
  "max-depth": ["error", { max: 12 }],
  "max-lines": [
    "error",
    { max: 1000, skipBlankLines: true, skipComments: true },
  ],
  "max-lines-per-function": [
    "error",
    {
      max: 500,
      skipBlankLines: true,
      skipComments: true,
      IIFEs: true,
    },
  ],
  "max-params": ["error", { max: 10, countThis: "never" }],
  "max-statements": ["error", { max: 500, ignoreTopLevelFunctions: false }],
  "max-nested-callbacks": ["error", { max: 10 }],
  "max-classes-per-file": ["error", { max: 8 }],
  "unicorn/max-nested-calls": ["error", { max: 10 }],
  "vitest/max-nested-describe": ["error", { max: 5 }],
}

const commonImportRules: Rules = {
  "import/no-cycle": [
    "error",
    {
      ignoreExternal: false,
      ignoreTypes: true,
    },
  ],
  "import/no-duplicates": [
    "error",
    { considerQueryString: true, preferInline: false },
  ],
  "import/no-namespace": [
    "error",
    {
      ignore: [
        "node:*",
        "valibot",
        "@testing-library/jest-dom/vitest",
        "@enterprise-agentic-saas/db/schema",
        "../schema/index",
      ],
    },
  ],
  "import/no-self-import": "error",
  "import/no-unassigned-import": [
    "error",
    {
      allow: [
        "**/*.css",
        "server-only",
        "client-only",
        "**/{setup,instrumentation}.{js,jsx,ts,tsx}",
      ],
    },
  ],
  "typescript/no-require-imports": "error",
}

export const createBudgetOverrides = ({
  adapter = [],
  react = [],
  testReact = false,
}: BudgetProfileOptions): OxlintOverride[] => {
  const overrides: OxlintOverride[] = []

  if (adapter.length > 0) {
    overrides.push({ files: adapter, rules: adapterBudgets })
  }

  if (react.length > 0) {
    overrides.push({ files: react, rules: reactBudgets })
  }

  overrides.push({
    files: [...testCodeGlobs],
    rules: {
      ...testBudgets,
      ...(testReact ? { "react/jsx-max-depth": ["error", { max: 12 }] } : {}),
    },
  })

  return overrides
}

const workspaceAllowlist: Record<WorkspaceName, string[]> = {
  agent: [
    "@enterprise-agentic-saas/agent-contracts",
    "@enterprise-agentic-saas/agent-tools",
  ],
  "agent-contracts": [],
  "agent-tools": ["@enterprise-agentic-saas/agent-contracts"],
  api: [
    "@enterprise-agentic-saas/agent-contracts",
    "@enterprise-agentic-saas/agent-tools",
    "@enterprise-agentic-saas/auth",
    "@enterprise-agentic-saas/auth/*",
    "@enterprise-agentic-saas/db",
    "@enterprise-agentic-saas/db/*",
    "@enterprise-agentic-saas/email",
    "@enterprise-agentic-saas/email/*",
  ],
  auth: [
    "@enterprise-agentic-saas/db",
    "@enterprise-agentic-saas/db/*",
    "@enterprise-agentic-saas/email",
    "@enterprise-agentic-saas/email/*",
  ],
  db: [],
  email: [],
  emulate: ["@enterprise-agentic-saas/auth/github-oauth"],
  "portless-topology": [],
  ui: ["@enterprise-agentic-saas/ui/*"],
  web: [
    "@enterprise-agentic-saas/agent-contracts",
    "@enterprise-agentic-saas/api/client",
    "@enterprise-agentic-saas/auth/client",
    "@enterprise-agentic-saas/ui/*",
  ],
}

const toAllowedWorkspacePattern = (entry: string) =>
  entry.endsWith("/*") ? `!${entry.slice(0, -1)}**` : `!${entry}`

export const workspaceBoundaryRule = (
  workspace: WorkspaceName,
  additionalPatterns: RestrictedImportPattern[] = []
): Rules => ({
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: [
            "@enterprise-agentic-saas/**",
            ...workspaceAllowlist[workspace].map(toAllowedWorkspacePattern),
          ],
          message:
            "Workspace imports must follow docs/architecture/system-boundaries.md and package.json exports.",
        },
        ...additionalPatterns,
      ],
    },
  ],
})

export default defineConfig({
  plugins: ["import", "node", "promise", "typescript", "unicorn", "oxc"],
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "warn",
  },
  ignorePatterns: [...lintIgnorePatterns],
  env: {
    builtin: true,
    es2024: true,
  },
  rules: {
    ...productionBudgets,
    ...commonImportRules,
    eqeqeq: ["error", "always", { null: "ignore" }],
    "func-style": ["error", "expression"],
    "arrow-body-style": ["error", "as-needed"],
    "unicorn/prefer-node-protocol": "error",
    "typescript/consistent-type-assertions": [
      "error",
      {
        assertionStyle: "never",
        objectLiteralTypeAssertions: "never",
        arrayLiteralTypeAssertions: "never",
      },
    ],
    "typescript/consistent-type-definitions": ["error", "type"],
    "typescript/consistent-type-imports": [
      "error",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
    "typescript/no-non-null-assertion": "error",
    "typescript/no-unsafe-type-assertion": "error",
    "typescript/prefer-function-type": "error",
  },
})

import { ActivityIcon, CheckCircle2Icon, Layers3Icon } from "lucide-react"

import { Auth } from "@/components/auth/auth"

type AuthPageProps = {
  params: Promise<{
    path: string
  }>
}

const previewRows = [
  { label: "Audit trail", value: "12.8k", change: "+18%" },
  { label: "Active seats", value: "248", change: "+6%" },
  { label: "Open tasks", value: "31", change: "-9%" },
]

export default async function AuthPage({ params }: AuthPageProps) {
  const { path } = await params

  return (
    <main className="relative flex min-h-svh overflow-hidden bg-background">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--background)_0%,color-mix(in_oklab,var(--primary)_12%,var(--background))_46%,var(--muted)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--primary)_24%,transparent),transparent_42%),linear-gradient(90deg,color-mix(in_oklab,var(--border)_45%,transparent)_1px,transparent_1px),linear-gradient(180deg,color-mix(in_oklab,var(--border)_38%,transparent)_1px,transparent_1px)] bg-size-[auto,72px_72px,72px_72px]" />

      <div className="relative mx-auto grid min-h-svh w-full max-w-6xl grid-cols-1 items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <section className="hidden min-w-0 flex-col gap-8 lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-4xl bg-foreground text-background shadow-lg shadow-foreground/10">
              <Layers3Icon aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Enterprise Agentic SaaS
              </p>
              <h1 className="text-4xl font-semibold tracking-normal">
                Secure team operations, ready on entry.
              </h1>
            </div>
          </div>

          <div className="relative max-w-2xl overflow-hidden rounded-4xl border border-foreground/10 bg-card/80 p-3 shadow-2xl shadow-primary/10 backdrop-blur">
            <div className="rounded-[calc(var(--radius-4xl)-0.75rem)] border border-border/70 bg-background/80">
              <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-4xl bg-primary/10 text-primary">
                    <ActivityIcon aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Operations console</p>
                    <p className="text-xs text-muted-foreground">
                      Organization activity
                    </p>
                  </div>
                </div>
                <div className="rounded-4xl border border-border bg-card px-3 py-1 text-xs font-medium">
                  Live
                </div>
              </div>

              <div className="grid gap-3 p-4">
                {previewRows.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-3xl border border-border/70 bg-card/80 px-4 py-3 shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last 30 days
                      </p>
                    </div>
                    <p className="text-lg font-semibold">{row.value}</p>
                    <p className="rounded-4xl bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {row.change}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3 border-t border-border/70 p-4">
                {["Auth", "Roles", "Audit"].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-3xl bg-muted/70 px-3 py-2 text-sm"
                  >
                    <CheckCircle2Icon aria-hidden="true" />
                    <span className="truncate">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-w-0 justify-center lg:justify-end">
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center justify-center gap-3 lg:hidden">
              <div className="flex size-10 items-center justify-center rounded-4xl bg-foreground text-background">
                <Layers3Icon aria-hidden="true" />
              </div>
              <p className="text-sm font-medium">Enterprise Agentic SaaS</p>
            </div>

            <Auth className="w-full max-w-none" path={path} />
          </div>
        </section>
      </div>
    </main>
  )
}

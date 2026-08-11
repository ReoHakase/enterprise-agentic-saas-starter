import Link from "fumadocs-core/link"

export default function DocsNotFound() {
  return (
    <main className="mx-auto flex min-h-96 w-full max-w-lg flex-col justify-center gap-5">
      <h1 className="text-2xl font-semibold">Documentation page not found</h1>
      <p className="text-muted-foreground">
        The documentation address may be outdated or unavailable.
      </p>
      <Link
        href="/docs"
        className="w-fit rounded-4xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
      >
        Back to documentation
      </Link>
    </main>
  )
}

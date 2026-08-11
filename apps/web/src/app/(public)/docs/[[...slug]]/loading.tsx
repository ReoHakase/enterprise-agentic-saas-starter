export default function Loading() {
  return (
    <main
      data-route-boundary="true"
      data-boundary-state="loading"
      className="mx-auto w-full max-w-4xl animate-pulse space-y-6"
      aria-busy="true"
      aria-label="Loading documentation"
      role="status"
    >
      <div className="h-4 w-40 rounded bg-muted" />
      <div className="h-12 w-2/3 rounded bg-muted" />
      <div className="h-5 w-full rounded bg-muted" />
      <div className="h-5 w-5/6 rounded bg-muted" />
      <div className="h-64 rounded-2xl bg-muted" />
    </main>
  )
}

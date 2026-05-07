import { Auth } from "@/components/auth/auth"

type AuthPageProps = {
  params: Promise<{
    path: string
  }>
}

export default async function AuthPage({ params }: AuthPageProps) {
  const { path } = await params

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Auth className="w-full max-w-sm" path={path} />
    </main>
  )
}

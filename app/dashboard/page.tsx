import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/Dashboard'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/')

  const user = {
    id: (session.user as { id?: string }).id ?? session.user.email!,
    name: session.user.name ?? 'User',
    email: session.user.email!,
    image: session.user.image ?? undefined,
  }

  return <Dashboard user={user} />
}

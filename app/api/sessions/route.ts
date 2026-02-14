import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createSession, getSessions } from '@/lib/storage'
import { SessionRecord } from '@/types'
import { v4 as uuid } from 'uuid'

type NS = { user?: { id?: string; name?: string | null; email?: string | null } } | null

function getUserId(session: NS) {
  return (session?.user as { id?: string })?.id ?? session?.user?.email ?? null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = getUserId(session)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(getSessions(userId))
}

export async function POST() {
  const session = await getServerSession(authOptions)
  const userId = getUserId(session)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const record: SessionRecord = {
    id: uuid(),
    userId,
    userName: session!.user?.name ?? session!.user?.email ?? 'User',
    startTime: new Date().toISOString(),
    status: 'recording',
  }
  return NextResponse.json(createSession(record), { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getReport, getReports, createReport, updateSession } from '@/lib/storage'
import { computeReport } from '@/lib/reportLogic'
import { SensorPoint } from '@/types'

type NS = { user?: { id?: string; name?: string | null; email?: string | null } } | null

function getUserId(session: NS) {
  return (session?.user as { id?: string })?.id ?? session?.user?.email ?? null
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = getUserId(session)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionId = new URL(req.url).searchParams.get('sessionId')
  if (sessionId) {
    const r = getReport(sessionId)
    return r ? NextResponse.json(r) : NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(getReports(userId))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = getUserId(session)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, dataPoints, durationSeconds } = (await req.json()) as {
    sessionId: string
    dataPoints: SensorPoint[]
    durationSeconds: number
  }

  const report = computeReport(sessionId, userId, dataPoints, durationSeconds)
  const saved = createReport(report)

  updateSession(sessionId, {
    status: 'report_ready',
    endTime: new Date().toISOString(),
    duration: durationSeconds,
    dataPoints: dataPoints.slice(-1000), // store last 1000 pts
  })

  return NextResponse.json(saved, { status: 201 })
}

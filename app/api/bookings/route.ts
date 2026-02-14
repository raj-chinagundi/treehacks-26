import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createBooking } from '@/lib/storage'
import { BookingRecord } from '@/types'
import { v4 as uuid } from 'uuid'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string })?.id ?? session?.user?.email ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    reportId: string
    providerName: string
    providerType: 'dentist' | 'psychiatrist'
    appointmentTime: string
    address: string
    city: string
  }

  const booking: BookingRecord = {
    id: uuid(),
    userId,
    reportId: body.reportId,
    providerName: body.providerName,
    providerType: body.providerType,
    appointmentTime: body.appointmentTime,
    address: body.address,
    city: body.city,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  }

  return NextResponse.json(createBooking(booking), { status: 201 })
}

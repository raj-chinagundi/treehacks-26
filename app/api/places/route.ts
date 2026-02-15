import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('query') || 'dentist'
  const location = searchParams.get('location') || ''

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Google Places API key not configured. Set GOOGLE_PLACES_API_KEY in .env.local' },
      { status: 500 }
    )
  }

  const searchQuery = `${query} near ${location}`
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`

  const res = await fetch(url)
  const data = await res.json()

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return NextResponse.json(
      { error: `Google Places API error: ${data.status}` },
      { status: 500 }
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const places = (data.results || []).slice(0, 5).map((p: any) => ({
    name: p.name,
    address: p.formatted_address,
    rating: p.rating ?? null,
    totalRatings: p.user_ratings_total ?? 0,
    openNow: p.opening_hours?.open_now ?? null,
  }))

  return NextResponse.json({ places })
}

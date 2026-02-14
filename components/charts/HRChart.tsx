'use client'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import { SensorPoint } from '@/types'

export default function HRChart({ data }: { data: SensorPoint[] }) {
  if (!data.length) {
    return (
      <div className="h-24 flex items-center justify-center text-xs text-gray-400">
        Awaiting data…
      </div>
    )
  }

  const pts = data.map(d => ({ t: +(d.t / 1000).toFixed(1), hr: d.hr }))
  const hrVals = pts.map(p => p.hr)
  const minHR = Math.min(...hrVals) - 5
  const maxHR = Math.max(...hrVals) + 5

  return (
    <div className="h-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <XAxis dataKey="t" hide />
          <YAxis domain={[minHR, maxHR]} hide />
          <Line type="monotone" dataKey="hr" stroke="#f97316" strokeWidth={1.5}
            dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

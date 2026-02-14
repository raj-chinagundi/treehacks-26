'use client'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts'
import { SensorPoint } from '@/types'

export default function EMGChart({ data }: { data: SensorPoint[] }) {
  if (!data.length) {
    return (
      <div className="h-24 flex items-center justify-center text-xs text-gray-400">
        Awaiting data…
      </div>
    )
  }

  const pts = data.map(d => ({ t: +(d.t / 1000).toFixed(1), emg: d.emg }))

  return (
    <div className="h-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <XAxis dataKey="t" hide />
          <YAxis domain={[0, 3]} hide />
          <ReferenceLine y={0.5} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
          <Line type="monotone" dataKey="emg" stroke="#0ea5e9" strokeWidth={1.5}
            dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

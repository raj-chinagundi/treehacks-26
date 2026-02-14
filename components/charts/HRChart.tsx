'use client'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { SensorPoint } from '@/types'

export default function HRChart({ data }: { data: SensorPoint[] }) {
  if (!data.length) {
    return (
      <div className="h-44 flex items-center justify-center text-sm text-slate-500">
        Awaiting data…
      </div>
    )
  }

  const pts = data.map(d => ({ t: +(d.t / 1000).toFixed(1), hr: d.hr }))
  const hrVals = pts.map(p => p.hr)
  const minHR = Math.min(...hrVals) - 5
  const maxHR = Math.max(...hrVals) + 5

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" tickFormatter={v => `${v}s`} />
          <YAxis domain={[minHR, maxHR]} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={32} />
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }} labelFormatter={v => `t = ${v}s`} />
          <Line type="monotone" dataKey="hr" stroke="#f97316" strokeWidth={2}
            dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

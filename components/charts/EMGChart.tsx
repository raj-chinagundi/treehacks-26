'use client'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'
import { SensorPoint } from '@/types'

export default function EMGChart({ data }: { data: SensorPoint[] }) {
  if (!data.length) {
    return (
      <div className="h-44 flex items-center justify-center text-sm text-slate-500">
        Awaiting data…
      </div>
    )
  }

  const pts = data.map(d => ({ t: +(d.t / 1000).toFixed(1), emg: d.emg }))

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" tickFormatter={v => `${v}s`} />
          <YAxis domain={[0, 3]} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={32} />
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }} labelFormatter={v => `t = ${v}s`} />
          <ReferenceLine y={0.5} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} label={{ value: 'threshold', fill: '#ef4444', fontSize: 9, position: 'right' }} />
          <Line type="monotone" dataKey="emg" stroke="#06b6d4" strokeWidth={2}
            dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

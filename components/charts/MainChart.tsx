'use client'
import {
  LineChart, Line, XAxis, YAxis,
  ResponsiveContainer, Legend, Tooltip,
  ReferenceLine,
} from 'recharts'
import { SensorPoint } from '@/types'

export default function MainChart({ data }: { data: SensorPoint[] }) {
  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-400">
        Start a session to see live sensor data
      </div>
    )
  }

  // Normalise onto a shared scale: EMG ×30, Temp ×3 so they're all visible alongside HR
  const pts = data.map(d => ({
    t: (d.t / 1000).toFixed(1),
    'EMG (×30)': +(d.emg * 30).toFixed(1),
    'Heart Rate': +d.hr.toFixed(1),
    'Temp (×3)':  +(d.temp * 3).toFixed(1),
  }))

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
          <XAxis dataKey="t"
            tickFormatter={v => `${v}s`}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false} axisLine={false}
            interval="preserveStartEnd" />
          <YAxis
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false} axisLine={false} width={40} />
          <Tooltip
            contentStyle={{ fontSize: 11, border: '1px solid #e5e7eb', borderRadius: 8 }}
            labelFormatter={v => `t = ${v}s`} />
          <Legend iconType="line" iconSize={12}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          {/* Clench threshold line for EMG (0.5 × 30 = 15) */}
          <ReferenceLine y={15} stroke="#ef4444" strokeDasharray="3 3"
            strokeWidth={1} label={{ value: 'clench', fill: '#ef4444', fontSize: 9 }} />
          <Line type="monotone" dataKey="EMG (×30)"  stroke="#0ea5e9" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="Heart Rate"  stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="Temp (×3)"   stroke="#8b5cf6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

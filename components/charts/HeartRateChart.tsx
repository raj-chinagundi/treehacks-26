'use client'

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { SensorPoint } from '@/types'

/**
 * Heart Rate chart — shows raw BPM over time.
 *
 * A clean flowing line with a subtle gradient fill.
 * Y-axis auto-scales to the session's BPM range.
 */
export default function HeartRateChart({
  data,
  hideXAxis,
}: {
  data: SensorPoint[]
  hideXAxis?: boolean
}) {
  if (!data.length) {
    return <div className="h-44 flex items-center justify-center text-sm text-slate-500">Awaiting data…</div>
  }

  const pts = data.map(d => ({
    t: +(d.t / 1000).toFixed(1),
    bpm: Math.round(d.hr),
  }))

  const bpmValues = pts.map(p => p.bpm).filter(b => b > 0)
  const minBpm = bpmValues.length ? Math.max(30, Math.min(...bpmValues) - 10) : 40
  const maxBpm = bpmValues.length ? Math.max(...bpmValues) + 10 : 120

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pts} margin={{ top: 12, right: 16, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <XAxis
            type="number"
            dataKey="t"
            tick={hideXAxis ? false : { fontSize: 10, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            domain={['dataMin', 'dataMax']}
            tickFormatter={v => `${v}s`}
            height={hideXAxis ? 4 : undefined}
          />
          <YAxis
            domain={[minBpm, maxBpm]}
            tick={{ fontSize: 9, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={v => `${v}`}
          />

          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }}
            labelFormatter={v => `t = ${v}s`}
            formatter={(value: number) => [`${value} bpm`, 'Heart Rate']}
          />

          <Area
            type="monotone"
            dataKey="bpm"
            stroke="#f97316"
            strokeWidth={1.5}
            fill="url(#hrGrad)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

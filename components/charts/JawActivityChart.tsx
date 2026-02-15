'use client'

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceArea, Tooltip } from 'recharts'
import { SensorPoint } from '@/types'
import { emgToLevel } from '@/lib/reportLogic'

const LEVEL_LABELS: Record<number, string> = { 1: 'Relaxed', 2: 'Talking', 3: 'Clenching' }

/**
 * Jaw Activity — simple 3-level step chart.
 *
 *   Level 1  Relaxed   (ADC < 165)    green band
 *   Level 2  Talking   (ADC 165–250)  amber band
 *   Level 3  Clenching (ADC > 250)    red band
 *
 * Solid bright cyan line + light fill so it's always visible
 * regardless of which zone the data sits in.
 */
export default function JawActivityChart({ data }: { data: SensorPoint[] }) {
  if (!data.length) {
    return <div className="h-44 flex items-center justify-center text-sm text-slate-500">Awaiting data…</div>
  }

  const pts = data.map(d => ({
    t: +(d.t / 1000).toFixed(1),
    level: emgToLevel(d.emg),
  }))

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pts} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>

          {/* Colored zone backgrounds */}
          <ReferenceArea y1={0.5} y2={1.5} fill="#22c55e" fillOpacity={0.08} />
          <ReferenceArea y1={1.5} y2={2.5} fill="#eab308" fillOpacity={0.08} />
          <ReferenceArea y1={2.5} y2={3.5} fill="#ef4444" fillOpacity={0.08} />

          <XAxis
            type="number"
            dataKey="t"
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            domain={['dataMin', 'dataMax']}
            tickFormatter={v => `${v}s`}
          />

          <YAxis
            domain={[0.5, 3.5]}
            ticks={[1, 2, 3]}
            tickFormatter={v => LEVEL_LABELS[v] ?? ''}
            tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
            width={64}
          />

          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }}
            labelFormatter={v => `t = ${v}s`}
            formatter={(value: number) => [LEVEL_LABELS[value] ?? '?', 'Jaw']}
          />

          <Area
            type="stepAfter"
            dataKey="level"
            stroke="#22d3ee"
            strokeWidth={2.5}
            fill="#22d3ee"
            fillOpacity={0.1}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

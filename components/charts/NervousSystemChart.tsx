'use client'

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceArea, ReferenceDot, Tooltip, Label } from 'recharts'
import { SensorPoint } from '@/types'
import { ArousalOnlyEvent, hrToActivation } from '@/lib/reportLogic'

function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/**
 * Nervous System Activation chart — shows % HR deviation from sleeping baseline.
 *
 * Transforms raw BPM into meaningful percentage activation.
 * A flowing wave that reveals autonomic arousal patterns across the session.
 *
 * Bands:  0–5% Deep Rest · 5–12% Light Arousal · 12–20% Stress Response · 20%+ High Alert
 */
export default function NervousSystemChart({
  data,
  arousalOnlyEvents,
  hideXAxis,
}: {
  data: SensorPoint[]
  arousalOnlyEvents: ArousalOnlyEvent[]
  hideXAxis?: boolean
}) {
  if (!data.length) {
    return <div className="h-44 flex items-center justify-center text-sm text-slate-500">Awaiting data…</div>
  }

  const hrValues = data.map(d => d.hr)
  const hrBaseline = median(hrValues)

  const pts = data.map(d => ({
    t: +(d.t / 1000).toFixed(1),
    activation: +hrToActivation(d.hr, hrBaseline).toFixed(2),
  }))

  const maxAct = Math.max(25, ...pts.map(p => p.activation))
  const yMax = Math.ceil(maxAct / 5) * 5

  // Arousal-only event markers at their peak activation
  const arousalMarkers = arousalOnlyEvents.map(ev => ({
    t: +((ev.startMs + ev.endMs) / 2000).toFixed(1),
    activation: +ev.peakActivation.toFixed(2),
  }))

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pts} margin={{ top: 12, right: 52, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="nsGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.05} />
              <stop offset="30%" stopColor="#818cf8" stopOpacity={0.15} />
              <stop offset="60%" stopColor="#c084fc" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#f472b6" stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="nsLine" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="50%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#f472b6" />
            </linearGradient>
          </defs>

          {/* Activation band backgrounds */}
          <ReferenceArea y1={0} y2={5} fill="#6366f1" fillOpacity={0.03} />
          <ReferenceArea y1={5} y2={12} fill="#818cf8" fillOpacity={0.04} />
          <ReferenceArea y1={12} y2={20} fill="#c084fc" fillOpacity={0.05} />
          {yMax > 20 && <ReferenceArea y1={20} y2={yMax} fill="#f472b6" fillOpacity={0.06} />}

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
            domain={[0, yMax]}
            ticks={[2.5, 8.5, 16, ...(yMax > 22 ? [22] : [])]}
            tickFormatter={v => {
              if (v <= 5) return 'Rest'
              if (v <= 12) return 'Arousal'
              if (v <= 20) return 'Stress'
              return 'Alert'
            }}
            tick={{ fontSize: 8, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            width={42}
          />

          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }}
            labelFormatter={v => `t = ${v}s`}
            formatter={(value: number) => [`+${value.toFixed(1)}%`, 'Activation']}
          />

          <Area
            type="monotone"
            dataKey="activation"
            stroke="url(#nsLine)"
            strokeWidth={1.5}
            fill="url(#nsGrad)"
            dot={false}
            isAnimationActive={false}
          />

          {/* Arousal-only event markers */}
          {arousalMarkers.map((m, i) => (
            <ReferenceDot
              key={i}
              x={m.t}
              y={m.activation}
              r={3}
              fill="#fbbf24"
              stroke="none"
            >
              <Label
                value="Arousal Only"
                position="top"
                fill="#fbbf24"
                fontSize={8}
                fontWeight={600}
                offset={6}
              />
            </ReferenceDot>
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

'use client'

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceArea, ReferenceDot, Tooltip, Label } from 'recharts'
import { SensorPoint } from '@/types'
import { ClassifiedClenchEvent, emgToJPI } from '@/lib/reportLogic'

/**
 * Jaw Pressure Index chart — seismograph-style visualization.
 *
 * Transforms raw EMG into a 0–10 intensity score.
 * Gradient fills peaks green → yellow → red based on severity.
 * Each peak gets a label: "12s · Moderate" or "23s · Severe".
 *
 * Bands:  0–2 Relaxed · 2–4 Tense · 4–7 Clenching · 7–10 Grinding
 */
export default function JawPressureChart({
  data,
  events,
}: {
  data: SensorPoint[]
  events: ClassifiedClenchEvent[]
}) {
  if (!data.length) {
    return <div className="h-44 flex items-center justify-center text-sm text-slate-500">Awaiting data…</div>
  }

  const pts = data.map(d => ({
    t: +(d.t / 1000).toFixed(1),
    jpi: +emgToJPI(d.emg).toFixed(2),
  }))

  // Peak markers — positioned at the midpoint of each clench event
  const peaks = events.map(ev => ({
    t: +((ev.startMs + ev.endMs) / 2000).toFixed(1),
    jpi: +ev.peakJPI.toFixed(2),
    label: `${ev.durationSec.toFixed(0)}s · ${ev.severityLabel}`,
    type: ev.type,
  }))

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pts} margin={{ top: 18, right: 52, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="jpiGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.1} />
              <stop offset="30%" stopColor="#eab308" stopOpacity={0.2} />
              <stop offset="60%" stopColor="#f97316" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.5} />
            </linearGradient>
            <linearGradient id="jpiLine" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="40%" stopColor="#eab308" />
              <stop offset="70%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>

          {/* Severity band backgrounds */}
          <ReferenceArea y1={0} y2={2} fill="#22c55e" fillOpacity={0.03} />
          <ReferenceArea y1={2} y2={4} fill="#eab308" fillOpacity={0.04} />
          <ReferenceArea y1={4} y2={7} fill="#f97316" fillOpacity={0.04} />
          <ReferenceArea y1={7} y2={10} fill="#ef4444" fillOpacity={0.05} />

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
            domain={[0, 10]}
            ticks={[1, 3, 5.5, 8.5]}
            tickFormatter={v => {
              if (v <= 2) return 'Relaxed'
              if (v <= 4) return 'Tense'
              if (v <= 7) return 'Clench'
              return 'Grind'
            }}
            tick={{ fontSize: 8, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            width={42}
          />

          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }}
            labelFormatter={v => `t = ${v}s`}
            formatter={(value: number) => [value.toFixed(1) + ' / 10', 'Jaw Pressure']}
          />

          <Area
            type="monotone"
            dataKey="jpi"
            stroke="url(#jpiLine)"
            strokeWidth={1.5}
            fill="url(#jpiGrad)"
            dot={false}
            isAnimationActive={false}
          />

          {/* Spike labels at each event peak */}
          {peaks.map((p, i) => (
            <ReferenceDot
              key={i}
              x={p.t}
              y={p.jpi}
              r={3}
              fill={p.type === 'arousal-linked' ? '#f87171' : '#fbbf24'}
              stroke="none"
            >
              <Label
                value={p.label}
                position="top"
                fill={p.type === 'arousal-linked' ? '#fca5a5' : '#fcd34d'}
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

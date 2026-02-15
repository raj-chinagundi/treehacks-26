'use client'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'
import { SensorPoint } from '@/types'
import { ClassifiedClenchEvent } from '@/lib/reportLogic'

const EMG_THRESHOLD = 0.5

/**
 * Shows clenching events classified as non-stress (no HR elevation within ±15s).
 * These represent habitual/primary bruxism — clenching without cardiac stress response.
 */
export default function NonStressClenchChart({
  data,
  events,
}: {
  data: SensorPoint[]
  events: ClassifiedClenchEvent[]
}) {
  if (!data.length) {
    return (
      <div className="h-44 flex items-center justify-center text-sm text-slate-500">
        Awaiting data…
      </div>
    )
  }

  const nonStressRanges = events.filter(e => !e.stressCorrelated)

  const pts = data.map(d => {
    const inNonStressEvent = nonStressRanges.some(ev => d.t >= ev.startMs && d.t <= ev.endMs)
    return {
      t: +(d.t / 1000).toFixed(1),
      emg: d.emg,
      nonStress: inNonStressEvent ? d.emg : 0,
    }
  })

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pts} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" tickFormatter={v => `${v}s`} />
          <YAxis domain={[0, 3]} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }}
            labelFormatter={v => `t = ${v}s`}
            formatter={(value: number, name: string) => [value.toFixed(3), name === 'nonStress' ? 'Non-Stress Clench' : 'EMG']}
          />
          <ReferenceLine y={EMG_THRESHOLD} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} label={{ value: 'threshold', fill: '#ef4444', fontSize: 9, position: 'right' }} />
          <Area type="monotone" dataKey="emg" stroke="#334155" strokeWidth={1} fill="none" dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="nonStress" stroke="#f59e0b" strokeWidth={2} fill="#f59e0b" fillOpacity={0.25} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

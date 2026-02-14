'use client'
import { useState } from 'react'
import { ReportRecord } from '@/types'

type Status = 'idle' | 'recording' | 'analyzing' | 'report_ready'

interface Props {
  report: ReportRecord | null
  bullets: string[]
  status: Status
}

export default function ReportBox({ report, bullets, status }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (status === 'analyzing') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Report</h3>
        <div className="flex flex-col items-center gap-2 py-4">
          <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-gray-400">Analyzing session data…</span>
        </div>
      </div>
    )
  }

  if (!report || !bullets.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Report</h3>
        <p className="text-xs text-gray-400 text-center py-4">Complete a session to see your report</p>
      </div>
    )
  }

  const scoreColor =
    report.sleepQualityScore >= 75 ? 'bg-emerald-100 text-emerald-700' :
    report.sleepQualityScore >= 50 ? 'bg-amber-100 text-amber-700' :
                                     'bg-rose-100 text-rose-700'

  const main  = bullets.slice(0, 4)
  const extra = bullets.slice(4)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Report</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scoreColor}`}>
          {report.sleepQualityScore}/100
        </span>
      </div>

      <ul className="space-y-1.5">
        {main.map((b, i) => (
          <li key={i} className="text-xs text-gray-700 flex gap-2">
            <span className="text-sky-500 flex-shrink-0">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {expanded && extra.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {extra.map((b, i) => (
            <li key={i} className="text-xs text-gray-700 flex gap-2">
              <span className="text-sky-500 flex-shrink-0">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {extra.length > 0 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-3 text-xs text-sky-600 hover:text-sky-800 font-medium">
          {expanded ? '▲ Less info' : '▼ More info'}
        </button>
      )}
    </div>
  )
}

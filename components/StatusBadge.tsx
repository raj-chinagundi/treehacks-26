type Status = 'disconnected' | 'connected' | 'report_ready'

const CFG: Record<Status, { label: string; ring: string; dot: string }> = {
  disconnected:  { label: 'Disconnected', ring: 'bg-slate-800 text-slate-400',         dot: 'bg-slate-500' },
  connected:     { label: 'Live',         ring: 'bg-emerald-500/10 text-emerald-400',  dot: 'bg-emerald-400 animate-pulse' },
  report_ready:  { label: 'Report Saved', ring: 'bg-violet-500/10 text-violet-400',    dot: 'bg-violet-400' },
}

export default function StatusBadge({ status }: { status: Status }) {
  const c = CFG[status]
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${c.ring}`}>
      <div className={`w-2 h-2 rounded-full ${c.dot}`} />
      {c.label}
    </div>
  )
}

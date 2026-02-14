type Status = 'idle' | 'recording' | 'analyzing' | 'report_ready'

const CFG: Record<Status, { label: string; ring: string; dot: string }> = {
  idle:         { label: 'Idle',         ring: 'bg-gray-100 text-gray-500',      dot: 'bg-gray-400' },
  recording:    { label: 'Recording',    ring: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500 animate-pulse' },
  analyzing:    { label: 'Analyzing',    ring: 'bg-sky-100 text-sky-700',         dot: 'bg-sky-500 animate-pulse' },
  report_ready: { label: 'Report Ready', ring: 'bg-violet-100 text-violet-700',   dot: 'bg-violet-500' },
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

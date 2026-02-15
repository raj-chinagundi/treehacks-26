'use client'

import { useState, useEffect, useRef } from 'react'
import { signOut } from 'next-auth/react'
import { SensorPoint, ReportRecord, SessionRecord } from '@/types'
import { generateBullets, computeLiveStats, LiveStats, classifyEvents, ClassifiedClenchEvent, emgToCategory } from '@/lib/reportLogic'
import HeartRateChart    from './charts/HeartRateChart'
import JawActivityChart  from './charts/JawActivityChart'
import ReportBox  from './ReportBox'
import ChatBot    from './ChatBot'
import StatusBadge from './StatusBadge'

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_UPDATE   = 200  // ms between chart state updates
const ANALYSIS_HZ    = 1000 // ms between live analysis recompute
const DISPLAY_WINDOW = 200  // points shown in charts (20 s)

const FLASK_SSE_URL  = 'http://localhost:5001/stream'

// ─── Types ─────────────────────────────────────────────────────────────────

type AppStatus = 'disconnected' | 'connected' | 'report_ready'

interface User { id: string; name: string; email: string; image?: string }

const EMPTY_STATS: LiveStats = {
  clenchCount: 0, stressLikelihood: 0, sleepQualityScore: 100,
  avgHR: 0, peakEMG: 0, avgTemp: 0, isClenching: false,
}

// ─── Category helpers ─────────────────────────────────────────────────────

const CATEGORY_STYLES = {
  relaxed:   { label: 'Relaxed',    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', dot: 'bg-emerald-400' },
  talking:   { label: 'Talking',    color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   dot: 'bg-amber-400' },
  clenching: { label: 'CLENCHING',  color: 'text-rose-400',    bg: 'bg-rose-500/15',     border: 'border-rose-500/30',    dot: 'bg-rose-400 animate-pulse' },
} as const

// ─── Component ───────────────────────────────────────────────────────────────

export default function Dashboard({ user }: { user: User }) {
  const [appStatus,      setAppStatus]      = useState<AppStatus>('disconnected')
  const [sessionId,      setSessionId]      = useState<string | null>(null)
  const [elapsedSec,     setElapsedSec]     = useState(0)
  const [chartData,      setChartData]      = useState<SensorPoint[]>([])
  const [liveStats,      setLiveStats]      = useState<LiveStats>(EMPTY_STATS)
  const [report,         setReport]         = useState<ReportRecord | null>(null)
  const [pastSessions,   setPastSessions]   = useState<SessionRecord[]>([])
  const [selectedPast,   setSelectedPast]   = useState('')
  const [chatOpen,       setChatOpen]       = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [clenchFlash,    setClenchFlash]    = useState(false)
  const [deviceConnected, setDeviceConnected] = useState(false)
  const [clenchEvents,   setClenchEvents]   = useState<ClassifiedClenchEvent[]>([])

  const rawBuf        = useRef<SensorPoint[]>([])
  const startTime     = useRef(0)
  const chartTimer    = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickTimer     = useRef<ReturnType<typeof setInterval> | null>(null)
  const analysisTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevClenching = useRef(false)

  // SSE connection to Flask data hub
  const sseSource     = useRef<EventSource | null>(null)

  // ── Load past sessions on mount ──────────────────────────────────────────

  useEffect(() => { loadPastSessions() }, [])

  async function loadPastSessions() {
    try {
      const res = await fetch('/api/sessions')
      if (!res.ok) return
      const data: SessionRecord[] = await res.json()
      setPastSessions(data.filter(s => s.status === 'report_ready').reverse())
    } catch { /* silent */ }
  }

  // ── Connect device ─────────────────────────────────────────────────────

  async function handleConnect() {
    const res = await fetch('/api/sessions', { method: 'POST' })
    if (!res.ok) return
    const session: SessionRecord = await res.json()
    setSessionId(session.id)

    rawBuf.current    = []
    startTime.current = Date.now()

    setElapsedSec(0)
    setChartData([])
    setLiveStats(EMPTY_STATS)
    setReport(null)
    setDeviceConnected(false)
    setAppStatus('connected')

    // Reset Flask session timer so SSE timestamps align with our session
    try {
      await fetch('http://localhost:5001/reset', { method: 'POST' })
    } catch { /* Flask may not be running yet */ }

    // ── Connect to Flask SSE for real-time HR + EMG data ──
    try {
      const sse = new EventSource(FLASK_SSE_URL)
      sseSource.current = sse

      sse.onmessage = (event) => {
        try {
          const d = JSON.parse(event.data)
          const bpm = d.bpm ?? 0
          const emg = d.emg ?? 0

          // Only record data when at least one sensor is active
          if (bpm > 0 || emg > 0) {
            const t = Date.now() - startTime.current
            rawBuf.current.push({ t, hr: bpm, emg, temp: 36.5 })
            setDeviceConnected(true)
          }
        } catch { /* ignore parse errors */ }
      }

      sse.onerror = () => {
        setDeviceConnected(false)
      }
    } catch {
      console.warn('Flask SSE not available — start test.py (data hub)')
    }

    // 5 Hz chart refresh
    chartTimer.current = setInterval(() => {
      const buf = rawBuf.current
      setChartData([...buf.slice(-DISPLAY_WINDOW)])
    }, CHART_UPDATE)

    // 1 Hz timer display
    tickTimer.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTime.current) / 1000))
    }, 1000)

    // 1 Hz live analysis
    analysisTimer.current = setInterval(() => {
      const buf = rawBuf.current
      if (!buf.length) return
      const { clenchEvents: evts } = classifyEvents(buf)
      setClenchEvents(evts)
      const stats = computeLiveStats(buf, evts)
      setLiveStats(stats)

      if (stats.isClenching && !prevClenching.current) {
        setClenchFlash(true)
        setTimeout(() => setClenchFlash(false), 2000)
      }
      prevClenching.current = stats.isClenching
    }, ANALYSIS_HZ)
  }

  // ── Disconnect device ──────────────────────────────────────────────────

  function handleDisconnect() {
    clearInterval(chartTimer.current!)
    clearInterval(tickTimer.current!)
    clearInterval(analysisTimer.current!)

    // Close SSE connection
    if (sseSource.current) {
      sseSource.current.close()
      sseSource.current = null
    }
    setDeviceConnected(false)

    if (rawBuf.current.length) {
      const { clenchEvents: evts } = classifyEvents(rawBuf.current)
      setClenchEvents(evts)
      setLiveStats(computeLiveStats(rawBuf.current, evts))
    }
    setAppStatus('disconnected')
  }

  // ── Save Report (snapshot current live data) ───────────────────────────

  async function handleSaveReport() {
    if (!sessionId || !rawBuf.current.length) return
    setSaving(true)

    const durationSec = Math.floor((Date.now() - startTime.current) / 1000)
    const snapshot = [...rawBuf.current]

    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        dataPoints: snapshot,
        durationSeconds: durationSec,
      }),
    })

    if (res.ok) {
      const generated: ReportRecord = await res.json()
      setReport(generated)
      setAppStatus(prev => prev === 'connected' ? 'connected' : 'report_ready')
      loadPastSessions()
    }
    setSaving(false)
  }

  // ── Load a past session's report + chart data ────────────────────────

  async function handlePastSelect(id: string) {
    if (!id) return
    setSelectedPast(id)

    if (appStatus === 'connected') handleDisconnect()

    try {
      const [rRes, sRes] = await Promise.all([
        fetch(`/api/reports?sessionId=${id}`),
        fetch(`/api/sessions/${id}`),
      ])
      if (rRes.ok) setReport(await rRes.json())
      if (sRes.ok) {
        const s: SessionRecord = await sRes.json()
        if (s.dataPoints) {
          setChartData(s.dataPoints)
          const { clenchEvents: evts } = classifyEvents(s.dataPoints)
          setClenchEvents(evts)
          setLiveStats(computeLiveStats(s.dataPoints, evts))
        }
      }
      setAppStatus('report_ready')
    } catch { /* silent */ }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  const fmtTimer = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const bullets = report ? generateBullets(report) : []
  const sideData = chartData.slice(-DISPLAY_WINDOW)

  const latestHR  = sideData.length ? sideData[sideData.length - 1].hr : 0
  const latestEMG = sideData.length ? sideData[sideData.length - 1].emg : 0
  const isConnected = appStatus === 'connected'

  // Current jaw activity category
  const currentCategory = latestEMG > 0 ? emgToCategory(latestEMG) : 'relaxed'
  const catStyle = CATEGORY_STYLES[currentCategory]

  const chatSessionStatus = appStatus === 'connected' ? 'recording' as const
    : report ? 'report_ready' as const
    : 'idle' as const

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex flex-col">

      {/* ── Top Bar ──────────────────────────────────────────────────── */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 py-3 flex items-center justify-between flex-shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <svg width="16" height="16" viewBox="0 0 44 44" fill="none">
              <path d="M10 22C10 22 13 15 22 15s12 7 12 7-3 7-12 7-12-7-12-7z" fill="white"/>
              <circle cx="22" cy="22" r="3.5" fill="#0a0e1a"/>
            </svg>
          </div>
          <span className="font-semibold text-white text-sm tracking-tight">JawSense</span>
          {/* Device connection indicator */}
          {isConnected && (
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
              deviceConnected
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${deviceConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {deviceConnected ? 'Sensors Live' : 'Waiting for sensors…'}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {pastSessions.length > 0 && (
            <select
              value={selectedPast}
              onChange={e => handlePastSelect(e.target.value)}
              className="text-xs border border-slate-700 rounded-lg px-3 py-1.5 bg-slate-800 text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer"
            >
              <option value="">Past Sessions</option>
              {pastSessions.map(s => (
                <option key={s.id} value={s.id}>
                  {new Date(s.startTime).toLocaleDateString()}{' '}
                  {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2">
            {user.image && (
              <img src={user.image} alt="" className="w-6 h-6 rounded-full" />
            )}
            <span className="text-xs text-slate-400 hidden sm:inline">{user.name}</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 p-4 lg:p-6 space-y-4 lg:space-y-6 max-w-[1400px] mx-auto w-full">

        {/* ── Connection Bar ──────────────────────────────────────────── */}
        <div className="bg-slate-900/60 backdrop-blur rounded-2xl border border-slate-800 p-4 lg:p-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

            <div className="flex items-center gap-5">
              <div className="font-mono text-4xl lg:text-5xl font-light text-white tracking-widest tabular-nums">
                {fmtTimer(elapsedSec)}
              </div>
              <StatusBadge status={appStatus} />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={isConnected ? handleDisconnect : handleConnect}
                className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg ${
                  isConnected
                    ? 'bg-rose-500 text-white hover:bg-rose-400 shadow-rose-500/20'
                    : 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-emerald-500/20'
                }`}
              >
                <span className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      Disconnect
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                      </svg>
                      Connect Device
                    </>
                  )}
                </span>
              </button>

              <button
                onClick={handleSaveReport}
                disabled={!sessionId || !rawBuf.current.length || saving}
                className="px-5 py-2.5 bg-cyan-600 text-white rounded-xl font-semibold text-sm hover:bg-cyan-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/20 border border-cyan-500/30"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 3H15L17 5V17H3V3H5Z" />
                    <path d="M7 3V7H13V3" />
                    <path d="M7 13H13" />
                    <path d="M7 16H13" />
                  </svg>
                  {saving ? 'Saving…' : 'Save Report'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Live Analysis Panel ─────────────────────────────────────── */}
        <div className={`bg-slate-900/60 backdrop-blur rounded-2xl border p-4 lg:p-5 transition-colors duration-300 ${
          clenchFlash ? 'border-rose-500/60 shadow-lg shadow-rose-500/10' : 'border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Live Analysis</h2>
            {/* Current jaw activity category badge */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-300 ${catStyle.bg} ${catStyle.color} border ${catStyle.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${catStyle.dot}`} />
              {catStyle.label}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-800/60 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Clenching Events</p>
              <p className="text-xl font-bold text-white mt-0.5 tabular-nums">{liveStats.clenchCount}</p>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Sleep Quality</p>
              <p className={`text-xl font-bold mt-0.5 tabular-nums ${
                liveStats.sleepQualityScore >= 75 ? 'text-emerald-400' : liveStats.sleepQualityScore >= 50 ? 'text-amber-400' : 'text-rose-400'
              }`}>{liveStats.sleepQualityScore}<span className="text-sm font-normal text-slate-500">/100</span></p>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Current State</p>
              <p className={`text-xl font-bold mt-0.5 ${catStyle.color}`}>{catStyle.label}</p>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Avg Heart Rate</p>
              <p className="text-xl font-bold text-orange-400 mt-0.5 tabular-nums">{liveStats.avgHR || '—'} <span className="text-xs font-normal text-slate-500">bpm</span></p>
            </div>
          </div>
        </div>

        {/* ── Live Stats Cards (HR + EMG + Duration + Points) ─────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <div className="bg-slate-900/60 backdrop-blur rounded-2xl border border-slate-800 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Heart Rate</p>
              {isConnected && deviceConnected && (
                <span className="text-[9px] text-emerald-400 font-medium uppercase">Live</span>
              )}
            </div>
            <p className="text-2xl font-bold text-orange-400 mt-1 tabular-nums">{latestHR ? `${latestHR.toFixed(0)}` : '—'} <span className="text-sm font-normal text-slate-500">bpm</span></p>
          </div>
          <div className="bg-slate-900/60 backdrop-blur rounded-2xl border border-slate-800 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Jaw Activity</p>
            <p className={`text-2xl font-bold mt-1 ${catStyle.color}`}>{catStyle.label}</p>
          </div>
          <div className="bg-slate-900/60 backdrop-blur rounded-2xl border border-slate-800 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Duration</p>
            <p className="text-2xl font-bold text-white mt-1 tabular-nums">{fmtTimer(elapsedSec)}</p>
          </div>
          <div className="bg-slate-900/60 backdrop-blur rounded-2xl border border-slate-800 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Data Points</p>
            <p className="text-2xl font-bold text-violet-400 mt-1 tabular-nums">{chartData.length.toLocaleString()}</p>
          </div>
        </div>

        {/* ── Charts: Heart Rate + Jaw Activity (same time axis) ────── */}
        <div className="bg-slate-900/60 backdrop-blur rounded-2xl border border-slate-800 p-5">

          {/* Top: Heart Rate */}
          <div className="mb-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                Heart Rate
              </p>
              {latestHR > 0 && (
                <span className="text-[10px] text-orange-300 font-mono tabular-nums">{latestHR.toFixed(0)} bpm</span>
              )}
            </div>
            <HeartRateChart data={sideData} hideXAxis />
          </div>

          {/* Alignment divider */}
          <div className="flex items-center gap-2 my-1.5">
            <div className="flex-1 h-px bg-slate-700/50" />
            <span className="text-[9px] text-slate-600 uppercase tracking-widest">time aligned</span>
            <div className="flex-1 h-px bg-slate-700/50" />
          </div>

          {/* Bottom: Jaw Activity */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                Jaw Activity
              </p>
              {liveStats.clenchCount > 0 && (
                <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                  {liveStats.clenchCount} clenching events
                </span>
              )}
            </div>
            <JawActivityChart data={sideData} />
          </div>

          {/* Category legend */}
          <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Relaxed</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> Talking</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400" /> Clenching</span>
          </div>
        </div>

        {/* ── Saved Report Section ─────────────────────────────────────── */}
        <ReportBox report={report} bullets={bullets} status={appStatus} />

      </main>

      {/* ── Floating Chatbot ───────────────────────────────────────────── */}
      {chatOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-[380px] h-[520px] bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl shadow-black/40 flex flex-col overflow-hidden animate-in">
          <ChatBot
            liveStats={liveStats}
            getRawData={() => rawBuf.current}
            report={report}
            sessionStatus={chatSessionStatus}
            onClose={() => setChatOpen(false)}
          />
        </div>
      )}

      {/* ── Chat Toggle Button ─────────────────────────────────────────── */}
      <button
        onClick={() => setChatOpen(o => !o)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all ${
          chatOpen
            ? 'bg-slate-700 hover:bg-slate-600 shadow-black/30'
            : 'bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 shadow-cyan-500/30'
        }`}
        aria-label={chatOpen ? 'Close chat' : 'Open chat'}
      >
        {chatOpen ? (
          <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </div>
  )
}

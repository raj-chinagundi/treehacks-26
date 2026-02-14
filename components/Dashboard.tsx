'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import { SensorPoint, ReportRecord, SessionRecord } from '@/types'
import { createSensorState, generatePoint, SensorState } from '@/lib/mockSensor'
import { generateBullets } from '@/lib/reportLogic'
import EMGChart   from './charts/EMGChart'
import HRChart    from './charts/HRChart'
import MainChart  from './charts/MainChart'
import ReportBox  from './ReportBox'
import ChatBot    from './ChatBot'
import StatusBadge from './StatusBadge'

// ─── Constants ────────────────────────────────────────────────────────────────

const SENSOR_HZ      = 100  // ms per tick = 10 Hz
const CHART_UPDATE   = 200  // ms between chart state updates
const DISPLAY_WINDOW = 200  // number of points shown in small charts (20 s)
const MAIN_WINDOW    = 400  // number of points shown in main chart  (40 s)

// ─── Types ─────────────────────────────────────────────────────────────────

type AppStatus = 'idle' | 'recording' | 'analyzing' | 'report_ready'

interface User { id: string; name: string; email: string; image?: string }

// ─── Component ───────────────────────────────────────────────────────────────

export default function Dashboard({ user }: { user: User }) {
  const [appStatus,      setAppStatus]      = useState<AppStatus>('idle')
  const [sessionId,      setSessionId]      = useState<string | null>(null)
  const [elapsedSec,     setElapsedSec]     = useState(0)
  const [chartData,      setChartData]      = useState<SensorPoint[]>([])
  const [report,         setReport]         = useState<ReportRecord | null>(null)
  const [pastSessions,   setPastSessions]   = useState<SessionRecord[]>([])
  const [selectedPast,   setSelectedPast]   = useState('')

  // Raw sensor data buffer (never triggers re-renders)
  const rawBuf        = useRef<SensorPoint[]>([])
  const sensorState   = useRef<SensorState | null>(null)
  const startTime     = useRef(0)
  const sensorTimer   = useRef<ReturnType<typeof setInterval> | null>(null)
  const chartTimer    = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickTimer     = useRef<ReturnType<typeof setInterval> | null>(null)
  const appStatusRef  = useRef<AppStatus>('idle')

  useEffect(() => { appStatusRef.current = appStatus }, [appStatus])

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

  // ── Session start ────────────────────────────────────────────────────────

  async function handleStart() {
    const res = await fetch('/api/sessions', { method: 'POST' })
    if (!res.ok) return
    const session: SessionRecord = await res.json()
    setSessionId(session.id)

    // Seed: use ?seed= param for demos, or fresh random
    const urlSeed = new URLSearchParams(window.location.search).get('seed')
    const seed = urlSeed ? parseInt(urlSeed, 10) : Math.floor(Math.random() * 99999)
    sensorState.current = createSensorState(seed)
    rawBuf.current      = []
    startTime.current   = Date.now()

    setElapsedSec(0)
    setChartData([])
    setReport(null)
    setAppStatus('recording')

    // 10 Hz sensor tick
    sensorTimer.current = setInterval(() => {
      const elapsed = Date.now() - startTime.current
      const pt = generatePoint(sensorState.current!, elapsed)
      rawBuf.current.push(pt)
    }, SENSOR_HZ)

    // 5 Hz chart refresh
    chartTimer.current = setInterval(() => {
      const buf = rawBuf.current
      setChartData([...buf.slice(-Math.max(DISPLAY_WINDOW, MAIN_WINDOW))])
    }, CHART_UPDATE)

    // 1 Hz timer display
    tickTimer.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTime.current) / 1000))
    }, 1000)
  }

  // ── Session stop ─────────────────────────────────────────────────────────

  async function handleStop() {
    clearInterval(sensorTimer.current!)
    clearInterval(chartTimer.current!)
    clearInterval(tickTimer.current!)

    const durationSec = Math.floor((Date.now() - startTime.current) / 1000)
    const snapshot    = [...rawBuf.current]

    setChartData(snapshot)
    setAppStatus('analyzing')

    // 1.5 s simulated analysis delay (mirrors original NightGuard UX)
    await new Promise(r => setTimeout(r, 1500))

    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        dataPoints: snapshot.slice(-2000),
        durationSeconds: durationSec,
      }),
    })

    if (!res.ok) { setAppStatus('idle'); return }

    const generated: ReportRecord = await res.json()
    setReport(generated)
    setAppStatus('report_ready')
    loadPastSessions()
  }

  // ── Load a past session's report + chart data ────────────────────────────

  async function handlePastSelect(id: string) {
    if (!id) return
    setSelectedPast(id)
    try {
      const [rRes, sRes] = await Promise.all([
        fetch(`/api/reports?sessionId=${id}`),
        fetch(`/api/sessions/${id}`),
      ])
      if (rRes.ok) setReport(await rRes.json())
      if (sRes.ok) {
        const s: SessionRecord = await sRes.json()
        if (s.dataPoints) setChartData(s.dataPoints)
      }
      setAppStatus('report_ready')
    } catch { /* silent */ }
  }

  // ── Booking created callback ─────────────────────────────────────────────

  async function handleBookingCreated(data: {
    providerName: string
    providerType: string
    appointmentTime: string
    address: string
    reportId: string
  }) {
    try {
      await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId:        data.reportId,
          providerName:    data.providerName,
          providerType:    data.providerType || 'dentist',
          appointmentTime: data.appointmentTime,
          address:         data.address,
          city:            '',
        }),
      })
    } catch { /* silent */ }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  const fmtTimer = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const bullets = report ? generateBullets(report) : []

  const sideData = chartData.slice(-DISPLAY_WINDOW)
  const mainData = chartData.slice(-MAIN_WINDOW)

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Top Bar ────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-5 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-600 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 44 44" fill="none">
              <path d="M10 22C10 22 13 15 22 15s12 7 12 7-3 7-12 7-12-7-12-7z" fill="white"/>
              <circle cx="22" cy="22" r="3.5" fill="#0ea5e9"/>
            </svg>
          </div>
          <span className="font-semibold text-gray-900 text-sm">JawSense</span>
        </div>

        <div className="flex items-center gap-3">
          {pastSessions.length > 0 && (
            <select
              value={selectedPast}
              onChange={e => handlePastSelect(e.target.value)}
              disabled={appStatus === 'recording'}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
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
          <span className="text-xs text-gray-500 hidden sm:inline">{user.name}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── 3-column grid ──────────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 p-3 grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] gap-3">

        {/* ── LEFT column ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">

          {/* Start button */}
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <button
              onClick={handleStart}
              disabled={appStatus === 'recording' || appStatus === 'analyzing'}
              className="w-full py-2.5 bg-emerald-500 text-white rounded-lg font-semibold text-sm hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ▶&ensp;Start Session
            </button>
          </div>

          {/* EMG chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              EMG Signal
              <span className="ml-1 text-gray-300 font-normal">(threshold ···)</span>
            </p>
            <EMGChart data={sideData} />
          </div>

          {/* HR chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Heart Rate</p>
            <HRChart data={sideData} />
          </div>

          {/* Report box */}
          <ReportBox report={report} bullets={bullets} status={appStatus} />
        </div>

        {/* ── CENTER column ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">

          {/* Timer + status */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center gap-3">
            <div className="font-mono text-5xl font-light text-gray-800 tracking-widest tabular-nums">
              {fmtTimer(elapsedSec)}
            </div>
            <StatusBadge status={appStatus} />
          </div>

          {/* Main chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Live Sensor Overview
            </p>
            <MainChart data={mainData} />
          </div>

          {/* Stop button */}
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <button
              onClick={handleStop}
              disabled={appStatus !== 'recording'}
              className="w-full py-2.5 bg-rose-500 text-white rounded-lg font-semibold text-sm hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ■&ensp;Stop &amp; Analyze
            </button>
          </div>
        </div>

        {/* ── RIGHT column — embedded chatbot panel ────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ minHeight: '520px' }}>
          <ChatBot
            report={report}
            sessionStatus={appStatus}
            onBookingCreated={handleBookingCreated}
          />
        </div>

      </main>
    </div>
  )
}

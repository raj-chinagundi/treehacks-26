import { SensorPoint, ReportRecord } from '@/types'
import { v4 as uuid } from 'uuid'

const EMG_THRESHOLD = 0.5
const MIN_CLENCH_MS = 400       // 400 ms minimum to count as a clench event
const HR_WINDOW_MS = 15_000     // ±15 s around each event
const HR_SPIKE_PCT = 0.06       // 6 % above baseline to count as correlated spike

interface ClenchEvent {
  startMs: number
  endMs: number
  peakEMG: number
}

function detectClenches(data: SensorPoint[]): ClenchEvent[] {
  const events: ClenchEvent[] = []
  let active = false
  let startMs = 0
  let peak = 0

  for (const p of data) {
    if (p.emg >= EMG_THRESHOLD) {
      if (!active) { active = true; startMs = p.t; peak = p.emg }
      else peak = Math.max(peak, p.emg)
    } else if (active) {
      if (p.t - startMs >= MIN_CLENCH_MS) events.push({ startMs, endMs: p.t, peakEMG: peak })
      active = false; peak = 0
    }
  }
  if (active) {
    const last = data[data.length - 1].t
    if (last - startMs >= MIN_CLENCH_MS) events.push({ startMs, endMs: last, peakEMG: peak })
  }
  return events
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function stdDev(values: number[]): number {
  if (!values.length) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
}

export function computeReport(
  sessionId: string,
  userId: string,
  data: SensorPoint[],
  durationSeconds: number
): ReportRecord {
  if (!data.length) {
    return {
      id: uuid(), sessionId, userId, duration: durationSeconds,
      clenchCount: 0, stressLikelihood: 0, sleepQualityScore: 85,
      avgHR: 65, hrVariability: 2, peakEMG: 0, avgTemp: 36.5, tempDrift: 0,
      createdAt: new Date().toISOString(),
    }
  }

  const clenches = detectClenches(data)
  const hrValues = data.map(d => d.hr)
  const hrBaseline = median(hrValues)
  const avgHR = hrValues.reduce((a, b) => a + b, 0) / hrValues.length
  const hrVariability = stdDev(hrValues)
  const peakEMG = Math.max(...data.map(d => d.emg))
  const avgTemp = data.reduce((a, b) => a + b.temp, 0) / data.length
  const tempDrift = Math.abs(data[data.length - 1].temp - data[0].temp)

  // Stress likelihood: % clenches with HR spike in ±15 s window
  let stressCount = 0
  for (const ev of clenches) {
    const window = data.filter(d => d.t >= ev.startMs - HR_WINDOW_MS && d.t <= ev.endMs + HR_WINDOW_MS)
    if (window.length && Math.max(...window.map(d => d.hr)) > hrBaseline * (1 + HR_SPIKE_PCT)) {
      stressCount++
    }
  }
  const stressLikelihood = clenches.length ? Math.round((stressCount / clenches.length) * 100) : 0

  // Sleep quality: 100 minus penalties
  const clenchPenalty = Math.min(40, clenches.length * 2)
  const hrVarPenalty = Math.min(30, hrVariability * 0.5)
  const tempPenalty = Math.min(20, tempDrift * 100)
  const sleepQualityScore = Math.max(0, Math.round(100 - clenchPenalty - hrVarPenalty - tempPenalty))

  return {
    id: uuid(), sessionId, userId, duration: durationSeconds,
    clenchCount: clenches.length, stressLikelihood, sleepQualityScore,
    avgHR: Math.round(avgHR * 10) / 10, hrVariability: Math.round(hrVariability * 10) / 10,
    peakEMG: Math.round(peakEMG * 1000) / 1000,
    avgTemp: Math.round(avgTemp * 100) / 100, tempDrift: Math.round(tempDrift * 100) / 100,
    createdAt: new Date().toISOString(),
  }
}

// ─── Live Stats (lightweight, runs every chart tick) ─────────────────────────

export interface LiveStats {
  clenchCount: number
  stressLikelihood: number
  sleepQualityScore: number
  avgHR: number
  peakEMG: number
  avgTemp: number
  isClenching: boolean
}

/**
 * Computes running analysis from the current data buffer.
 * Lightweight version of computeReport — called every ~1s while connected.
 */
export function computeLiveStats(data: SensorPoint[]): LiveStats {
  if (!data.length) {
    return { clenchCount: 0, stressLikelihood: 0, sleepQualityScore: 100, avgHR: 0, peakEMG: 0, avgTemp: 0, isClenching: false }
  }

  const clenches = detectClenchesExported(data)
  const hrValues = data.map(d => d.hr)
  const hrBaseline = median(hrValues)
  const avgHR = hrValues.reduce((a, b) => a + b, 0) / hrValues.length
  const hrVariability = stdDev(hrValues)
  const peakEMG = Math.max(...data.map(d => d.emg))
  const avgTemp = data.reduce((a, b) => a + b.temp, 0) / data.length
  const tempDrift = Math.abs(data[data.length - 1].temp - data[0].temp)

  let stressCount = 0
  for (const ev of clenches) {
    const w = data.filter(d => d.t >= ev.startMs - HR_WINDOW_MS && d.t <= ev.endMs + HR_WINDOW_MS)
    if (w.length && Math.max(...w.map(d => d.hr)) > hrBaseline * (1 + HR_SPIKE_PCT)) {
      stressCount++
    }
  }
  const stressLikelihood = clenches.length ? Math.round((stressCount / clenches.length) * 100) : 0

  const clenchPenalty = Math.min(40, clenches.length * 2)
  const hrVarPenalty = Math.min(30, hrVariability * 0.5)
  const tempPenalty = Math.min(20, tempDrift * 100)
  const sleepQualityScore = Math.max(0, Math.round(100 - clenchPenalty - hrVarPenalty - tempPenalty))

  const last = data[data.length - 1]
  const isClenching = last.emg >= EMG_THRESHOLD

  return {
    clenchCount: clenches.length,
    stressLikelihood,
    sleepQualityScore,
    avgHR: Math.round(avgHR * 10) / 10,
    peakEMG: Math.round(peakEMG * 1000) / 1000,
    avgTemp: Math.round(avgTemp * 100) / 100,
    isClenching,
  }
}

function detectClenchesExported(data: SensorPoint[]) {
  return detectClenches(data)
}

// ─── Classified clench events (for charts) ───────────────────────────────────

export interface ClassifiedClenchEvent {
  startMs: number
  endMs: number
  peakEMG: number
  stressCorrelated: boolean
}

/**
 * Detects clench events and classifies each as stress-correlated or not
 * using a ±15s HR window — same logic as the report engine.
 */
export function classifyClenchEvents(data: SensorPoint[]): ClassifiedClenchEvent[] {
  const clenches = detectClenches(data)
  if (!clenches.length || !data.length) return []

  const hrValues = data.map(d => d.hr)
  const hrBaseline = median(hrValues)

  return clenches.map(ev => {
    const w = data.filter(d => d.t >= ev.startMs - HR_WINDOW_MS && d.t <= ev.endMs + HR_WINDOW_MS)
    const hrElevated = w.length > 0 && Math.max(...w.map(d => d.hr)) > hrBaseline * (1 + HR_SPIKE_PCT)
    return { startMs: ev.startMs, endMs: ev.endMs, peakEMG: ev.peakEMG, stressCorrelated: hrElevated }
  })
}

// ─── Sensor data dump (for GPT-4o context) ───────────────────────────────────

/**
 * Builds a detailed plain-text dump of all sensor data and clench events
 * for use as GPT-4o system prompt context.
 */
export function buildSensorDataDump(data: SensorPoint[], stats: LiveStats): string {
  const events = classifyClenchEvents(data)
  const stressEvents = events.filter(e => e.stressCorrelated)
  const nonStressEvents = events.filter(e => !e.stressCorrelated)

  const durationMs = data.length ? data[data.length - 1].t - data[0].t : 0
  const durationMin = (durationMs / 60000).toFixed(1)

  const hrValues = data.map(d => d.hr)
  const hrBase = hrValues.length ? median(hrValues) : 0
  const hrVar = hrValues.length ? stdDev(hrValues) : 0

  let dump = `JAWSENSE LIVE SENSOR DATA
========================
Session Duration: ${durationMin} minutes
Total Data Points: ${data.length}
Sampling Rate: 10 Hz

OVERALL STATISTICS
──────────────────
Total Clench Events: ${stats.clenchCount}
  - Stress-Correlated: ${stressEvents.length} (HR elevated within ±15s)
  - Non-Stress: ${nonStressEvents.length} (no HR elevation)
Stress Correlation Rate: ${stats.stressLikelihood}%
Sleep Quality Score: ${stats.sleepQualityScore}/100
Average Heart Rate: ${stats.avgHR} bpm
Peak EMG Amplitude: ${stats.peakEMG.toFixed(3)} µV
Currently Clenching: ${stats.isClenching ? 'YES' : 'No'}

CARDIAC BASELINE
────────────────
Median HR: ${hrBase.toFixed(1)} bpm
HR Variability (σ): ${hrVar.toFixed(1)} bpm
HR Spike Threshold: ${(hrBase * (1 + HR_SPIKE_PCT)).toFixed(1)} bpm (baseline + 6%)

CLENCH EVENT LOG
────────────────`

  if (events.length === 0) {
    dump += '\nNo clench events detected yet.\n'
  } else {
    events.forEach((ev, i) => {
      const startSec = (ev.startMs / 1000).toFixed(1)
      const endSec = (ev.endMs / 1000).toFixed(1)
      const durSec = ((ev.endMs - ev.startMs) / 1000).toFixed(1)
      const type = ev.stressCorrelated ? 'STRESS' : 'NON-STRESS'
      const eventData = data.filter(d => d.t >= ev.startMs && d.t <= ev.endMs)
      const hrDuring = eventData.map(d => d.hr)
      const avgHrEv = hrDuring.length ? (hrDuring.reduce((a, b) => a + b, 0) / hrDuring.length).toFixed(1) : 'N/A'
      const maxHrEv = hrDuring.length ? Math.max(...hrDuring).toFixed(1) : 'N/A'
      dump += `\nEvent #${i + 1} [${type}]`
      dump += `\n  Time: ${startSec}s → ${endSec}s (duration: ${durSec}s)`
      dump += `\n  Peak EMG: ${ev.peakEMG.toFixed(3)} µV`
      dump += `\n  HR during event: avg ${avgHrEv} bpm, max ${maxHrEv} bpm`
    })
  }

  if (events.length >= 2) {
    const half = Math.floor(events.length / 2)
    const firstAvg = events.slice(0, half).reduce((a, e) => a + e.peakEMG, 0) / half
    const secondAvg = events.slice(half).reduce((a, e) => a + e.peakEMG, 0) / (events.length - half)
    const trend = secondAvg > firstAvg * 1.1 ? 'INCREASING' : secondAvg < firstAvg * 0.9 ? 'DECREASING' : 'STABLE'
    dump += `\n\nTREND ANALYSIS\n──────────────`
    dump += `\nClench Intensity Trend: ${trend}`
    dump += `\n  First half avg peak: ${firstAvg.toFixed(3)} µV`
    dump += `\n  Second half avg peak: ${secondAvg.toFixed(3)} µV`
  }

  return dump
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export function generateBullets(r: ReportRecord): string[] {
  return [
    `Session duration: ${formatDuration(r.duration)}`,
    `Clench events detected: ${r.clenchCount}`,
    `Stress-associated clenching: ${r.stressLikelihood}%`,
    `Sleep quality score: ${r.sleepQualityScore}/100`,
    `Avg heart rate: ${r.avgHR} bpm (±${r.hrVariability} bpm)`,
    `Avg temperature: ${r.avgTemp}°C (drift: ${r.tempDrift}°C)`,
    `Peak EMG amplitude: ${r.peakEMG.toFixed(3)} µV`,
  ]
}

/** Plain-text report fed into DentalAgent's Gemini system prompt */
export function reportToPlainText(r: ReportRecord): string {
  const severity =
    r.sleepQualityScore < 40 ? 'Severe' :
    r.sleepQualityScore < 60 ? 'Moderate' :
    r.sleepQualityScore < 80 ? 'Mild' : 'Minimal'

  return `JAWSENSE SESSION REPORT
========================
Duration: ${formatDuration(r.duration)}
Date: ${new Date(r.createdAt).toLocaleDateString()}

CLENCHING ANALYSIS
Severity: ${severity}
Total Clench Events: ${r.clenchCount}
Stress-Associated Clenching: ${r.stressLikelihood}%
Peak EMG Amplitude: ${r.peakEMG.toFixed(2)} µV

SLEEP QUALITY
Sleep Quality Score: ${r.sleepQualityScore}/100

CARDIAC DATA
Average Heart Rate: ${r.avgHR} bpm
HR Variability (±): ${r.hrVariability} bpm

TEMPERATURE
Average: ${r.avgTemp}°C  |  Session Drift: ${r.tempDrift}°C

CLINICAL NOTES
${r.clenchCount > 8 ? '- High clench frequency — bruxism treatment likely warranted' :
  r.clenchCount > 4 ? '- Moderate clenching activity detected' :
  '- Low clench frequency noted'}
${r.stressLikelihood > 50 ? '- Strong stress-cardiac correlation — stress-induced bruxism likely' : ''}
${r.sleepQualityScore < 60 ? '- Poor sleep quality score — specialist consultation recommended' : ''}`.trim()
}

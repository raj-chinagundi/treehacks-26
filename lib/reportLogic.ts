import { SensorPoint, ReportRecord } from '@/types'
import { v4 as uuid } from 'uuid'

// ─── ADC Thresholds (from hardware team) ─────────────────────────────────────
//
//   EMG values arrive as raw 12-bit ADC counts (0–4095).
//   Flask streams them as-is — no voltage conversion.
//
//   Activity thresholds (ADC):
//     Below 165  → Relaxed
//     165–250    → Talking / Conversation
//     Above 250  → Clenching
//     1024       → 100 % intensity cap (anything above also 100 %)

const EMG_RELAXED_ADC = 165
const EMG_TALKING_ADC = 250
const EMG_MAX_ADC     = 1024   // 100 % ceiling

// ─── Detection Constants ─────────────────────────────────────────────────────

const EMG_THRESHOLD      = EMG_TALKING_ADC   // clenching starts here (raw ADC)
const MIN_CLENCH_MS      = 400
const PRECEDE_WINDOW_MS  = 15_000
const PRECEDE_GAP_MS     = 500
const ACTIVATION_PRECEDE = 5       // 5 % activation to count as preceding arousal
const AROUSAL_DETECT_PCT = 12      // 12 % activation for standalone arousal peaks
const AROUSAL_MIN_MS     = 2000
const AROUSAL_FOLLOW_MS  = 15_000

// ─── Signal Transforms ──────────────────────────────────────────────────────

/**
 * Converts raw ADC to 0–100 % intensity.
 * 0 → 0 %, 1024 → 100 %, anything above 1024 → 100 %.
 */
export function emgToIntensity(adc: number): number {
  if (adc <= 0) return 0
  return Math.min(100, (adc / EMG_MAX_ADC) * 100)
}

/**
 * Classifies raw ADC into one of three activity categories.
 */
export function emgToCategory(adc: number): 'relaxed' | 'talking' | 'clenching' {
  if (adc < EMG_RELAXED_ADC) return 'relaxed'
  if (adc < EMG_TALKING_ADC) return 'talking'
  return 'clenching'
}

/**
 * Maps raw ADC to a discrete 1/2/3 level for the step chart.
 *   1 = Relaxed   (ADC < 165)
 *   2 = Talking    (ADC 165–250)
 *   3 = Clenching  (ADC > 250)
 */
export function emgToLevel(adc: number): number {
  if (adc < EMG_RELAXED_ADC) return 1
  if (adc < EMG_TALKING_ADC) return 2
  return 3
}

/**
 * Converts raw HR to percentage deviation from personal sleeping baseline.
 * Returns 0 when HR is at or below baseline.
 */
export function hrToActivation(hr: number, baseline: number): number {
  if (baseline <= 0) return 0
  return Math.max(0, ((hr - baseline) / baseline) * 100)
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

interface RawClenchEvent {
  startMs: number
  endMs: number
  peakEMG: number
}

function detectClenches(data: SensorPoint[]): RawClenchEvent[] {
  const events: RawClenchEvent[] = []
  let active = false, startMs = 0, peak = 0

  for (const p of data) {
    if (p.emg >= EMG_THRESHOLD) {
      if (!active) { active = true; startMs = p.t; peak = p.emg }
      else peak = Math.max(peak, p.emg)
    } else if (active) {
      if (p.t - startMs >= MIN_CLENCH_MS) events.push({ startMs, endMs: p.t, peakEMG: peak })
      active = false; peak = 0
    }
  }
  if (active && data.length) {
    const last = data[data.length - 1].t
    if (last - startMs >= MIN_CLENCH_MS) events.push({ startMs, endMs: last, peakEMG: peak })
  }
  return events
}

function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function stdDev(values: number[]): number {
  if (!values.length) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
}

// ─── Classified Events ───────────────────────────────────────────────────────

export interface ClassifiedClenchEvent {
  startMs: number
  endMs: number
  peakEMG: number
  type: 'arousal-linked' | 'isolated'
  peakIntensity: number    // 0–100 %
  durationSec: number
  severityLabel: string    // Mild, Moderate, Severe
}

export interface ArousalOnlyEvent {
  startMs: number
  endMs: number
  peakActivation: number
}

/**
 * Classifies bruxating events by temporal relationship with nervous system activation.
 * Also detects arousal-only events (nervous system spike with no subsequent clench).
 *
 * - "Arousal-Linked": nervous system activation preceded the clench (autonomic → RMMA)
 * - "Isolated": jaw clenched without preceding autonomic activation (habitual/structural)
 * - "Arousal-Only": nervous system spiked but no clenching followed (decoupled arousal)
 */
export function classifyEvents(data: SensorPoint[]): {
  clenchEvents: ClassifiedClenchEvent[]
  arousalOnlyEvents: ArousalOnlyEvent[]
} {
  if (!data.length) return { clenchEvents: [], arousalOnlyEvents: [] }

  const rawClenches = detectClenches(data)
  const hrValues = data.map(d => d.hr)
  const hrBaseline = median(hrValues)

  // ── Classify each bruxating event ──
  const clenchEvents: ClassifiedClenchEvent[] = rawClenches.map(ev => {
    const preData = data.filter(d => d.t >= ev.startMs - PRECEDE_WINDOW_MS && d.t < ev.startMs - PRECEDE_GAP_MS)
    const maxAct = preData.length
      ? Math.max(...preData.map(d => hrToActivation(d.hr, hrBaseline)))
      : 0

    const type: 'arousal-linked' | 'isolated' = maxAct > ACTIVATION_PRECEDE ? 'arousal-linked' : 'isolated'
    const peakIntensity = emgToIntensity(ev.peakEMG)
    const durationSec = (ev.endMs - ev.startMs) / 1000
    const severityLabel = peakIntensity >= 75 ? 'Severe' : peakIntensity >= 50 ? 'Moderate' : 'Mild'

    return { ...ev, type, peakIntensity, durationSec, severityLabel }
  })

  // ── Detect arousal-only events ──
  const arousalPeaks: ArousalOnlyEvent[] = []
  let active = false, startMs = 0, peak = 0

  for (const p of data) {
    const act = hrToActivation(p.hr, hrBaseline)
    if (act >= AROUSAL_DETECT_PCT) {
      if (!active) { active = true; startMs = p.t; peak = act }
      else peak = Math.max(peak, act)
    } else if (active) {
      if (p.t - startMs >= AROUSAL_MIN_MS) arousalPeaks.push({ startMs, endMs: p.t, peakActivation: peak })
      active = false; peak = 0
    }
  }
  if (active && data.length) {
    const last = data[data.length - 1].t
    if (last - startMs >= AROUSAL_MIN_MS) arousalPeaks.push({ startMs, endMs: last, peakActivation: peak })
  }

  const arousalOnlyEvents = arousalPeaks.filter(ap =>
    !rawClenches.some(ev => ev.startMs >= ap.startMs - 5000 && ev.startMs <= ap.endMs + AROUSAL_FOLLOW_MS)
  )

  return { clenchEvents, arousalOnlyEvents }
}

// ─── Report Generation ───────────────────────────────────────────────────────

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

  const { clenchEvents } = classifyEvents(data)
  const hrValues = data.map(d => d.hr)
  const avgHR = hrValues.reduce((a, b) => a + b, 0) / hrValues.length
  const hrVariability = stdDev(hrValues)
  const peakEMG = Math.max(...data.map(d => d.emg))
  const avgTemp = data.reduce((a, b) => a + b.temp, 0) / data.length
  const tempDrift = Math.abs(data[data.length - 1].temp - data[0].temp)

  const arousalLinkedCount = clenchEvents.filter(e => e.type === 'arousal-linked').length
  const stressLikelihood = clenchEvents.length ? Math.round((arousalLinkedCount / clenchEvents.length) * 100) : 0

  const clenchPenalty = Math.min(40, clenchEvents.length * 2)
  const hrVarPenalty = Math.min(30, hrVariability * 0.5)
  const tempPenalty = Math.min(20, tempDrift * 100)
  const sleepQualityScore = Math.max(0, Math.round(100 - clenchPenalty - hrVarPenalty - tempPenalty))

  return {
    id: uuid(), sessionId, userId, duration: durationSeconds,
    clenchCount: clenchEvents.length, stressLikelihood, sleepQualityScore,
    avgHR: Math.round(avgHR * 10) / 10, hrVariability: Math.round(hrVariability * 10) / 10,
    peakEMG: Math.round(peakEMG),
    avgTemp: Math.round(avgTemp * 100) / 100, tempDrift: Math.round(tempDrift * 100) / 100,
    createdAt: new Date().toISOString(),
  }
}

// ─── Live Stats ──────────────────────────────────────────────────────────────

export interface LiveStats {
  clenchCount: number
  stressLikelihood: number   // arousal-linked %
  sleepQualityScore: number
  avgHR: number
  peakEMG: number
  avgTemp: number
  isClenching: boolean
}

/**
 * Computes running analysis from the current data buffer.
 * Accepts optional pre-computed events to avoid double classification.
 */
export function computeLiveStats(data: SensorPoint[], precomputed?: ClassifiedClenchEvent[]): LiveStats {
  if (!data.length) {
    return { clenchCount: 0, stressLikelihood: 0, sleepQualityScore: 100, avgHR: 0, peakEMG: 0, avgTemp: 0, isClenching: false }
  }

  const clenchEvents = precomputed ?? classifyEvents(data).clenchEvents
  const hrValues = data.map(d => d.hr)
  const hrVariability = stdDev(hrValues)
  const avgHR = hrValues.reduce((a, b) => a + b, 0) / hrValues.length
  const peakEMG = Math.max(...data.map(d => d.emg))
  const avgTemp = data.reduce((a, b) => a + b.temp, 0) / data.length
  const tempDrift = Math.abs(data[data.length - 1].temp - data[0].temp)

  const arousalLinkedCount = clenchEvents.filter(e => e.type === 'arousal-linked').length
  const stressLikelihood = clenchEvents.length ? Math.round((arousalLinkedCount / clenchEvents.length) * 100) : 0

  const clenchPenalty = Math.min(40, clenchEvents.length * 2)
  const hrVarPenalty = Math.min(30, hrVariability * 0.5)
  const tempPenalty = Math.min(20, tempDrift * 100)
  const sleepQualityScore = Math.max(0, Math.round(100 - clenchPenalty - hrVarPenalty - tempPenalty))

  const last = data[data.length - 1]
  const isClenching = last.emg >= EMG_THRESHOLD

  return {
    clenchCount: clenchEvents.length,
    stressLikelihood,
    sleepQualityScore,
    avgHR: Math.round(avgHR * 10) / 10,
    peakEMG: Math.round(peakEMG),
    avgTemp: Math.round(avgTemp * 100) / 100,
    isClenching,
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export function generateBullets(r: ReportRecord): string[] {
  return [
    `Session duration: ${formatDuration(r.duration)}`,
    `Bruxating events detected: ${r.clenchCount}`,
    `Arousal-linked events: ${r.stressLikelihood}%`,
    `Sleep quality score: ${r.sleepQualityScore}/100`,
    `Avg heart rate: ${r.avgHR} bpm (±${r.hrVariability} bpm)`,
    `Peak Jaw Activity: ${emgToCategory(r.peakEMG).toUpperCase()} (ADC ${Math.round(r.peakEMG)})`,
  ]
}

export function reportToPlainText(r: ReportRecord): string {
  const severity =
    r.sleepQualityScore < 40 ? 'Severe' :
    r.sleepQualityScore < 60 ? 'Moderate' :
    r.sleepQualityScore < 80 ? 'Mild' : 'Minimal'

  return `SLEEPSENSE SESSION REPORT
========================
Duration: ${formatDuration(r.duration)}
Date: ${new Date(r.createdAt).toLocaleDateString()}

BRUXISM ANALYSIS
Severity: ${severity}
Total Bruxating Events: ${r.clenchCount}
Arousal-Linked Events: ${r.stressLikelihood}%
Peak Jaw Activity: ${emgToCategory(r.peakEMG).toUpperCase()} (ADC ${Math.round(r.peakEMG)})

SLEEP QUALITY
Sleep Quality Score: ${r.sleepQualityScore}/100

CARDIAC DATA
Average Heart Rate: ${r.avgHR} bpm
HR Variability (±): ${r.hrVariability} bpm

CLINICAL NOTES
${r.clenchCount > 8 ? '- High bruxating frequency — bruxism treatment likely warranted' :
  r.clenchCount > 4 ? '- Moderate bruxating activity detected' :
  '- Low bruxating frequency noted'}
${r.stressLikelihood > 50 ? '- Strong arousal-clenching correlation — autonomic-driven bruxism likely' : ''}
${r.sleepQualityScore < 60 ? '- Poor sleep quality score — specialist consultation recommended' : ''}`.trim()
}

// ─── Sensor Data Dump (for GPT-4o context) ───────────────────────────────────

/**
 * Builds a detailed plain-text dump of all sensor data and classified events
 * for use as GPT-4o system prompt context.
 */
export function buildSensorDataDump(data: SensorPoint[], stats: LiveStats): string {
  const { clenchEvents, arousalOnlyEvents } = classifyEvents(data)
  const arousalLinked = clenchEvents.filter(e => e.type === 'arousal-linked')
  const isolated = clenchEvents.filter(e => e.type === 'isolated')

  const durationMs = data.length ? data[data.length - 1].t - data[0].t : 0
  const durationMin = (durationMs / 60000).toFixed(1)

  const hrValues = data.map(d => d.hr)
  const hrBase = hrValues.length ? median(hrValues) : 0
  const hrVar = hrValues.length ? stdDev(hrValues) : 0

  let dump = `SLEEPSENSE LIVE SENSOR DATA
========================
Session Duration: ${durationMin} minutes
Total Data Points: ${data.length}
Sampling Rate: 10 Hz

EMG ACTIVITY THRESHOLDS (raw ADC from hardware)
─────────────────────────────────────────────────
  Below 165 ADC → Relaxed
  165–250 ADC   → Talking / Conversation
  Above 250 ADC → Clenching
  1024 ADC      = 100% intensity cap

OVERALL STATISTICS
──────────────────
Total Bruxating Events: ${stats.clenchCount}
  - Arousal-Linked: ${arousalLinked.length} (nervous system activated before bruxating)
  - Isolated: ${isolated.length} (no preceding autonomic activation)
  - Arousal-Only Events: ${arousalOnlyEvents.length} (nervous system spiked, no bruxating followed)
Arousal-Linked Rate: ${stats.stressLikelihood}%
Sleep Quality Score: ${stats.sleepQualityScore}/100
Average Heart Rate: ${stats.avgHR} bpm
Peak Jaw Activity: ${emgToCategory(stats.peakEMG).toUpperCase()} (ADC ${Math.round(stats.peakEMG)})
Currently Bruxating: ${stats.isClenching ? 'YES' : 'No'}

CARDIAC BASELINE
────────────────
Median HR: ${hrBase.toFixed(1)} bpm
HR Variability (σ): ${hrVar.toFixed(1)} bpm

EVENT CLASSIFICATION
────────────────────
Events are classified by the temporal cardiac-muscular relationship:
  "Arousal-Linked" — Nervous system activation preceded the bruxating by 0.5–15s (autonomic → RMMA cascade)
  "Isolated" — Jaw bruxated without preceding autonomic activation (habitual/structural)
  "Arousal-Only" — Nervous system spiked but no bruxating followed (decoupled arousal)

BRUXATING EVENT LOG
───────────────────`

  if (clenchEvents.length === 0) {
    dump += '\nNo bruxating events detected yet.\n'
  } else {
    clenchEvents.forEach((ev, i) => {
      const startSec = (ev.startMs / 1000).toFixed(1)
      const endSec = (ev.endMs / 1000).toFixed(1)
      const eventData = data.filter(d => d.t >= ev.startMs && d.t <= ev.endMs)
      const hrDuring = eventData.map(d => d.hr)
      const avgHrEv = hrDuring.length ? (hrDuring.reduce((a, b) => a + b, 0) / hrDuring.length).toFixed(1) : 'N/A'
      const maxHrEv = hrDuring.length ? Math.max(...hrDuring).toFixed(1) : 'N/A'
      const category = emgToCategory(ev.peakEMG)
      dump += `\nEvent #${i + 1} [${ev.type.toUpperCase()}] — ${ev.severityLabel}`
      dump += `\n  Time: ${startSec}s → ${endSec}s (duration: ${ev.durationSec.toFixed(1)}s)`
      dump += `\n  EMG Intensity: ${ev.peakIntensity.toFixed(1)}% (${category})`
      dump += `\n  Peak EMG: ${ev.peakEMG.toFixed(0)} ADC`
      dump += `\n  HR during event: avg ${avgHrEv} bpm, max ${maxHrEv} bpm`
    })
  }

  if (arousalOnlyEvents.length > 0) {
    dump += `\n\nAROUSAL-ONLY EVENTS (${arousalOnlyEvents.length})`
    dump += `\n────────────────────`
    arousalOnlyEvents.forEach((ev, i) => {
      const startSec = (ev.startMs / 1000).toFixed(1)
      const endSec = (ev.endMs / 1000).toFixed(1)
      const durSec = ((ev.endMs - ev.startMs) / 1000).toFixed(1)
      dump += `\n  #${i + 1}: ${startSec}s → ${endSec}s (${durSec}s) — Peak activation: +${ev.peakActivation.toFixed(1)}%`
    })
  }

  if (clenchEvents.length >= 2) {
    const half = Math.floor(clenchEvents.length / 2)
    const firstAvg = clenchEvents.slice(0, half).reduce((a, e) => a + e.peakIntensity, 0) / half
    const secondAvg = clenchEvents.slice(half).reduce((a, e) => a + e.peakIntensity, 0) / (clenchEvents.length - half)
    const trend = secondAvg > firstAvg * 1.1 ? 'INCREASING' : secondAvg < firstAvg * 0.9 ? 'DECREASING' : 'STABLE'
    dump += `\n\nTREND ANALYSIS\n──────────────`
    dump += `\nBruxating Intensity Trend: ${trend}`
    dump += `\n  First half avg: ${firstAvg.toFixed(1)}%`
    dump += `\n  Second half avg: ${secondAvg.toFixed(1)}%`
  }

  return dump
}

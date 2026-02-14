import { SensorPoint } from '@/types'

// Mulberry32 — seeded PRNG, same algorithm as the original project
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SensorState {
  rand: () => number
  emgBaseline: number
  hrBaseline: number
  tempStart: number
  /** Pre-computed burst schedule: [startMs, endMs][] */
  bursts: [number, number][]
}

export function createSensorState(seed = 42): SensorState {
  const rand = mulberry32(seed)

  // Pre-generate burst schedule covering up to 10 min
  const maxMs = 10 * 60 * 1000
  const bursts: [number, number][] = []
  let t = rand() * 20_000 + 10_000 // first burst 10–30 s in
  while (t < maxMs) {
    const dur = (rand() * 4 + 2) * 1000 // 2–6 s
    bursts.push([t, t + dur])
    t += rand() * 50_000 + 20_000 // gap 20–70 s
  }

  return {
    rand,
    emgBaseline: 0.08 + rand() * 0.06,
    hrBaseline: 60 + rand() * 15,
    tempStart: 36.2 + rand() * 0.6,
    bursts,
  }
}

export function generatePoint(state: SensorState, elapsedMs: number): SensorPoint {
  const { rand, emgBaseline, hrBaseline, tempStart, bursts } = state

  const inBurst = bursts.some(([s, e]) => elapsedMs >= s && elapsedMs <= e)
  const nearBurst = bursts.some(([s, e]) => elapsedMs >= s - 15_000 && elapsedMs <= e + 15_000)

  // EMG
  const emg = inBurst
    ? Math.max(0, 0.8 + rand() * 1.7)
    : Math.max(0, emgBaseline + (rand() - 0.5) * 0.05)

  // HR — elevated near bursts (mirrors cardiac correlation in wearable-report.js)
  const hr = Math.max(
    45,
    Math.min(
      120,
      nearBurst ? hrBaseline + rand() * 12 + 3 : hrBaseline + (rand() - 0.5) * 4
    )
  )

  // Temp — slow sine drift + tiny noise
  const mins = elapsedMs / 60_000
  const temp = tempStart + Math.sin(mins * 0.3) * 0.15 + mins * 0.005 + (rand() - 0.5) * 0.04

  return {
    t: elapsedMs,
    emg: Math.round(emg * 1000) / 1000,
    hr: Math.round(hr * 10) / 10,
    temp: Math.round(temp * 100) / 100,
  }
}

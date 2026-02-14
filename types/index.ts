export type SessionStatus = 'recording' | 'analyzing' | 'report_ready'

export interface SensorPoint {
  t: number     // ms from session start
  emg: number   // 0–3.0 arbitrary units
  hr: number    // bpm
  temp: number  // °C
}

export interface SessionRecord {
  id: string
  userId: string
  userName: string
  startTime: string       // ISO
  endTime?: string        // ISO
  duration?: number       // seconds
  status: SessionStatus
  dataPoints?: SensorPoint[]
}

export interface ReportRecord {
  id: string
  sessionId: string
  userId: string
  duration: number          // seconds
  clenchCount: number
  stressLikelihood: number  // 0–100 %
  sleepQualityScore: number // 0–100
  avgHR: number             // bpm
  hrVariability: number     // std-dev bpm
  peakEMG: number
  avgTemp: number           // °C
  tempDrift: number         // total °C change
  createdAt: string         // ISO
}

export interface BookingRecord {
  id: string
  userId: string
  reportId: string
  providerName: string
  providerType: 'dentist' | 'psychiatrist'
  appointmentTime: string
  address: string
  city: string
  status: 'confirmed'
  createdAt: string
}

export interface StorageDB {
  sessions: SessionRecord[]
  reports: ReportRecord[]
  bookings: BookingRecord[]
}

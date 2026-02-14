import fs from 'fs'
import path from 'path'
import { StorageDB, SessionRecord, ReportRecord, BookingRecord } from '@/types'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

const EMPTY_DB: StorageDB = { sessions: [], reports: [], bookings: [] }

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function readDB(): StorageDB {
  ensureDir()
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(EMPTY_DB, null, 2))
    return { ...EMPTY_DB, sessions: [], reports: [], bookings: [] }
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) as StorageDB
  } catch {
    return { ...EMPTY_DB, sessions: [], reports: [], bookings: [] }
  }
}

export function writeDB(db: StorageDB): void {
  ensureDir()
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

// Sessions
export function getSessions(userId?: string): SessionRecord[] {
  const db = readDB()
  return userId ? db.sessions.filter(s => s.userId === userId) : db.sessions
}

export function getSession(id: string): SessionRecord | null {
  return readDB().sessions.find(s => s.id === id) ?? null
}

export function createSession(s: SessionRecord): SessionRecord {
  const db = readDB()
  db.sessions.push(s)
  writeDB(db)
  return s
}

export function updateSession(id: string, updates: Partial<SessionRecord>): SessionRecord | null {
  const db = readDB()
  const i = db.sessions.findIndex(s => s.id === id)
  if (i === -1) return null
  db.sessions[i] = { ...db.sessions[i], ...updates }
  writeDB(db)
  return db.sessions[i]
}

// Reports
export function getReport(sessionId: string): ReportRecord | null {
  return readDB().reports.find(r => r.sessionId === sessionId) ?? null
}

export function getReports(userId: string): ReportRecord[] {
  return readDB().reports.filter(r => r.userId === userId)
}

export function createReport(r: ReportRecord): ReportRecord {
  const db = readDB()
  db.reports.push(r)
  writeDB(db)
  return r
}

// Bookings
export function createBooking(b: BookingRecord): BookingRecord {
  const db = readDB()
  db.bookings.push(b)
  writeDB(db)
  return b
}

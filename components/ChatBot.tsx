'use client'

/**
 * ChatBot — React port of chatbot.js + agent.js (NightGuard / JawSense)
 *
 * Phase machine:
 *   idle           → welcome message, waiting for a session
 *   report_shown   → session report summary shown, offer to find specialist
 *   api_key_input  → user wants specialist search but no Gemini key stored
 *   gemini_active  → DentalAgent (Gemini 2.5 Flash + Google Search) driving conv.
 *   done           → booking confirmed or user declined
 *
 * Renders as a floating popup panel in the bottom-right corner of the dashboard.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { ReportRecord } from '@/types'
import { DentalAgent, DentalOption, GroundingInfo, AgentTurn } from '@/lib/dentalAgent'
import { reportToPlainText, generateBullets } from '@/lib/reportLogic'
import { v4 as uuid } from 'uuid'

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'report_shown' | 'api_key_input' | 'gemini_active' | 'done'

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  text: string
  options?: DentalOption[]
  optionsDone?: boolean
  selectedValue?: string
  grounding?: GroundingInfo
  isReportCard?: boolean
  reportCardHtml?: string
}

interface Props {
  report: ReportRecord | null
  sessionStatus: 'idle' | 'recording' | 'analyzing' | 'report_ready'
  onBookingCreated?: (data: {
    providerName: string
    providerType: string
    appointmentTime: string
    address: string
    reportId: string
  }) => void
  onClose?: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'jawsense_gemini_key'

function buildReportCardHtml(report: ReportRecord): string {
  const bullets = generateBullets(report)
  const scoreColor =
    report.sleepQualityScore >= 75 ? '#22c55e' :
    report.sleepQualityScore >= 50 ? '#f59e0b' : '#ef4444'
  const severity =
    report.sleepQualityScore < 40 ? 'Severe' :
    report.sleepQualityScore < 60 ? 'Moderate' :
    report.sleepQualityScore < 80 ? 'Mild' : 'Minimal'

  return `
    <div class="wearable-report-card">
      <div class="report-header-row">
        <div class="report-logo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <div>
          <div class="report-title">JawSense Session Report</div>
          <div class="report-subtitle">Generated ${new Date(report.createdAt).toLocaleDateString()}</div>
        </div>
      </div>
      <div class="report-severity-badge" style="background:${scoreColor}18;color:${scoreColor};border:1px solid ${scoreColor}40">
        <span class="severity-dot" style="background:${scoreColor}"></span>
        ${severity} · Sleep Quality ${report.sleepQualityScore}/100
      </div>
      <div class="report-grid">
        <div class="report-stat">
          <div class="report-stat-value">${report.clenchCount}</div>
          <div class="report-stat-label">Clench Events</div>
        </div>
        <div class="report-stat">
          <div class="report-stat-value">${report.stressLikelihood}<span class="unit">%</span></div>
          <div class="report-stat-label">Stress-Associated</div>
        </div>
        <div class="report-stat">
          <div class="report-stat-value">${report.avgHR}<span class="unit">bpm</span></div>
          <div class="report-stat-label">Avg Heart Rate</div>
        </div>
        <div class="report-stat">
          <div class="report-stat-value">${report.avgTemp}<span class="unit">°C</span></div>
          <div class="report-stat-label">Avg Temperature</div>
        </div>
      </div>
      <div class="report-footer">JawSense v1.0 · For clinical reference · ${new Date().toLocaleString()}</div>
    </div>
  `
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChatBot({ report, sessionStatus, onBookingCreated, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [phase, setPhase]       = useState<Phase>('idle')
  const [typing, setTyping]     = useState(false)
  const [input, setInput]       = useState('')
  const [apiKeyDraft, setApiKeyDraft] = useState('')

  const agentRef   = useRef<DentalAgent | null>(null)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const phaseRef   = useRef<Phase>('idle')
  const reportRef  = useRef<ReportRecord | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { reportRef.current = report }, [report])

  // ── Helpers ──────────────────────────────────────────────────────────────

  const addMsg = useCallback((msg: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev, { id: uuid(), ...msg }])
  }, [])

  const disableOptionsInMsg = useCallback((msgId: string, chosen: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === msgId
          ? { ...m, optionsDone: true, selectedValue: chosen }
          : m
      )
    )
  }, [])

  // ── Welcome on mount ──────────────────────────────────────────────────────

  useEffect(() => {
    addMsg({
      role: 'assistant',
      text: '👋 Welcome to JawSense! Start a session to begin monitoring. When your session is complete, I\'ll summarize the results and can connect you with a dental specialist nearby.',
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  // ── React to new report ───────────────────────────────────────────────────

  useEffect(() => {
    if (!report) return
    if (phaseRef.current !== 'idle') return

    const bullets = generateBullets(report)
    const summaryLines = bullets.map(b => `• ${b}`).join('\n')

    addMsg({ role: 'assistant', text: `📊 **Session Report Ready**\n\n${summaryLines}` })

    const hasConcern =
      report.clenchCount > 5 || report.stressLikelihood > 50 || report.sleepQualityScore < 60

    const offerMsg: Omit<ChatMsg, 'id'> = {
      role: 'assistant',
      text: hasConcern
        ? `Based on your results I notice some areas of concern — especially your clench count (${report.clenchCount}) and stress likelihood (${report.stressLikelihood}%). **Would you like me to find a dentist or sleep specialist?**\n\n_(Powered by Gemini + Google Search — Gemini API key required)_`
        : `Your results look relatively healthy! **Would you like help finding a dentist or sleep specialist for a follow-up check?**\n\n_(Powered by Gemini + Google Search — Gemini API key required)_`,
      options: [
        { label: 'Yes, find me a specialist', subtitle: 'Uses Gemini AI + live Google Search', value: 'find_specialist' },
        { label: 'No thanks',                 subtitle: 'Skip for now',                        value: 'decline' },
      ],
    }

    setTimeout(() => {
      addMsg(offerMsg)
      setPhase('report_shown')
    }, 600)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report])

  // ── Option button click ───────────────────────────────────────────────────

  async function handleOptionClick(msgId: string, opt: DentalOption) {
    disableOptionsInMsg(msgId, opt.value)
    addMsg({ role: 'user', text: opt.label })

    if (phaseRef.current === 'report_shown') {
      if (opt.value === 'decline') {
        addMsg({ role: 'assistant', text: 'No problem! Feel free to start another session anytime. I\'ll be here when you\'re ready.' })
        setPhase('done')
        return
      }
      if (opt.value === 'find_specialist') {
        const stored = sessionStorage.getItem(STORAGE_KEY) ?? ''
        if (stored) {
          await startGemini(stored)
        } else {
          setPhase('api_key_input')
          addMsg({
            role: 'assistant',
            text: '🔑 To search for real clinics I need your **Gemini API key** (free at aistudio.google.com).\n\nIt stays in your browser and is never sent to our server.',
          })
        }
        return
      }
    }

    if (phaseRef.current === 'gemini_active') {
      await sendToGemini(opt.label)
    }
  }

  // ── Initialise DentalAgent and kick off conversation ──────────────────────

  async function startGemini(key: string) {
    const r = reportRef.current
    if (!r) return
    const agent = new DentalAgent(key, reportToPlainText(r))
    agentRef.current = agent
    setPhase('gemini_active')

    setTyping(true)
    try {
      const turn = await agent.processMessage(
        'Hello, I would like help finding a dental specialist based on my JawSense session data.'
      )
      setTyping(false)
      renderAgentTurn(turn)
    } catch (err) {
      setTyping(false)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addMsg({ role: 'assistant', text: `⚠️ Error connecting to Gemini: ${msg}\n\nPlease check your API key and try again.` })
      setPhase('api_key_input')
    }
  }

  // ── Send text to DentalAgent ──────────────────────────────────────────────

  async function sendToGemini(text: string) {
    if (!agentRef.current) return
    setTyping(true)
    try {
      const turn = await agentRef.current.processMessage(text)
      setTyping(false)
      renderAgentTurn(turn)
    } catch (err) {
      setTyping(false)
      addMsg({ role: 'assistant', text: `⚠️ ${err instanceof Error ? err.message : 'Request failed'}` })
    }
  }

  // ── Render a Gemini AgentTurn ─────────────────────────────────────────────

  function renderAgentTurn(turn: AgentTurn) {
    const { response, grounding } = turn

    const isCard = response.showReport && reportRef.current != null
    const cardHtml = isCard ? buildReportCardHtml(reportRef.current!) : undefined

    addMsg({
      role: 'assistant',
      text: response.message,
      options: response.options.length ? response.options : undefined,
      grounding,
      isReportCard: isCard,
      reportCardHtml: cardHtml,
    })

    if (response.bookingConfirmed) {
      setPhase('done')
      const lastBooking = extractLastBooking()
      if (lastBooking && reportRef.current && onBookingCreated) {
        onBookingCreated({ ...lastBooking, reportId: reportRef.current.id })
      }
    }
  }

  function extractLastBooking() {
    const msgs = [...messages].reverse()
    for (const m of msgs) {
      if (m.role === 'user' && m.text) {
        return {
          providerName: m.text,
          providerType: 'dentist',
          appointmentTime: '',
          address: '',
        }
      }
    }
    return null
  }

  // ── Text input send ────────────────────────────────────────────────────────

  async function handleSend() {
    const text = input.trim()
    if (!text || typing) return
    setInput('')
    addMsg({ role: 'user', text })

    if (phase === 'gemini_active') {
      await sendToGemini(text)
    }
  }

  // ── API key submit ─────────────────────────────────────────────────────────

  async function handleApiKeySubmit() {
    const key = apiKeyDraft.trim()
    if (!key) return
    sessionStorage.setItem(STORAGE_KEY, key)
    setApiKeyDraft('')
    addMsg({ role: 'user', text: '(API key submitted)' })
    addMsg({ role: 'assistant', text: '🔒 Key saved for this session. Connecting to Gemini AI…' })
    await startGemini(key)
  }

  // ── Input area ─────────────────────────────────────────────────────────────

  const inputDisabled = sessionStatus === 'recording' || sessionStatus === 'analyzing' || typing

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="chat-header flex-shrink-0">
        <div className="chat-header-dot" />
        <div className="flex-1">
          <div className="chat-header-title">JawSense AI</div>
          <div className="chat-header-sub">Find dentists &amp; book appointments</div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map(msg => (
          <MessageRow
            key={msg.id}
            msg={msg}
            onOptionClick={handleOptionClick}
          />
        ))}

        {typing && (
          <div className="typing">
            <span /><span /><span />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {phase === 'api_key_input' ? (
        <div className="chat-input-area flex-shrink-0 flex-col gap-2" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <input
            type="password"
            value={apiKeyDraft}
            onChange={e => setApiKeyDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleApiKeySubmit()}
            placeholder="Paste Gemini API key…"
            className="w-full border border-slate-600 rounded-xl px-3 py-2 text-xs bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <div className="flex gap-2 items-center">
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-cyan-400 hover:underline flex-1"
            >
              Get free key →
            </a>
            <button
              onClick={handleApiKeySubmit}
              disabled={!apiKeyDraft.trim()}
              className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-medium hover:bg-cyan-500 disabled:opacity-30 transition-all"
            >
              Connect
            </button>
          </div>
        </div>
      ) : (
        <div className="chat-input-area flex-shrink-0">
          <textarea
            rows={1}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder={
              inputDisabled && sessionStatus !== 'report_ready'
                ? 'Session in progress…'
                : phase === 'done'
                ? 'Booking complete ✓'
                : 'Ask about your results…'
            }
            disabled={inputDisabled}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={inputDisabled || !input.trim()}
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Sub-component: one row in the message list ───────────────────────────────

function MessageRow({
  msg,
  onOptionClick,
}: {
  msg: ChatMsg
  onOptionClick: (msgId: string, opt: DentalOption) => void
}) {
  return (
    <>
      <div className={`msg ${msg.role}`}>
        <RichText text={msg.text} />
      </div>

      {msg.isReportCard && msg.reportCardHtml && (
        <div
          className="msg-card"
          dangerouslySetInnerHTML={{ __html: msg.reportCardHtml }}
        />
      )}

      {msg.options && msg.options.length > 0 && (
        <div className="msg-buttons">
          {msg.options.map(opt => (
            <button
              key={opt.value}
              className={`msg-option-btn ${msg.optionsDone && msg.selectedValue === opt.value ? 'selected' : ''}`}
              disabled={!!msg.optionsDone}
              onClick={() => onOptionClick(msg.id, opt)}
            >
              <span className="msg-option-label">{opt.label}</span>
              {opt.subtitle && <span className="msg-option-sub">{opt.subtitle}</span>}
            </button>
          ))}
        </div>
      )}

      {msg.grounding && (
        <div className={`grounding-badge ${msg.grounding.verified ? 'verified' : 'unverified'}`}>
          <span className="grounding-icon">{msg.grounding.verified ? '✓' : '⚠️'}</span>
          <div>
            <strong>{msg.grounding.verified ? 'Verified via Google Search' : 'No Google Search used'}</strong>
            {msg.grounding.verified && msg.grounding.searchQueries.length > 0 && (
              <div className="grounding-queries">
                Searched: {msg.grounding.searchQueries.join(' · ')}
              </div>
            )}
            {msg.grounding.verified && msg.grounding.sources.length > 0 && (
              <div className="grounding-sources">
                {msg.grounding.sources.slice(0, 3).map((s, i) => (
                  <span key={i}>
                    <a href={s.uri} target="_blank" rel="noreferrer">{s.title}</a>
                    {i < Math.min(msg.grounding!.sources.length, 3) - 1 && ' · '}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function RichText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, li) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g)
        return (
          <span key={li}>
            {parts.map((p, pi) =>
              p.startsWith('**') && p.endsWith('**')
                ? <strong key={pi}>{p.slice(2, -2)}</strong>
                : <span key={pi}>{p}</span>
            )}
            {li < lines.length - 1 && <br />}
          </span>
        )
      })}
    </>
  )
}

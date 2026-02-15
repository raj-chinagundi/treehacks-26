'use client'

/**
 * ChatBot — GPT-4o bruxism clinical analyst.
 *
 * Flow:
 *   1. User opens chat
 *   2. If no OpenAI API key → show key input
 *   3. System prompt = clinical analyst persona + full sensor data dump
 *   4. User asks anything → GPT-4o reasons over data → responds
 *   5. Multi-turn conversation
 *
 * No tools. No search. No function calling.
 * The data is already in context and the reasoning is what GPT-4o is good at.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { SensorPoint } from '@/types'
import { LiveStats, buildSensorDataDump } from '@/lib/reportLogic'
import { BruxismAgent } from '@/lib/bruxismAgent'
import { v4 as uuid } from 'uuid'

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'api_key_input' | 'ready' | 'active'

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface Props {
  liveStats: LiveStats
  getRawData: () => SensorPoint[]
  sessionStatus: 'idle' | 'recording' | 'report_ready'
  onClose?: () => void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'jawsense_openai_key'

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChatBot({ liveStats, getRawData, sessionStatus, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [phase, setPhase]       = useState<Phase>('api_key_input')
  const [typing, setTyping]     = useState(false)
  const [input, setInput]       = useState('')
  const [apiKeyDraft, setApiKeyDraft] = useState('')

  const agentRef  = useRef<BruxismAgent | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Check for stored key on mount ──────────────────────────────────────

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      setPhase('ready')
    }
    addMsg({
      role: 'assistant',
      text: '👋 Welcome to JawSense AI. I\'m a bruxism specialist that can analyze your sensor data, identify clenching patterns, determine root causes, and recommend personalized relief steps.\n\nStart a session and ask me anything about your data.',
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auto-scroll ─────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  // ── Helpers ─────────────────────────────────────────────────────────────

  const addMsg = useCallback((msg: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev, { id: uuid(), ...msg }])
  }, [])

  // ── API key submit ──────────────────────────────────────────────────────

  function handleApiKeySubmit() {
    const key = apiKeyDraft.trim()
    if (!key) return
    sessionStorage.setItem(STORAGE_KEY, key)
    setApiKeyDraft('')
    setPhase('ready')
    addMsg({ role: 'assistant', text: '🔒 API key saved for this session. You can now ask me about your data.' })
  }

  // ── Create agent with latest sensor data ───────────────────────────────

  function ensureAgent(): BruxismAgent | null {
    const key = sessionStorage.getItem(STORAGE_KEY)
    if (!key) {
      setPhase('api_key_input')
      return null
    }
    if (!agentRef.current) {
      const rawData = getRawData()
      const dump = buildSensorDataDump(rawData, liveStats)
      agentRef.current = new BruxismAgent(key, dump)
    }
    return agentRef.current
  }

  // ── Send message ────────────────────────────────────────────────────────

  async function handleSend() {
    const text = input.trim()
    if (!text || typing) return
    setInput('')
    addMsg({ role: 'user', text })

    const agent = ensureAgent()
    if (!agent) {
      addMsg({ role: 'assistant', text: '⚠️ Please enter your OpenAI API key first.' })
      return
    }

    setPhase('active')
    setTyping(true)
    try {
      const reply = await agent.sendMessage(text)
      setTyping(false)
      addMsg({ role: 'assistant', text: reply })
    } catch (err) {
      setTyping(false)
      const msg = err instanceof Error ? err.message : 'Request failed'
      addMsg({ role: 'assistant', text: `⚠️ ${msg}` })
      if (msg.includes('401') || msg.includes('invalid')) {
        sessionStorage.removeItem(STORAGE_KEY)
        agentRef.current = null
        setPhase('api_key_input')
      }
    }
  }

  // ── Input state ─────────────────────────────────────────────────────────

  const inputDisabled = typing

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
          <div className="chat-header-sub">Bruxism analysis &amp; clinical insights</div>
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
          <div key={msg.id} className={`msg ${msg.role}`}>
            <RichText text={msg.text} />
          </div>
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
            placeholder="Paste OpenAI API key…"
            className="w-full border border-slate-600 rounded-xl px-3 py-2 text-xs bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <div className="flex gap-2 items-center">
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-cyan-400 hover:underline flex-1"
            >
              Get API key →
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
              inputDisabled
                ? 'Analyzing…'
                : 'Ask about your data…'
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

// ─── Sub-component: rich text with bold support ────────────────────────────────

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

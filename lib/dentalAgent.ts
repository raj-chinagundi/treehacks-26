/**
 * DentalAgent — TypeScript port of agent.js
 *
 * Identical logic to the original:
 *  - Gemini 2.5 Flash with google_search tool for real clinic data
 *  - Grounding metadata extraction (proves search actually happened)
 *  - Robust JSON parsing (strips backticks, extracts from wrapped text)
 *  - Multi-turn conversation history
 *
 * Differences from original:
 *  - Takes report plain-text as constructor param instead of WearableReport instance
 *  - Exported as a class (no window/module.exports shim needed)
 *  - Fully typed
 */

export interface DentalOption {
  label: string
  subtitle?: string
  value: string
}

export interface DentalResponse {
  message: string
  options: DentalOption[]
  showReport: boolean
  bookingConfirmed: boolean
}

export interface GroundingInfo {
  searchQueries: string[]
  sources: Array<{ title: string; uri: string }>
  verified: boolean
}

export interface AgentTurn {
  response: DentalResponse
  grounding: GroundingInfo
}

type ConvTurn = { role: 'user' | 'model'; parts: Array<{ text: string }> }

export class DentalAgent {
  private readonly apiKey: string
  private history: ConvTurn[] = []
  private readonly systemPrompt: string

  constructor(apiKey: string, reportPlainText: string) {
    this.apiKey = apiKey
    this.systemPrompt = this.buildSystemPrompt(reportPlainText)
  }

  private buildSystemPrompt(reportPlainText: string): string {
    return `You are a dental health assistant embedded in the JawSense wearable app. JawSense monitors jaw clenching and bruxism during sleep using EMG sensors and a heart rate monitor.

You have access to this patient's real wearable session data:

${reportPlainText}

YOUR ROLE:
Help this patient find a dental professional or sleep specialist and book an appointment. Their wearable data shows patterns that warrant professional evaluation.

CONVERSATION FLOW:
1. GREET: Briefly mention what the data shows (key stats: clench count, stress likelihood, sleep quality score). Ask if they'd like help finding a dentist or sleep specialist nearby.
2. SEARCH: When they agree, ask for their location (or default to Stanford, CA area). Use Google Search to find real dental clinics — prefer those mentioning TMJ, bruxism, night guards, or sleep dentistry.
3. PRESENT OPTIONS: Show 3 real clinics from search results with actual names, addresses, and any ratings found.
4. COLLECT CHOICE: When they pick a clinic, present 3–4 available appointment slots for the next few business days. Generate realistic times (9am–5pm, 30-min or 1-hr slots).
5. CONFIRM: Summarize the booking — clinic name, address, date/time. Mention that the JawSense wearable report will be shared with the clinic. Set showReport: true and bookingConfirmed: true.
6. DONE: Confirm booking is complete.

CRITICAL RESPONSE FORMAT:
You MUST respond with ONLY a valid JSON object. No markdown, no backticks, no explanation outside the JSON. The JSON must have this structure:

{
  "message": "Your conversational text to the patient",
  "options": [{"label": "Display text", "subtitle": "Extra info like address", "value": "unique_id"}],
  "showReport": false,
  "bookingConfirmed": false
}

Rules:
- "message" is always required. Use \\n for line breaks.
- "options" array: include ONLY when presenting clickable choices (clinics or time slots). Omit or use [] otherwise.
- "showReport" true ONLY in the final booking confirmation message.
- "bookingConfirmed" true ONLY in the final booking confirmation message.
- Keep messages concise and warm. No walls of text.
- When presenting clinics from search, use REAL names and addresses from search results.
- For time slots, generate realistic near-future times (next 2–3 business days).

IMPORTANT: Output raw JSON only. No \`\`\`json wrapper. No text before or after the JSON object.`
  }

  /** Send a user message and get the agent response — mirrors processMessage() in agent.js */
  async processMessage(userMessage: string): Promise<AgentTurn> {
    this.history.push({ role: 'user', parts: [{ text: userMessage }] })

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: this.systemPrompt }] },
          contents: this.history,
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Unknown error'
      throw new Error(`Gemini API error ${res.status}: ${msg}`)
    }

    const data = await res.json()
    const candidate = data.candidates?.[0]
    if (!candidate) throw new Error('No response candidate returned')

    const parts: Array<{ text?: string }> = candidate.content?.parts ?? []
    const fullText = parts
      .filter(p => p.text)
      .map(p => p.text!)
      .join('\n')
      .trim()

    // --- Grounding metadata (mirrors the console logging in agent.js) ---
    const groundingMeta = candidate.groundingMetadata ?? null
    const grounding: GroundingInfo = {
      searchQueries: groundingMeta?.webSearchQueries ?? [],
      sources: (groundingMeta?.groundingChunks ?? []).map((c: { web?: { title?: string; uri?: string } }) => ({
        title: c.web?.title ?? 'Source',
        uri: c.web?.uri ?? '#',
      })),
      verified: !!(groundingMeta?.webSearchQueries?.length),
    }

    this.history.push({ role: 'model', parts: [{ text: fullText }] })

    const response = this.parseResponse(fullText)
    return { response, grounding }
  }

  /** Identical JSON parsing logic to parseResponse() in agent.js */
  private parseResponse(text: string): DentalResponse {
    let parsed: Partial<DentalResponse> | undefined

    // Attempt 1: direct parse
    try { parsed = JSON.parse(text) } catch { /* fall through */ }

    if (!parsed) {
      // Attempt 2: strip markdown fences
      const cleaned = text.replace(/```json?\s*|```\s*/g, '').trim()
      try { parsed = JSON.parse(cleaned) } catch { /* fall through */ }

      if (!parsed) {
        // Attempt 3: extract first {...} block
        const match = cleaned.match(/\{[\s\S]*\}/)
        if (match) {
          try { parsed = JSON.parse(match[0]) } catch { /* fall through */ }
        }
      }
      if (!parsed) parsed = { message: text, options: [], showReport: false, bookingConfirmed: false }
    }

    return {
      message: parsed.message ?? '',
      options: Array.isArray(parsed.options) ? parsed.options : [],
      showReport: !!parsed.showReport,
      bookingConfirmed: !!parsed.bookingConfirmed,
    }
  }

  reset() {
    this.history = []
  }
}

/**
 * BruxismAgent — GPT-4o clinical bruxism analyst with function calling.
 *
 * Architecture:
 *   System prompt = clinical analyst persona + full sensor data dump
 *   Tools: search_clinics (Google Places), confirm_booking
 *   Multi-turn conversation maintained via message history.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface ToolCallObj {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCallObj[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type ToolExecutor = (name: string, args: Record<string, string>) => Promise<string>

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_clinics',
      description:
        'Search for dental clinics, TMJ specialists, or sleep specialists near a given location. Returns real verified Google Maps business listings with name, address, and rating.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query, e.g. "dentist", "TMJ specialist", "sleep clinic bruxism"',
          },
          location: {
            type: 'string',
            description: 'Location to search near, e.g. "Stanford, CA", "85281", "San Francisco"',
          },
        },
        required: ['query', 'location'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'confirm_booking',
      description:
        'Confirm an appointment booking with a selected clinic. The JawSense sensor report and the full analysis chat thread will be prepared and shared with the clinic.',
      parameters: {
        type: 'object',
        properties: {
          clinicName: {
            type: 'string',
            description: 'Name of the selected clinic',
          },
          clinicAddress: {
            type: 'string',
            description: 'Address of the clinic',
          },
          preferredTime: {
            type: 'string',
            description: 'Preferred appointment date and time',
          },
          patientNotes: {
            type: 'string',
            description: 'Brief clinical notes about the patient condition based on the sensor analysis',
          },
        },
        required: ['clinicName', 'clinicAddress', 'preferredTime'],
      },
    },
  },
]

// ─── Agent class ─────────────────────────────────────────────────────────────

export class BruxismAgent {
  private readonly apiKey: string
  private messages: ChatMessage[]
  private readonly executeFn: ToolExecutor

  constructor(apiKey: string, sensorDataDump: string, executeFn: ToolExecutor) {
    this.apiKey = apiKey
    this.executeFn = executeFn
    this.messages = [
      { role: 'system', content: this.buildSystemPrompt(sensorDataDump) },
    ]
  }

  private buildSystemPrompt(sensorDataDump: string): string {
    return `You are a board-certified bruxism and sleep medicine specialist embedded in the JawSense wearable monitoring system. You analyze real patient sensor data and provide clinical-grade insights.

PATIENT'S SENSOR DATA:

${sensorDataDump}

YOUR ANALYTICAL FRAMEWORK:

1. ANALYZE — Read the episode log above. Identify patterns:
   - Episode clustering (are events grouped at specific times?)
   - Force/intensity escalation (is peak EMG increasing over time?)
   - HR-EMG correlation (what percentage of events show cardiac activation?)
   - Frequency patterns (events per minute/hour)

2. CORRELATE — Connect cardiac response with muscle activity:
   - HR elevation during clenching = autonomic stress response
   - High HR variability during episodes = sympathetic nervous system activation
   - Episodes without HR changes = likely habitual/primary bruxism
   - A ±15 second window is used for HR correlation around each event

3. ROOT CAUSE — Reason about potential causes based on THIS patient's specific data:
   - Stress/anxiety: Look at HR elevation patterns during events
   - Sleep architecture: Look at event timing patterns
   - Medication side effects: Consider if pattern suggests pharmacological cause
   - Malocclusion: Consider if clenching pattern is consistent/mechanical
   - For each potential cause, explain WHY the data supports or contradicts it

4. RELIEF — Provide personalized recommendations tied to the observed patterns:
   - Reference specific measurements (e.g. "your peak EMG of X µV suggests…")
   - Differentiate between stress-management interventions and dental interventions
   - If data shows both stress and non-stress clenching, address both separately
   - Recommend professional consultation when data warrants it

COMMUNICATION STYLE:
- Always reference specific numbers from the patient's data
- Be direct and clinical but warm
- Draw conclusions from patterns, don't just list possibilities
- Example of good output: "Your clenching force increased 34% from the first half to second half of the session, correlating with your HR baseline rising from 58 to 64bpm — this suggests an escalating stress response, not a structural dental issue."
- Remind users that this analysis supplements but does not replace professional medical diagnosis

PROFESSIONAL REFERRAL FLOW:
When the user's analysis questions seem answered and the conversation is wrapping up:
1. Proactively ask if they'd like to consult a professional (dentist, TMJ specialist, or sleep medicine doctor) for an in-person evaluation.
2. If they agree, ask for their location (city, zip code, or address).
3. Use the search_clinics function to find nearby specialists. NEVER invent clinic names or addresses — always use the function.
4. Present the top results clearly with name, address, and rating.
5. When the user selects a clinic, ask for their preferred appointment date/time.
6. Use confirm_booking to finalize. Mention that the full JawSense sensor report and this analysis chat thread will be shared with the clinic so the doctor has complete context before the appointment.
7. After booking confirmation, summarize what was shared and wish the patient well.

Respond naturally in conversation. The user may ask follow-up questions — maintain context and drill deeper when asked.`
  }

  /**
   * Sends a user message to GPT-4o and returns the assistant's reply.
   * Handles function calling loops automatically.
   */
  async sendMessage(userMessage: string): Promise<string> {
    this.messages.push({ role: 'user', content: userMessage })

    for (let i = 0; i < 5; i++) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: this.messages,
          tools: TOOLS,
          temperature: 0.7,
          max_tokens: 1500,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Unknown error'
        throw new Error(`OpenAI API error ${res.status}: ${msg}`)
      }

      const data = await res.json()
      const choice = data.choices?.[0]
      if (!choice?.message) throw new Error('No response from GPT-4o')

      const msg = choice.message

      // If GPT-4o wants to call functions
      if (msg.tool_calls?.length) {
        this.messages.push({
          role: 'assistant',
          content: msg.content ?? null,
          tool_calls: msg.tool_calls,
        })

        for (const tc of msg.tool_calls) {
          const fnArgs = JSON.parse(tc.function.arguments)
          const result = await this.executeFn(tc.function.name, fnArgs)
          this.messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result,
          })
        }

        continue
      }

      // Normal text response
      const reply = msg.content ?? ''
      this.messages.push({ role: 'assistant', content: reply })
      return reply
    }

    throw new Error('Too many function call iterations')
  }

  reset() {
    this.messages = this.messages.slice(0, 1)
  }
}

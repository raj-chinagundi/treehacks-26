/**
 * BruxismAgent — GPT-4o clinical bruxism analyst.
 *
 * Architecture:
 *   System prompt = clinical analyst persona + full sensor data dump
 *   No tools, no search, no function calling — data is in context,
 *   reasoning is what GPT-4o is good at.
 *   Multi-turn conversation maintained via message history.
 */

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export class BruxismAgent {
  private readonly apiKey: string
  private messages: ChatMessage[]

  constructor(apiKey: string, sensorDataDump: string) {
    this.apiKey = apiKey
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

Respond naturally in conversation. The user may ask follow-up questions — maintain context and drill deeper when asked.`
  }

  /**
   * Sends a user message to GPT-4o and returns the assistant's reply.
   * Maintains full conversation history for multi-turn reasoning.
   */
  async sendMessage(userMessage: string): Promise<string> {
    this.messages.push({ role: 'user', content: userMessage })

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: this.messages,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Unknown error'
      throw new Error(`OpenAI API error ${res.status}: ${msg}`)
    }

    const data = await res.json()
    const reply = data.choices?.[0]?.message?.content ?? ''
    this.messages.push({ role: 'assistant', content: reply })
    return reply
  }

  reset() {
    this.messages = this.messages.slice(0, 1)
  }
}

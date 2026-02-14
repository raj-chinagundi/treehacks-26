# JawSense — Sleep & Clenching Analytics

A full-stack bruxism / jaw-clenching monitoring dashboard built for Stanford Hacks 2026.

---

## Features

| | |
|---|---|
| **Session monitoring** | Start/Stop sessions that stream mock EMG, heart-rate, and temperature data at 10 Hz |
| **Live charts** | EMG waveform, heart-rate line, and a combined three-signal overview (Recharts) |
| **Report engine** | Detects clench events, stress likelihood, and a sleep-quality proxy score |
| **AI chatbot** | Embedded right-column panel: shows report summary, then hands off to Gemini 2.5 Flash for live Google-Search–powered dental clinic booking |
| **Grounding badges** | Identical to the original NightGuard UI — shows ✓ Verified or ⚠ Unverified based on Gemini `groundingMetadata` |
| **Persistence** | Local JSON file (`data/db.json`) stores sessions, reports, and booking records |
| **Auth** | Google OAuth **or** a zero-config mock/demo sign-in |
| **Past sessions** | Dropdown in the top bar to reload any previous report and chart data |

---

## Quick start

```bash
# 1. Clone / open the project
cd jawsense

# 2. Install dependencies
npm install

# 3. Copy the env template
cp .env.local.example .env.local
# Edit .env.local if you want to add Google OAuth keys

# 4. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Sign-in options

### Mock / demo sign-in (no setup required)
1. Click **"Use demo account (no OAuth required)"** on the landing page.
2. Enter any email and display name (defaults work fine).
3. Click **Continue as Demo User**.

### Google OAuth (optional)
1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. Enable the **Google People API**.
3. Create an OAuth 2.0 client ID (Web application).
4. Add `http://localhost:3000/api/auth/callback/google` as an authorised redirect URI.
5. Copy the client ID and secret into `.env.local`:
   ```
   GOOGLE_CLIENT_ID=…
   GOOGLE_CLIENT_SECRET=…
   ```
6. Restart the dev server — the **Sign in with Google** button will now work.

---

## Using the AI clinic-booking chatbot

The right-column chatbot uses **Gemini 2.5 Flash** with the **Google Search** grounding tool to find real dental clinics.

1. Complete a session (Start → Stop).
2. The chatbot shows your report summary and asks if you want to find a specialist.
3. Click **"Yes, find me a specialist"**.
4. If no Gemini API key is stored, an inline form appears — paste your key.
   - Get a free key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
   - The key is saved in `sessionStorage` only — it never leaves the browser or hits our server.
5. The agent searches Google for real clinics near your location, presents options, and walks you through booking.
6. A green **✓ Verified via Google Search** badge confirms live search was used.

---

## Deterministic demo mode

Append `?seed=42` (or any integer) to the dashboard URL for a repeatable sensor sequence:

```
http://localhost:3000/dashboard?seed=42
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS + chatbot CSS ported from original NightGuard |
| Charts | Recharts |
| Auth | NextAuth v4 (Google + mock credentials) |
| Storage | Local JSON (`data/db.json`) via Node `fs` in API routes |
| AI chatbot | Gemini 2.5 Flash — same API call, same JSON parsing, same grounding logic as `agent.js` |

---

## Project structure

```
jawsense/
├── app/
│   ├── globals.css          # Tailwind + chatbot.css styles (msg bubbles, grounding badges …)
│   ├── layout.tsx / providers.tsx
│   ├── page.tsx             # Landing / sign-in
│   ├── dashboard/page.tsx   # Auth-protected dashboard wrapper
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── sessions/        # GET list, POST create, GET/PUT by ID
│       ├── reports/         # GET by sessionId, POST generate
│       └── bookings/        # POST create
├── components/
│   ├── Dashboard.tsx        # 3-column layout, session state machine
│   ├── ChatBot.tsx          # React port of chatbot.js + agent.js (Gemini booking)
│   ├── ReportBox.tsx        # Bullet-point report with expand/collapse
│   ├── StatusBadge.tsx
│   ├── SignInButton.tsx
│   └── charts/
│       ├── EMGChart.tsx
│       ├── HRChart.tsx
│       └── MainChart.tsx
├── lib/
│   ├── auth.ts              # NextAuth options
│   ├── storage.ts           # JSON file read/write (server-only)
│   ├── mockSensor.ts        # Seeded PRNG + sensor data generation
│   ├── reportLogic.ts       # Clench detection, report heuristics, plain-text export
│   └── dentalAgent.ts       # TypeScript port of agent.js (Gemini + Google Search)
├── types/index.ts
├── data/db.json             # Auto-created on first run
└── .env.local               # Copied from .env.local.example
```

---

## Chatbot origin

The `ChatBot` component and `DentalAgent` class are direct TypeScript ports of
`chatbot.js` / `agent.js` / `chatbot.css` from the original NightGuard project:

- Same Gemini 2.5 Flash API endpoint
- Same `google_search: {}` tool for real clinic data
- Same `groundingMetadata` extraction for the verification badge
- Same three-pass JSON parsing (direct → strip fences → regex extract)
- Same multi-turn `conversationHistory` pattern
- Visual classes (`.msg`, `.msg-option-btn`, `.grounding-badge`, `.typing`, …) preserved verbatim in `globals.css`

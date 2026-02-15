# SleepSense

> Real-time bruxism and jaw-clenching monitoring dashboard — built at Stanford Hacks 2026.

SleepSense connects a wearable heart-rate sensor and an ESP32 EMG jaw sensor to a live analytics dashboard. Sensor data streams through a Flask data hub into a Next.js frontend that visualizes jaw activity, detects clenching events, classifies them by their cardiac–muscular relationship, and generates clinical-grade reports. An embedded GPT-4o chatbot can reason over the patient's data and book a specialist through Google Places.

[![Demo Video](https://img.shields.io/badge/Demo-YouTube-red?logo=youtube)](https://www.youtube.com/watch?v=acdo23eFIlc)

---

## Table of Contents

- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Setup](#setup)
- [Usage](#usage)
- [Demo Video](#demo-video)

---

## Project Structure

```
sleepsense/
├── app/                            # Next.js App Router
│   ├── page.tsx                    # Landing page — sign-in (Google OAuth or demo)
│   ├── layout.tsx                  # Root layout with dark theme + SessionProvider
│   ├── providers.tsx               # NextAuth SessionProvider wrapper
│   ├── globals.css                 # Tailwind base + chatbot widget styles
│   ├── dashboard/
│   │   └── page.tsx                # Auth-protected dashboard entry point
│   └── api/
│       ├── auth/[...nextauth]/
│       │   └── route.ts            # NextAuth handler (Google + mock credentials)
│       ├── sessions/
│       │   ├── route.ts            # GET list / POST create sessions
│       │   └── [id]/route.ts       # GET / PUT individual session
│       ├── reports/
│       │   └── route.ts            # GET by sessionId / POST generate report
│       ├── bookings/
│       │   └── route.ts            # POST create booking record
│       └── places/
│           └── route.ts            # Proxy to Google Places Text Search API
│
├── components/
│   ├── Dashboard.tsx               # Main 3-section layout + session state machine
│   ├── ChatBot.tsx                 # SleepSense AI chatbot — GPT-4o with function calling
│   ├── ReportBox.tsx               # Expandable bullet-point report card
│   ├── SignInButton.tsx            # Google OAuth + demo sign-in form
│   ├── StatusBadge.tsx             # Connection status indicator
│   └── charts/
│       ├── HeartRateChart.tsx      # BPM area chart (Recharts)
│       ├── JawActivityChart.tsx    # 3-level step chart (Relaxed / Talking / Clenching)
│       ├── EMGChart.tsx            # Raw EMG waveform line chart
│       ├── HRChart.tsx             # Simple HR line chart
│       └── MainChart.tsx           # Combined 3-signal overview chart
│
├── lib/
│   ├── auth.ts                     # NextAuth config (Google provider + mock)
│   ├── storage.ts                  # JSON file read/write for sessions, reports, bookings
│   ├── mockSensor.ts               # Seeded PRNG sensor data generator
│   ├── reportLogic.ts              # Clench detection, event classification, report scoring
│   └── bruxismAgent.ts             # SleepSense AI — GPT-4o agent with search_clinics + confirm_booking tools
│
├── types/
│   └── index.ts                    # TypeScript interfaces (SensorPoint, SessionRecord, etc.)
│
├── credentials/
│   └── service-account.json        # Google service account for Sheets API (EMG polling)
│
├── data/
│   └── db.json                     # Auto-created local JSON database
├── design/CAD_enclosure            # design files for mask
├── hardware/esp32_serial_blocking  # data capture and data stream over wifi through esp32
├── test.py                         # Flask data hub (SleepSense Data Hub) — unifies HR + EMG into 10 Hz SSE stream
├── requirements.txt                # Python dependencies (flask, gspread, google-auth)
├── package.json                    # Node dependencies and scripts
├── tailwind.config.ts              # Tailwind CSS configuration
├── tsconfig.json                   # TypeScript configuration
├── next.config.mjs                 # Next.js configuration
└── postcss.config.mjs              # PostCSS plugins (Tailwind + Autoprefixer)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router) + React 18 + TypeScript |
| **Styling** | Tailwind CSS |
| **Charts** | Recharts (AreaChart, LineChart, ReferenceArea) |
| **Auth** | NextAuth v4 — Google OAuth + zero-config mock credentials |
| **AI Chatbot** | SleepSense AI — GPT-4o via OpenAI API with function calling (search_clinics, confirm_booking) |
| **Clinic Search** | Google Places Text Search API |
| **Data Hub** | SleepSense Data Hub — Flask (Python), combines HR + EMG into a 10 Hz SSE stream |
| **EMG Sensor** | ESP32 → Google Sheets → Flask polls via `gspread` |
| **HR Sensor** | Wearable POSTs BPM to Flask `/data` endpoint |
| **Storage** | Local JSON file (`data/db.json`) via Node `fs` in API routes |

---

## Architecture Overview

```
┌──────────────┐    POST /data     ┌──────────────────────┐   SSE /stream    ┌─────────────────────┐
│  HR Wearable │ ─────────────────▶│                      │ ────────────────▶│                     │
└──────────────┘                   │  SleepSense Data Hub │                  │  Next.js Dashboard  │
┌──────────────┐  Google Sheets    │   (test.py :5001)    │                  │  (localhost:3000)   │
│  ESP32 EMG   │ ─────────────────▶│                      │                  │                     │
└──────────────┘                   └──────────────────────┘                  │  ┌───────────────┐  │
                                                                            │  │ Live Charts   │  │
                                                                            │  │ Event Detect  │  │
                                                                            │  │ Report Engine │  │
                                                                            │  │ GPT-4o Chat   │  │
                                                                            │  └───────────────┘  │
                                                                            └─────────────────────┘
```

**Data flow:**

1. **Heart rate** — A wearable device POSTs BPM readings to Flask at `/data`.
2. **EMG** — An ESP32 writes raw 12-bit ADC values to a Google Sheet. Flask polls the sheet every second via `gspread`.
3. **Flask combiner** — A background thread reads the latest HR + EMG at 10 Hz and pushes combined JSON events over SSE (`/stream`).
4. **Next.js dashboard** — Opens an `EventSource` to Flask, buffers incoming data points, and refreshes charts at 5 Hz.
5. **Report engine** (`reportLogic.ts`) — Classifies jaw activity into Relaxed / Talking / Clenching using ADC thresholds, detects bruxating events, correlates them with heart-rate arousal, and scores sleep quality.
6. **AI chatbot** (`bruxismAgent.ts`) — Sends the full sensor data dump + event log as GPT-4o system context. The model analyzes patterns, identifies root causes, and can call `search_clinics` (Google Places) and `confirm_booking` to schedule a specialist visit.

---

## Setup

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.9 (for the Flask data hub)
- **npm**

### 1. Install Node dependencies

```bash
cd sleepsense
npm install
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

Create a `.env.local` file in the project root:

```env
# NextAuth
NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=http://localhost:3000

# Google OAuth (optional — demo sign-in works without it)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Google Places API (required for clinic search in chatbot)
GOOGLE_PLACES_API_KEY=...

# OpenAI (optional — can also be entered in the chatbot UI at runtime)
NEXT_PUBLIC_OPENAI_API_KEY=...
```

> **Note:** The demo sign-in mode works with no environment variables at all. Google OAuth, Places, and OpenAI keys are only needed for their respective features.

### 4. Start the Flask data hub

```bash
python test.py
```

This starts the SleepSense Data Hub on **port 5001**. It will:
- Accept heart-rate POSTs from the wearable at `/data`
- Poll Google Sheets for ESP32 EMG data
- Stream combined data at 10 Hz via SSE at `/stream`

### 5. Start the Next.js dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Usage

### Sign In

- **Demo mode** — Click *"Use demo account"* on the landing page. No OAuth setup needed.
- **Google OAuth** — Configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`, add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI in Google Cloud Console.

### Monitor a Session

1. Click **Connect Device** — the dashboard opens an SSE connection to the Flask data hub and starts buffering sensor data.
2. Live charts update at 5 Hz showing **Heart Rate** (BPM area chart) and **Jaw Activity** (3-level step chart: Relaxed → Talking → Clenching).
3. The **Live Analysis** panel displays running metrics: clenching events, sleep quality score, current jaw state, and average heart rate.
4. Click **Save Report** at any time to snapshot the current analysis. The report engine classifies each bruxating event as *arousal-linked* (HR spike preceded the clench) or *isolated* (habitual pattern).
5. Click **Disconnect** to stop the session.

### AI Chatbot

1. Click the chat bubble in the bottom-right corner.
2. If no OpenAI API key is configured, paste one when prompted (stored in `sessionStorage` only).
3. Ask questions about your session data — GPT-4o has the full sensor dump and event log as context.
4. When ready, the chatbot offers to find a specialist. It calls the Google Places API via function calling, presents clinics, and can confirm a booking that includes the sensor report and chat thread.

### Past Sessions

Use the **Past Sessions** dropdown in the top bar to reload any previously saved session's report and chart data.

---

## Demo Video

▶️ **Watch the full demo:** [https://www.youtube.com/watch?v=acdo23eFIlc](https://www.youtube.com/watch?v=acdo23eFIlc)

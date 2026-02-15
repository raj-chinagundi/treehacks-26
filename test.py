"""
JawSense Data Hub — Flask server that unifies two real-time sensor streams:

  1. Heart Rate: wearable device POSTs to /data (unchanged from before)
  2. EMG:        ESP32 writes rows to Google Sheets → we poll for new rows

Both are combined into a 10 Hz SSE stream (GET /stream) consumed by Next.js.
"""

from flask import Flask, request, Response
import json
import time
import threading
from collections import deque
import os

app = Flask(__name__)

# ─── Thread-safe shared state ─────────────────────────────────────────────────

latest_hr  = {'bpm': 0.0}
latest_emg = {'value': 0.0}
hr_lock    = threading.Lock()
emg_lock   = threading.Lock()

session_start = time.time()

# SSE clients
clients      = []
clients_lock = threading.Lock()

# ─── Configuration ─────────────────────────────────────────────────────────────

SPREADSHEET_ID = '1GzS2Ayq_pcz_CHOagVSpwCO643_ruCh46IKTFw28oZo'
CREDS_FILE     = os.path.join(os.path.dirname(__file__), 'credentials', 'service-account.json')
SCOPES         = ['https://www.googleapis.com/auth/spreadsheets.readonly']
STREAM_HZ      = 10      # combined stream rate (Hz)
SHEET_POLL_SEC = 1.0     # how often to poll Google Sheets for new rows

# ─── EMG ADC Configuration ────────────────────────────────────────────────────
EMG_COL        = 1                 # Column B (0-indexed) — where ESP32 writes EMG


# ─── CORS ──────────────────────────────────────────────────────────────────────

def add_cors(response):
    response.headers['Access-Control-Allow-Origin']  = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response


@app.after_request
def after_request(response):
    return add_cors(response)


# ─── HR endpoint (wearable POSTs here) ────────────────────────────────────────

@app.route('/data', methods=['POST', 'OPTIONS'])
def data():
    if request.method == 'OPTIONS':
        return '', 204

    body = request.get_json(force=True)
    print(f'[HR] Raw payload: {body}')

    for item in body.get('payload', []):
        if item.get('name') == 'heart rate':
            bpm = item.get('values', {}).get('bpm')
            if bpm is not None:
                with hr_lock:
                    latest_hr['bpm'] = float(bpm)
                print(f'[HR] {bpm} bpm')

    return 'ok'


# ─── Google Sheets EMG Polling ─────────────────────────────────────────────────

def init_sheets():
    """Connect to Google Sheets using service account credentials."""
    try:
        import gspread
        from google.oauth2.service_account import Credentials

        creds = Credentials.from_service_account_file(CREDS_FILE, scopes=SCOPES)
        gc = gspread.authorize(creds)
        spreadsheet = gc.open_by_key(SPREADSHEET_ID)
        return spreadsheet.sheet1
    except Exception as e:
        print(f'[Sheets] Init failed: {e}')
        return None


def parse_cell_float(cell):
    """Safely parse a cell value as a non-negative float."""
    try:
        val = float(str(cell).strip())
        return val if val >= 0 else None
    except (ValueError, TypeError):
        return None


def poll_emg():
    """
    Background thread — polls Google Sheets for new rows written by the ESP32.

    Uses get_all_values() each cycle (avoids the "exceeds grid limits" error
    from range reads past the sheet boundary).  For < 10 k rows this is
    fast enough at 1 req/s and well within Google's 300 reads/min quota.
    """
    worksheet = init_sheets()
    if not worksheet:
        print('[Sheets] ⚠ Could not connect. EMG will remain 0 until Sheets is available.')
        while not worksheet:
            time.sleep(10)
            print('[Sheets] Retrying connection...')
            worksheet = init_sheets()

    row_count = 0

    try:
        all_values = worksheet.get_all_values()
        row_count  = len(all_values)

        headers = all_values[0] if all_values else []
        print(f'[Sheets] ✓ Connected — headers: {headers}')
        print(f'[Sheets]   EMG column: B (index {EMG_COL})')
        print(f'[Sheets]   Rows in sheet: {row_count}')

        # Seed with the most recent row
        if row_count > 1:
            last_row = all_values[-1]
            if EMG_COL < len(last_row):
                raw = parse_cell_float(last_row[EMG_COL])
                if raw is not None:
                    with emg_lock:
                        latest_emg['value'] = raw
                    print(f'[Sheets]   Latest: ADC={raw:.0f}')

    except Exception as e:
        print(f'[Sheets] Initial read error: {e}')

    # ── Poll loop — grab latest row, convert, stream ──
    while True:
        time.sleep(SHEET_POLL_SEC)
        try:
            all_values = worksheet.get_all_values()
            new_count  = len(all_values)

            if new_count > row_count and new_count > 1:
                last_row = all_values[-1]
                if EMG_COL < len(last_row):
                    raw_adc = parse_cell_float(last_row[EMG_COL])
                    if raw_adc is not None:
                        with emg_lock:
                            latest_emg['value'] = raw_adc

                        added = new_count - row_count
                        print(f'[Sheets] +{added} rows → ADC={raw_adc:.0f}  (total: {new_count})')

                row_count = new_count

        except Exception as e:
            print(f'[Sheets] Poll error: {e}')
            time.sleep(5)
            worksheet = init_sheets()
            if worksheet:
                try:
                    all_values = worksheet.get_all_values()
                    row_count  = len(all_values)
                    print(f'[Sheets] ✓ Reconnected (rows: {row_count})')
                except Exception:
                    pass


# ─── 10 Hz Combiner / SSE Streamer ────────────────────────────────────────────

def combine_and_stream():
    """
    Background thread running at STREAM_HZ.
    Reads the latest HR + EMG, packages them as a JSON event,
    and pushes to all connected SSE clients.
    """
    interval = 1.0 / STREAM_HZ

    while True:
        t_ms = int((time.time() - session_start) * 1000)

        with hr_lock:
            bpm = latest_hr['bpm']
        with emg_lock:
            emg = latest_emg['value']

        entry = {
            'bpm': round(bpm, 1),
            'emg': round(emg, 1),   # raw ADC value (not volts)
            't':   t_ms,
        }

        msg = f"data: {json.dumps(entry)}\n\n"

        with clients_lock:
            dead = []
            for q in clients:
                try:
                    q.append(msg)
                except Exception:
                    dead.append(q)
            for q in dead:
                clients.remove(q)

        time.sleep(interval)


# ─── SSE Stream Endpoint ──────────────────────────────────────────────────────

@app.route('/stream')
def stream():
    """SSE endpoint — Next.js opens this to receive real-time sensor data."""
    q = deque(maxlen=200)
    with clients_lock:
        clients.append(q)

    def generate():
        try:
            while True:
                if q:
                    yield q.popleft()
                else:
                    yield ': keepalive\n\n'
                    time.sleep(0.2)
        except GeneratorExit:
            with clients_lock:
                if q in clients:
                    clients.remove(q)

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control':     'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection':        'keep-alive',
        }
    )


# ─── Latest Values ────────────────────────────────────────────────────────────

@app.route('/latest')
def latest():
    """Returns the most recent HR + EMG readings as JSON."""
    with hr_lock:
        bpm = latest_hr['bpm']
    with emg_lock:
        emg = latest_emg['value']
    return json.dumps({'bpm': round(bpm, 1), 'emg': round(emg, 1)})


# ─── Session Reset ────────────────────────────────────────────────────────────

@app.route('/reset', methods=['POST', 'OPTIONS'])
def reset():
    """
    Called by the Next.js dashboard when a new monitoring session starts.
    Resets the internal clock so SSE timestamps start from 0.
    """
    if request.method == 'OPTIONS':
        return '', 204

    global session_start
    session_start = time.time()

    # Don't clear sensor values — we want to keep streaming the latest reading
    print(f'[Flask] Session reset at {session_start}')
    return json.dumps({'status': 'reset', 'time': session_start})


# ─── Startup ──────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print('─────────────────────────────────────────')
    print('  JawSense Data Hub')
    print('─────────────────────────────────────────')
    print(f'  HR input:   POST /data  (from wearable)')
    print(f'  EMG input:  Google Sheets col B (polled every {SHEET_POLL_SEC}s)')
    print(f'  EMG ADC:    12-bit raw (0–4095), streamed as-is')
    print(f'  Output:     GET /stream  (SSE @ {STREAM_HZ} Hz)')
    print(f'  Sheet:      {SPREADSHEET_ID}')
    print('─────────────────────────────────────────')

    # Start EMG polling thread (Google Sheets)
    emg_thread = threading.Thread(target=poll_emg, daemon=True)
    emg_thread.start()

    # Start 10 Hz combiner/streamer thread
    combiner_thread = threading.Thread(target=combine_and_stream, daemon=True)
    combiner_thread.start()

    app.run(host='0.0.0.0', port=5001, threaded=True)

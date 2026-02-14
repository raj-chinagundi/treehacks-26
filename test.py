from flask import Flask, request, Response
import json
import time
import threading
from collections import deque

app = Flask(__name__)

# Thread-safe buffer for latest HR readings
hr_buffer = deque(maxlen=500)
hr_lock = threading.Lock()
# Track connected SSE clients
clients = []
clients_lock = threading.Lock()


def add_cors(response):
    """Add CORS headers to allow Next.js frontend to connect."""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response


@app.after_request
def after_request(response):
    return add_cors(response)


@app.route('/data', methods=['POST', 'OPTIONS'])
def data():
    if request.method == 'OPTIONS':
        return '', 204

    body = request.get_json(force=True)
    print(body)

    # Extract heart rate from payload
    for item in body.get('payload', []):
        if item.get('name') == 'heart rate':
            bpm = item.get('values', {}).get('bpm')
            ts = item.get('time', int(time.time() * 1e9))
            if bpm is not None:
                entry = {'bpm': bpm, 'time': ts}
                with hr_lock:
                    hr_buffer.append(entry)
                # Push to all SSE clients
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

    return 'ok'


@app.route('/stream')
def stream():
    """SSE endpoint — browser connects here to receive real-time HR data."""
    q = deque(maxlen=100)
    with clients_lock:
        clients.append(q)

    def generate():
        try:
            while True:
                if q:
                    yield q.popleft()
                else:
                    # Send keepalive comment every 2s to prevent timeout
                    yield ': keepalive\n\n'
                    time.sleep(0.5)
        except GeneratorExit:
            with clients_lock:
                if q in clients:
                    clients.remove(q)

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        }
    )


@app.route('/latest')
def latest():
    """Returns the most recent HR reading as JSON."""
    with hr_lock:
        if hr_buffer:
            return json.dumps(hr_buffer[-1])
        return json.dumps({'bpm': None, 'time': None})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, threaded=True)

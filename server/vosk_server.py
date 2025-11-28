#!/usr/bin/env python3
"""
Simple VOSK transcription server.

Usage:
  1. Install system deps: sudo apt install python3 python3-venv python3-pip ffmpeg
  2. Create venv and install python deps: pip install flask vosk
  3. Download a VOSK model and set VOSK_MODEL_PATH environment variable or place model in ./model
     e.g., export VOSK_MODEL_PATH=/path/to/vosk-model-small-ru-0.22
  4. Run: python3 server/vosk_server.py

The server accepts POST /transcribe with form file field `file` (audio webm/wav/ogg/mp3) and returns JSON { text: "transcript" }
"""
import os
import tempfile
import subprocess
import wave
import json
from flask import Flask, request, jsonify

try:
    from vosk import Model, KaldiRecognizer
except Exception as e:
    print('VOSK import failed:', e)
    raise

MODEL_PATH = os.environ.get('VOSK_MODEL_PATH', os.path.join(os.path.dirname(__file__), 'model'))
if not os.path.exists(MODEL_PATH):
    raise SystemExit(f'VOSK model not found at {MODEL_PATH}. Set VOSK_MODEL_PATH or place model in server/model')

print('Loading VOSK model from', MODEL_PATH)
model = Model(MODEL_PATH)

app = Flask(__name__)


def convert_to_wav(input_path, output_path, sample_rate=16000):
    # Use ffmpeg to convert input audio to 16k mono PCM wav
    cmd = [
        'ffmpeg', '-y', '-i', input_path,
        '-ar', str(sample_rate), '-ac', '1',
        '-vn', '-f', 'wav', output_path
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError(f'ffmpeg failed: {proc.stderr.decode("utf-8")[:2000]}')


@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'file' not in request.files:
        return jsonify({ 'error': 'file field is required' }), 400
    f = request.files['file']
    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(f.filename)[1] or '.tmp') as tmp:
        f.save(tmp.name)
        tmp_path = tmp.name

    wav_fd, wav_path = tempfile.mkstemp(suffix='.wav')
    os.close(wav_fd)
    try:
        convert_to_wav(tmp_path, wav_path, sample_rate=16000)

        wf = wave.open(wav_path, 'rb')
        rec = KaldiRecognizer(model, wf.getframerate())
        rec.SetWords(True)

        results = []
        while True:
            data = wf.readframes(4000)
            if len(data) == 0:
                break
            if rec.AcceptWaveform(data):
                r = json.loads(rec.Result())
                results.append(r.get('text', ''))
        final = json.loads(rec.FinalResult())
        results.append(final.get('text', ''))
        text = ' '.join([r for r in results if r]).strip()
        return jsonify({ 'text': text })
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        try:
            os.unlink(wav_path)
        except Exception:
            pass


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('VOSK_PORT', 5000)), debug=False)

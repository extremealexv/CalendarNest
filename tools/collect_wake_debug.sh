#!/usr/bin/env bash
# collect_wake_debug.sh
# Run this on the Orange Pi (Linux) to record a short sample, post it to VOSK,
# collect journalctl logs and any renderer.log files, and save everything into
# a timestamped folder for inspection.

set -euo pipefail

# Configurable variables
DURATION=${1:-3}                # seconds to record (default 3)
VOSK_URL=${VOSK_URL:-http://127.0.0.1:5000/transcribe}
OUT_BASE=${OUT_BASE:-"$HOME/famsync-debug"}
NOW_TS=$(date +%Y%m%d_%H%M%S)
OUTDIR="$OUT_BASE/$NOW_TS"
JOURNAL_SECONDS_BEFORE=60
JOURNAL_SECONDS_AFTER=60

mkdir -p "$OUTDIR"
echo "Saving debug output to: $OUTDIR"

which_cmds=(arecord ffmpeg curl jq journalctl find aplay)
for cmd in "${which_cmds[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Warning: $cmd not found. Some steps may fall back or fail." >&2
  fi
done

# 1) Record a short audio sample (mono 16kHz) — prompt user to say the wake word while recording
REC_PATH="$OUTDIR/test_record.wav"
if command -v arecord >/dev/null 2>&1; then
  echo "Please say the wake-word (e.g. 'календарь' or 'Calendar') now. Recording for $DURATION seconds..."
  arecord -f S16_LE -r 16000 -c1 -d "$DURATION" "$REC_PATH" || true
elif command -v ffmpeg >/dev/null 2>&1; then
  echo "arecord not found, using ffmpeg to record from default device..."
  ffmpeg -f alsa -ac 1 -ar 16000 -t "$DURATION" -y -i default "$REC_PATH" || true
else
  echo "No recording tool (arecord/ffmpeg) available. Skipping record step." >&2
fi

if [ -f "$REC_PATH" ]; then
  echo "Recorded sample: $REC_PATH"
  ls -l "$REC_PATH"
else
  echo "No recorded sample available." >&2
fi

# 2) POST recorded file to VOSK server
VOSK_OUT="$OUTDIR/vosk_response.json"
if [ -f "$REC_PATH" ]; then
  echo "Posting recorded sample to VOSK at $VOSK_URL ..."
  if command -v curl >/dev/null 2>&1; then
    curl -s -X POST -F "file=@$REC_PATH" "$VOSK_URL" -o "$VOSK_OUT" || true
    echo "VOSK response saved to $VOSK_OUT"
    if command -v jq >/dev/null 2>&1; then
      echo "VOSK JSON (pretty):"
      jq . "$VOSK_OUT" || cat "$VOSK_OUT"
    else
      cat "$VOSK_OUT"
    fi
  else
    echo "curl not available; cannot POST to VOSK." >&2
  fi
else
  echo "No recording to send to VOSK. You can provide a WAV filename as first arg to the script." >&2
fi

# 3) Capture journalctl logs for time window around now
SINCE_TS="$(date --iso-8601=seconds -d "-$JOURNAL_SECONDS_BEFORE seconds")"
UNTIL_TS="$(date --iso-8601=seconds -d "+$JOURNAL_SECONDS_AFTER seconds")"
JOURNAL_FULL="$OUTDIR/journal_full.log"
JOURNAL_FILTERED="$OUTDIR/journal_filtered.log"

echo "Collecting journalctl from $SINCE_TS to $UNTIL_TS"
# Try to capture system journal — may need sudo
if journalctl --since="$SINCE_TS" --until="$UNTIL_TS" > "$JOURNAL_FULL" 2>/dev/null; then
  echo "Saved full journal to $JOURNAL_FULL"
else
  echo "journalctl read failed without sudo; retrying with sudo..."
  sudo journalctl --since="$SINCE_TS" --until="$UNTIL_TS" > "$JOURNAL_FULL" || true
fi

# Filter for relevant keywords
egrep -i "wakeWord|emitWake|famsync:trigger-voice-search|voiceSearch|renderer-log|gemini-log|recognition error|/transcribe" "$JOURNAL_FULL" > "$JOURNAL_FILTERED" || true
echo "Saved filtered journal to $JOURNAL_FILTERED"

# 4) Try to find renderer.log files (in common app userData locations)
FOUND_RENDERER_LOGS=( )
# Check common config directories
SEARCH_PATHS=("$HOME/.config" "$HOME/.local/share" "/var/log" "/tmp")
for p in "${SEARCH_PATHS[@]}"; do
  if [ -d "$p" ]; then
    while IFS= read -r -d $'\0' file; do
      FOUND_RENDERER_LOGS+=("$file")
    done < <(find "$p" -maxdepth 4 -type f -name renderer.log -print0 2>/dev/null || true)
  fi
done

if [ ${#FOUND_RENDERER_LOGS[@]} -eq 0 ]; then
  echo "No renderer.log found in common locations. You may need to provide its path or search deeper." >&2
else
  echo "Copying renderer.log files to output dir:"
  for f in "${FOUND_RENDERER_LOGS[@]}"; do
    echo " - $f"
    cp -v "$f" "$OUTDIR/" || true
  done
fi

# 5) Gather a quick environment snapshot
echo "Collecting environment info..."
hostname > "$OUTDIR/hostname.txt" 2>/dev/null
uname -a > "$OUTDIR/uname.txt" 2>/dev/null
ps aux | egrep "famsync|AppImage|chromium|chromedriver|chromium-browser" > "$OUTDIR/processes.txt" 2>/dev/null || true

# 6) Summarize results
echo "--- Summary (files saved under $OUTDIR) ---"
ls -lah "$OUTDIR"

echo "To share results, compress the folder:
  tar -czf ${OUTDIR}.tar.gz -C "$(dirname "$OUTDIR")" "$(basename "$OUTDIR")"

Useful next steps:
 - Inspect $VOSK_OUT for a 'text' field (the recognized words).
 - Open $JOURNAL_FILTERED to see wakeWord emits and whether App/MonthView/voiceSearch logs appear.
 - If you see '[wakeWord] emitWake' but no '[App] wake event received', restart the app after applying a short delay to ensure App registers the listener before wake service starts (I can prepare a small patch for that).

Exit status: OK

// voiceSearchService: handles microphone capture (Web Speech API + MediaRecorder fallback)
import { geminiService } from './GeminiService';
import { speak } from './ttsService';
import { googleCalendarService } from './GoogleCalendarService';

const defaultLang = 'ru';

class VoiceSearchService {
  constructor() {
    this.recognition = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }

  // Try to start Web Speech API recognition
  startRecognition({ onResult, onEnd, lang = defaultLang } = {}) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return { supported: false, reason: 'SpeechRecognition API not available' };
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = lang || defaultLang;
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (ev) => {
        const text = (ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || '';
        if (onResult) onResult(text);
      };
      this.recognition.onend = () => {
        if (onEnd) onEnd();
      };
      this.recognition.onerror = (e) => {
        console.warn('[voiceSearch] recognition error', e);
        if (onEnd) onEnd(e);
      };

      this.recognition.start();
      return { supported: true };
    } catch (e) {
      console.warn('Failed to start SpeechRecognition', e);
      return { supported: false, reason: e && e.message };
    }
  }

  stopRecognition() {
    try {
      if (this.recognition) this.recognition.stop();
    } catch (e) {}
  }

  // Fallback: record audio via MediaRecorder and return a Blob
  async recordAudio({ ms = 7000, constraints = { audio: true } } = {}) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Media devices API not available');
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream);
    return new Promise((resolve, reject) => {
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size) this.chunks.push(e.data);
      };
      this.mediaRecorder.onerror = (e) => reject(e.error || e);
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        resolve(blob);
      };
      this.mediaRecorder.start();
      setTimeout(() => {
        try { this.mediaRecorder.stop(); } catch (e) {}
      }, ms);
    });
  }

  // Transcribe a recorded audio blob using local VOSK server
  async transcribeWithServer(blob, serverUrl = 'http://localhost:5000/transcribe') {
    try {
      const fd = new FormData();
      // name the file so server ffmpeg can detect format
      fd.append('file', blob, 'recording.webm');
      const resp = await fetch(serverUrl, { method: 'POST', body: fd });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Transcription server error: ${txt}`);
      }
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      return data.text || '';
    } catch (err) {
      console.error('[voiceSearch] transcribeWithServer failed', err);
      throw err;
    }
  }

  // Given recognized text, ask Gemini and synthesize an answer
  async handleQueryText(text, { events = [], accounts = [], startDate, endDate, lang = defaultLang, onAnswerText, onTtsDone } = {}) {
    try {
      // prefer language code mapped for Gemini service
      // If the user asks for the "next" occurrence (next appointment / when is my next ...),
      // we may need to look further ahead than the currently loaded `events` array.
      const nextQueryRegex = /\b(next|when is my next|next appointment|next .*appointment|when is my)\b/i;
      let effectiveEvents = events || [];

      if (nextQueryRegex.test(text) && accounts && accounts.length) {
        try {
          // Determine a broad future window to search (12 months ahead)
          const now = new Date();
          const lookahead = new Date(now);
          lookahead.setMonth(lookahead.getMonth() + 12);

          // Fetch additional events per account and merge
          const fetched = [];
          for (const acct of accounts) {
            try {
              const evs = await googleCalendarService.getEvents(acct.id, now, lookahead);
              if (evs && evs.length) fetched.push(...evs);
            } catch (e) {
              // ignore per-account failures
              console.warn('[voiceSearch] prefetch events failed for', acct.id, e && e.message);
            }
          }
          if (fetched.length) {
            // Merge de-duplicated by event id
            const map = new Map();
            (effectiveEvents || []).forEach(ev => { if (ev && ev.id) map.set(ev.id, ev); });
            fetched.forEach(ev => { if (ev && ev.id) map.set(ev.id, ev); });
            effectiveEvents = Array.from(map.values());
          }
        } catch (prefErr) {
          console.warn('[voiceSearch] failed to prefetch extended events', prefErr);
        }
      }

      // Detect explicit relative-day requests (today / tomorrow / day after tomorrow)
      const now = new Date();
      const relDayRegex = /\b(today|tomorrow|day after tomorrow|day-after-tomorrow|послезавтра|завтра|сегодня)\b/i;
      const relMatch = text.match(relDayRegex);
      let queryStart = startDate;
      let queryEnd = endDate;

      if (relMatch) {
        const token = (relMatch[0] || '').toLowerCase();
        let offset = 0;
        if (token.includes('tomorrow') || token.includes('завтра')) offset = 1;
        if (token.includes('day after') || token.includes('послезавтра')) offset = 2;
        if (token.includes('today') || token.includes('сегодня')) offset = 0;

        const target = new Date(now);
        target.setDate(now.getDate() + offset);
        target.setHours(0,0,0,0);
        const dayStart = new Date(target);
        const dayEnd = new Date(target);
        dayEnd.setHours(23,59,59,999);

        queryStart = dayStart;
        queryEnd = dayEnd;

        // Prefetch events for the specific day across accounts to ensure we have the right context
        try {
          const fetched = [];
          for (const acct of accounts) {
            try {
              const evs = await googleCalendarService.getEvents(acct.id, queryStart, queryEnd);
              if (evs && evs.length) fetched.push(...evs);
            } catch (e) {
              console.warn('[voiceSearch] prefetch day events failed for', acct.id, e && e.message);
            }
          }
          if (fetched.length) {
            const map = new Map();
            (effectiveEvents || []).forEach(ev => { if (ev && ev.id) map.set(ev.id, ev); });
            fetched.forEach(ev => { if (ev && ev.id) map.set(ev.id, ev); });
            effectiveEvents = Array.from(map.values());
          }
        } catch (e) {
          console.warn('[voiceSearch] failed to prefetch specific day events', e);
        }
      }

      const answer = await geminiService.answerQuery(text, effectiveEvents, accounts, queryStart, queryEnd, { lang });
      const answerText = typeof answer === 'string' ? answer : String(answer);
      if (onAnswerText) onAnswerText(answerText);

      // Use shared TTS helper which handles browser and main-process fallbacks
      try {
        await speak(answerText, lang);
        if (onTtsDone) onTtsDone();
      } catch (ttsErr) {
        console.warn('[voiceSearch] TTS failed', ttsErr);
        if (onTtsDone) onTtsDone(ttsErr);
      }

      return answerText;
    } catch (err) {
      console.error('[voiceSearch] handleQueryText failed', err);
      throw err;
    }
  }
}

export const voiceSearchService = new VoiceSearchService();

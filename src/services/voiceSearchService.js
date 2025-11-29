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
      // First, ask Gemini to interpret the user's query into a strict JSON that
      // contains the date range and keywords to use for searching events.
      let effectiveEvents = events || [];
      let queryStart = startDate;
      let queryEnd = endDate;

      try {
        const now = new Date();
        const interp = await geminiService.interpretQuery(text, now, { lang });
        console.debug('[voiceSearch] interpretQuery result=', interp);

        // If Gemini provided explicit start/end, use them
        if (interp && (interp.startDate || interp.endDate)) {
          if (interp.startDate) queryStart = new Date(interp.startDate + 'T00:00:00');
          if (interp.endDate) queryEnd = new Date(interp.endDate + 'T23:59:59.999');
        }

        // Helper to fetch events for a range across accounts and merge
        const fetchAndMerge = async (s, e) => {
          const fetched = [];
          for (const acct of accounts || []) {
            try {
              const evs = await googleCalendarService.getEvents(acct.id, s, e);
              if (evs && evs.length) fetched.push(...evs);
            } catch (e) {
              console.warn('[voiceSearch] prefetch events failed for', acct.id, e && e.message);
            }
          }
          if (fetched.length) {
            const map = new Map();
            (effectiveEvents || []).forEach(ev => { if (ev && ev.id) map.set(ev.id, ev); });
            fetched.forEach(ev => { if (ev && ev.id) map.set(ev.id, ev); });
            effectiveEvents = Array.from(map.values());
          }
        };

        // Decide behavior based on scope
        if (interp.scope === 'single_day' && interp.startDate) {
          // already set queryStart/queryEnd above
          await fetchAndMerge(queryStart, queryEnd);
        } else if (interp.scope === 'range' && interp.startDate && interp.endDate) {
          await fetchAndMerge(queryStart, queryEnd);
        } else if (interp.scope === 'from_today' || interp.scope === 'next_occurrence') {
          // broad search from today to 12 months to find matches
          const s = new Date(); s.setHours(0,0,0,0);
          const e = new Date(s); e.setMonth(e.getMonth() + 12);
          await fetchAndMerge(s, e);
        } else {
          // If Gemini didn't help, fall back to previous heuristics: relative day or next-appearance
          const nextQueryRegex = /\b(next|when is my next|next appointment|next .*appointment|when is my)\b/i;
          const relDayRegex = /\b(today|tomorrow|day after tomorrow|day-after-tomorrow|послезавтра|завтра|сегодня)\b/i;
          if (nextQueryRegex.test(text)) {
            const s = new Date();
            const e = new Date(s); e.setMonth(e.getMonth() + 12);
            await fetchAndMerge(s, e);
          } else if (relDayRegex.test(text)) {
            const token = (text.match(relDayRegex)[0] || '').toLowerCase();
            let offset = 0;
            if (token.includes('tomorrow') || token.includes('завтра')) offset = 1;
            if (token.includes('day after') || token.includes('послезавтра')) offset = 2;
            const target = new Date(); target.setDate(target.getDate() + offset); target.setHours(0,0,0,0);
            const dayStart = new Date(target);
            const dayEnd = new Date(target); dayEnd.setHours(23,59,59,999);
            queryStart = dayStart; queryEnd = dayEnd;
            await fetchAndMerge(queryStart, queryEnd);
          }
        }

        // If Gemini provided keywords, filter events by them (title or description)
        const kw_en = (interp.keywords_en || []).map(k => String(k).toLowerCase()).filter(Boolean);
        const kw_ru = (interp.keywords_ru || []).map(k => String(k).toLowerCase()).filter(Boolean);
        if ((kw_en.length || kw_ru.length) && effectiveEvents && effectiveEvents.length) {
          const filtered = effectiveEvents.filter(ev => {
            const title = (ev.summary || ev.title || '').toString().toLowerCase();
            const desc = (ev.description || ev.notes || '').toString().toLowerCase();
            for (const k of kw_en) if (title.includes(k) || desc.includes(k)) return true;
            for (const k of kw_ru) if (title.includes(k) || desc.includes(k)) return true;
            return false;
          });
          // For 'next_occurrence' pick the earliest matching event
          if (interp.scope === 'next_occurrence') {
            filtered.sort((a,b) => new Date(a.start?.dateTime || a.start?.date || 0) - new Date(b.start?.dateTime || b.start?.date || 0));
            effectiveEvents = filtered.length ? [filtered[0]] : [];
          } else {
            effectiveEvents = filtered;
          }
        }

      } catch (interpretErr) {
        console.warn('[voiceSearch] interpretQuery failed, falling back to heuristics', interpretErr);
        // fallback preserves existing behavior below
      }

      // Debug log: which exact range we're querying and how many events will be sent to the assistant
      try {
        const qs = queryStart ? (new Date(queryStart)).toISOString() : (startDate ? new Date(startDate).toISOString() : 'none');
        const qe = queryEnd ? (new Date(queryEnd)).toISOString() : (endDate ? new Date(endDate).toISOString() : 'none');
        console.debug('[voiceSearch] queryStart=', qs, 'queryEnd=', qe, 'effectiveEvents=', (effectiveEvents || []).length);
      } catch (dbgErr) {
        console.debug('[voiceSearch] debug log failed', dbgErr);
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

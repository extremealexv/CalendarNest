// voiceSearchService: handles microphone capture (Web Speech API + MediaRecorder fallback)
import { geminiService } from './GeminiService';
import { speak } from './ttsService';
import { googleCalendarService } from './GoogleCalendarService';
import { safeParse, safeFormat } from '../utils/dateUtils';

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

      let interp = null;
      try {
        const now = new Date();
        interp = await geminiService.interpretQuery(text, now, { lang });
        console.debug('[voiceSearch] interpretQuery result=', interp);
        // Also write the interpretation to the main gemini log for easier remote inspection
        try {
          if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.geminiLog === 'function') {
            window.electronAPI.geminiLog(JSON.stringify({ voiceInterpret: interp }, null, 2), 'voiceInterpret');
          }
        } catch (e) { /* ignore */ }

        // If Gemini provided explicit start/end, use them
        if (interp && (interp.startDate || interp.endDate)) {
          if (interp.startDate) {
            const d = safeParse(interp.startDate);
            if (d) { d.setHours(0,0,0,0); queryStart = d; }
          }
          if (interp.endDate) {
            const d2 = safeParse(interp.endDate);
            if (d2) { d2.setHours(23,59,59,999); queryEnd = d2; }
          }
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

        // If Gemini didn't provide explicit start/end but the user asked about
        // 'next week' / 'this week' (or Russian equivalents), compute a precise
        // Monday-Sunday range and use that.
        try {
          const textLower = (text || '').toString().toLowerCase();
          const nextWeekRE = /next week|на следующей неделе|следующая недел|следующей неделе/;
          const thisWeekRE = /this week|на этой неделе|эта недел/;
          if ((!interp.startDate && !interp.endDate) && nextWeekRE.test(textLower)) {
            const now = new Date();
            // compute start of current week (Monday)
            const curMonday = new Date(now);
            curMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
            curMonday.setHours(0,0,0,0);
            const nextMonday = new Date(curMonday);
            nextMonday.setDate(curMonday.getDate() + 7);
            const nextSunday = new Date(nextMonday);
            nextSunday.setDate(nextMonday.getDate() + 6);
            nextSunday.setHours(23,59,59,999);
            queryStart = nextMonday;
            queryEnd = nextSunday;
          } else if ((!interp.startDate && !interp.endDate) && thisWeekRE.test(textLower)) {
            const now = new Date();
            const curMonday = new Date(now);
            curMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
            curMonday.setHours(0,0,0,0);
            const curSunday = new Date(curMonday);
            curSunday.setDate(curMonday.getDate() + 6);
            curSunday.setHours(23,59,59,999);
            queryStart = curMonday;
            queryEnd = curSunday;
          }
        } catch (weekErr) {
          /* ignore */
        }

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

        // After merging fetched events, filter events to the requested date range
        if (queryStart || queryEnd) {
          try {
            const sTs = queryStart ? new Date(queryStart).getTime() : null;
            const eTs = queryEnd ? new Date(queryEnd).getTime() : null;
            effectiveEvents = (effectiveEvents || []).filter(ev => {
              try {
                // all-day event with start.date
                if (ev.start && ev.start.date) {
                  const d = new Date(ev.start.date + 'T00:00:00');
                  const t = d.getTime();
                  if (sTs !== null && t < sTs) return false;
                  if (eTs !== null && t > eTs) return false;
                  return true;
                }
                // timed event with start.dateTime or parsedStart
                const startStr = ev.start && (ev.start.dateTime || ev.start.date);
                const parsed = startStr ? new Date(startStr) : (ev.parsedStart || null);
                if (!parsed) return false;
                const pt = parsed.getTime();
                if (sTs !== null && pt < sTs) return false;
                if (eTs !== null && pt > eTs) return false;
                return true;
              } catch (e) { return false; }
            });
          } catch (filterErr) {
            console.warn('[voiceSearch] date-range filter failed', filterErr);
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

  // Normalize events before sending to the assistant:
      // - For all-day events (Google uses exclusive end date), represent them with a single start date
      //   so the model clearly sees which calendar day they belong to.
  const normalizedEvents = (effectiveEvents || []).map(ev => {
        try {
          const isAllDay = !!(ev.start && ev.start.date && !ev.start.dateTime);
          let out = { ...ev };
          if (isAllDay) {
            // keep Google event object shape: use { date: 'YYYY-MM-DD' }
            const day = ev.start.date;
            // Canonicalize all-day to the start date (Google uses exclusive end dates).
            out = {
              ...out,
              start: { date: day },
              end: { date: day },
              isAllDay: true
            };
            // Force local start/end times for all-day events to cover the full day
            out.localStartDate = day;
            out.localStartTime = '00:00';
            out.localEndDate = day;
            out.localEndTime = '23:59';
          }

          // Add localStart/localEnd fields to avoid model re-interpreting ISO timestamps
          // localStartDate/localEndDate: local calendar date in YYYY-MM-DD
          // localStartTime/localEndTime: local time in HH:mm (24h)
          // localTimezone: the runtime resolved timezone string
          try {
            const tz = Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
            out.localTimezone = tz || null;

            const startStr = ev.start && (ev.start.dateTime || ev.start.date);
            const endStr = ev.end && (ev.end.dateTime || ev.end.date);
            const parseAndFill = (s) => {
              if (!s) return { d: null, t: null };
              const dt = safeParse(s);
              if (!dt) return { d: null, t: null };
              const y = dt.getFullYear();
              const m = String(dt.getMonth() + 1).padStart(2, '0');
              const day = String(dt.getDate()).padStart(2, '0');
              const hh = String(dt.getHours()).padStart(2, '0');
              const mm = String(dt.getMinutes()).padStart(2, '0');
              return { d: `${y}-${m}-${day}`, t: `${hh}:${mm}` };
            };

            const sVals = parseAndFill(startStr);
            const eVals = parseAndFill(endStr);
            // Only overwrite local fields for non-all-day events (we already set all-day above)
            if (!isAllDay) {
              if (sVals.d) out.localStartDate = sVals.d;
              if (sVals.t) out.localStartTime = sVals.t;
              if (eVals.d) out.localEndDate = eVals.d;
              if (eVals.t) out.localEndTime = eVals.t;
            }
          } catch (inner) {
            // ignore local field failures
          }

          return out;
        } catch (e) { /* ignore and return original */ }
        return ev;
      });

      // If this is a single-day query and we already have normalized events,
      // produce a deterministic local summary to avoid model unpredictability.
      if (interp && interp.scope === 'single_day') {
        const n = (normalizedEvents || []).length;
        // If no events, speak an explicit no-plans message for clarity
        if (n === 0) {
          const noneTextRu = (lang && lang.startsWith('ru')) ? 'На завтра планов нет.' : 'You have no plans for tomorrow.';
          if (onAnswerText) onAnswerText(noneTextRu);
          try { await speak(noneTextRu, lang); } catch (e) { /* ignore */ }
          if (onTtsDone) onTtsDone();
          return noneTextRu;
        }

        // Build a short deterministic summary (Russian/English)
        const makeTimeRange = (ev) => {
          if (ev.isAllDay) return (lang && lang.startsWith('ru')) ? 'весь день' : 'all day';
          const s = ev.localStartTime || ev.localStartDate || (ev.start && ev.start.dateTime) || '';
          const e = ev.localEndTime || ev.localEndDate || (ev.end && ev.end.dateTime) || '';
          if (s && e) return (lang && lang.startsWith('ru')) ? `с ${s} до ${e}` : `from ${s} to ${e}`;
          if (s) return (lang && lang.startsWith('ru')) ? `в ${s}` : `at ${s}`;
          return '';
        };

        const header = (lang && lang.startsWith('ru')) ? `На завтра у вас запланировано ${n === 1 ? 'одно событие' : `${n} события`}.` : `You have ${n} events tomorrow.`;
        const parts = [header];
        for (const ev of normalizedEvents) {
          const time = makeTimeRange(ev);
          const title = ev.summary || ev.title || ev.title || '';
          if (lang && lang.startsWith('ru')) {
            parts.push(`${time} — «${title}».`);
          } else {
            parts.push(`${time} - "${title}".`);
          }
        }
        const summaryText = parts.join(' ');
        if (onAnswerText) onAnswerText(summaryText);
        try { await speak(summaryText, lang); } catch (e) { /* ignore */ }
        if (onTtsDone) onTtsDone();
        return summaryText;
      }

      const answer = await geminiService.answerQuery(text, normalizedEvents, accounts, queryStart, queryEnd, { lang });
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

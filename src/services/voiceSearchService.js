// voiceSearchService: handles microphone capture (Web Speech API + MediaRecorder fallback)
import { geminiService } from './GeminiService';
import { speak } from './ttsService';

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
      const answer = await geminiService.answerQuery(text, events, accounts, startDate, endDate, { lang });
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

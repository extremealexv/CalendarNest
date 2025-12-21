// wakeWordService: listens using Web Speech API for a wake word and notifies listeners
const defaultWakeWords = ['calendar', 'календарь', 'календар'];

class WakeWordService {
  constructor() {
    this.recognition = null;
    this.listening = false;
    this.wakeListeners = new Set();
    this.stateListeners = new Set();
    this.wakeWords = defaultWakeWords;
    this.lang = 'en-US';
  }

  addWakeListener(cb) { this.wakeListeners.add(cb); }
  removeWakeListener(cb) { this.wakeListeners.delete(cb); }
  addStateListener(cb) { this.stateListeners.add(cb); }
  removeStateListener(cb) { this.stateListeners.delete(cb); }

  _emitWake(payload) { for (const cb of Array.from(this.wakeListeners)) try { cb(payload); } catch (e) {} }
  _emitState() { for (const cb of Array.from(this.stateListeners)) try { cb(this.listening); } catch (e) {} }

  start({ lang = 'en-US', wakeWords } = {}) {
    if (this.listening) return;
    this.lang = lang || this.lang;
    if (wakeWords && wakeWords.length) this.wakeWords = wakeWords;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[wakeWord] SpeechRecognition API not available');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = this.lang;
      this.recognition.interimResults = true;
      this.recognition.continuous = true;

      let interimTranscript = '';
      this.recognition.onresult = (ev) => {
        let full = '';
        for (let i = ev.resultIndex; i < ev.results.length; ++i) {
          const res = ev.results[i];
          const t = res[0] && res[0].transcript ? res[0].transcript : '';
          if (res.isFinal) full += t + ' ';
          else interimTranscript += t + ' ';
        }
        const text = (full + ' ' + interimTranscript).trim().toLowerCase();
        // check if any wake word appears as a separate token or substring
        if (text) {
          for (const w of this.wakeWords) {
            try {
              if (text.includes(w.toLowerCase())) {
                // emit and clear interim to avoid repeated triggers
                interimTranscript = '';
                this._emitWake({ word: w, text });
                break;
              }
            } catch (e) {}
          }
        }
      };

      this.recognition.onstart = () => { this.listening = true; this._emitState(); };
      this.recognition.onend = () => { this.listening = false; this._emitState();
        // auto-restart for persistence
        try { setTimeout(() => { if (!this.listening) this.start({ lang: this.lang, wakeWords: this.wakeWords }); }, 300); } catch (e) {}
      };
      this.recognition.onerror = (e) => { console.warn('[wakeWord] recognition error', e); };
      try { this.recognition.start(); } catch (e) { console.warn('[wakeWord] start threw', e); }
    } catch (e) {
      console.warn('[wakeWord] failed to start', e);
    }
  }

  stop() {
    try {
      if (this.recognition) {
        try { this.recognition.onresult = null; } catch (e) {}
        try { this.recognition.stop(); } catch (e) {}
        this.recognition = null;
      }
    } catch (e) {}
    this.listening = false;
    this._emitState();
  }
}

export const wakeWordService = new WakeWordService();

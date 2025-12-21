// wakeWordService: listens using Web Speech API for a wake word and notifies listeners
const defaultWakeWords = ['calendar', 'календарь', 'календар'];
// prefer lazy import of voiceSearchService for VOSK fallback
let _voiceSearchService = null;
const getVoiceSearchService = () => {
  try {
    if (!_voiceSearchService) _voiceSearchService = require('./voiceSearchService').voiceSearchService;
    return _voiceSearchService;
  } catch (e) {
    return null;
  }
};

class WakeWordService {
  constructor() {
    this.recognition = null;
    this.listening = false;
    this.wakeListeners = new Set();
    this.stateListeners = new Set();
    this.wakeWords = defaultWakeWords;
    this.lang = 'en-US';
    this._starting = false;
    this._stoppedByUser = false;
    this._usingVoskFallback = false;
    this._voskLoopRunning = false;
  }

  addWakeListener(cb) { this.wakeListeners.add(cb); }
  removeWakeListener(cb) { this.wakeListeners.delete(cb); }
  addStateListener(cb) { this.stateListeners.add(cb); }
  removeStateListener(cb) { this.stateListeners.delete(cb); }

  _emitWake(payload) {
    try {
      if (window && window.electronAPI && typeof window.electronAPI.rendererLog === 'function') {
        try {
          window.electronAPI.rendererLog('[wakeWord] emitWake ' + JSON.stringify(payload));
        } catch (e) {
          // stringify may fail for circular objects
          window.electronAPI.rendererLog('[wakeWord] emitWake');
        }
      }
    } catch (e) {}
    for (const cb of Array.from(this.wakeListeners)) try { cb(payload); } catch (e) {}
  }
  _emitState() { for (const cb of Array.from(this.stateListeners)) try { cb(this.listening); } catch (e) {} }

  start({ lang = 'en-US', wakeWords } = {}) {
    if (this.listening || this._starting) return;
    this.lang = lang || this.lang;
    if (wakeWords && wakeWords.length) this.wakeWords = wakeWords;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[wakeWord] SpeechRecognition API not available');
      return;
    }

    try {
      this._starting = true;
      this._stoppedByUser = false;
      this.recognition = new SpeechRecognition();
      this.recognition.lang = this.lang;
      this.recognition.interimResults = true;
      this.recognition.continuous = true;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (ev) => {
        // build final + interim transcripts for this result event
        let full = '';
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; ++i) {
          const res = ev.results[i];
          const t = res[0] && res[0].transcript ? res[0].transcript : '';
          if (res.isFinal) full += t + ' ';
          else interim += t + ' ';
        }
        const text = (full + ' ' + interim).trim().toLowerCase();
        try {
          if (window && window.electronAPI && typeof window.electronAPI.rendererLog === 'function') {
            window.electronAPI.rendererLog('[wakeWord] onresult text=' + text + ' full=' + full + ' interim=' + interim);
          }
        } catch (e) {}

        if (text) {
          for (const w of this.wakeWords) {
            try {
              const wLower = (w || '').toLowerCase();
              // use word-boundary matching to avoid accidental substring matches
              const esc = wLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
              const pattern = new RegExp('\\b' + esc + '\\b', 'i');
              if (pattern.test(text)) {
                this._emitWake({ word: w, text });
                break;
              }
            } catch (e) {}
          }
        }
      };

      this.recognition.onstart = () => { this._starting = false; this.listening = true; this._emitState(); };
      this.recognition.onend = () => {
        // onend can be raised by the implementation on errors or silence.
        this._starting = false;
        this.listening = false;
        this._emitState();
        // auto-restart only if not explicitly stopped by stop()
        if (!this._stoppedByUser) {
          try { setTimeout(() => { if (!this.listening) this.start({ lang: this.lang, wakeWords: this.wakeWords }); }, 1000); } catch (e) {}
        }
      };

      this.recognition.onerror = (e) => {
        try { console.warn('[wakeWord] recognition error', e && (e.error || e.message || e)); } catch (ex) {}
        try {
          if (window && window.electronAPI && typeof window.electronAPI.rendererLog === 'function') {
            window.electronAPI.rendererLog('[wakeWord] recognition error ' + JSON.stringify({ error: e && e.error, message: e && e.message }));
          }
        } catch (ex) {}
        // If error is network-related, switch to a short VOSK-based polling fallback
        const code = e && (e.error || e.code || (e.message && e.message.toLowerCase()));
        if (code && code.toString().toLowerCase().includes('network')) {
          try {
            if (!this._voskLoopRunning) this._startVoskFallbackLoop();
          } catch (ex) {}
          // stop the speech recog instance to avoid repeated network attempts
          try { this.recognition.stop(); } catch (ex) {}
          return;
        }
        // otherwise, stop and restart with a small backoff to avoid tight error loops
        try { this.recognition.stop(); } catch (ex) {}
        if (!this._stoppedByUser) {
          setTimeout(() => { try { this.start({ lang: this.lang, wakeWords: this.wakeWords }); } catch (ex) {} }, 1500);
        }
      };

      try { this.recognition.start(); } catch (e) { console.warn('[wakeWord] start threw', e); this._starting = false; }
    } catch (e) {
      console.warn('[wakeWord] failed to start', e);
      this._starting = false;
    }
  }

  stop() {
    try {
      this._stoppedByUser = true;
      if (this.recognition) {
        try { this.recognition.onresult = null; } catch (e) {}
        try { this.recognition.onend = null; } catch (e) {}
        try { this.recognition.onerror = null; } catch (e) {}
        try { this.recognition.stop(); } catch (e) {}
        this.recognition = null;
      }
      // stop any running VOSK fallback loop
      this._usingVoskFallback = false;
    } catch (e) {}
    this.listening = false;
    this._emitState();
  }

  async _startVoskFallbackLoop() {
    const svc = getVoiceSearchService();
    if (!svc || typeof svc.recordAudio !== 'function' || typeof svc.transcribeWithServer !== 'function') {
      try { window && window.electronAPI && typeof window.electronAPI.rendererLog === 'function' && window.electronAPI.rendererLog('[wakeWord] VOSK fallback not available'); } catch (e) {}
      return;
    }
    this._voskLoopRunning = true;
    this._usingVoskFallback = true;
    try {
      while (this._usingVoskFallback && !this._stoppedByUser) {
        try {
          // record a short clip (1.2s) to check for wake word
          const blob = await svc.recordAudio({ ms: 1200 });
          // try local VOSK server
          let txt = '';
          try {
            txt = await svc.transcribeWithServer(blob);
          } catch (transErr) {
            try { window && window.electronAPI && typeof window.electronAPI.rendererLog === 'function' && window.electronAPI.rendererLog('[wakeWord] VOSK transcribe failed ' + (transErr && transErr.message || transErr)); } catch (e) {}
          }
          if (txt) {
            try { if (window && window.electronAPI && typeof window.electronAPI.rendererLog === 'function') window.electronAPI.rendererLog('[wakeWord] VOSK onresult text=' + txt); } catch (e) {}
            const text = (txt || '').toString().toLowerCase();
            for (const w of this.wakeWords) {
              try {
                const esc = (w || '').toLowerCase().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const pattern = new RegExp('\\b' + esc + '\\b', 'i');
                if (pattern.test(text)) {
                  this._emitWake({ word: w, text });
                  // after a successful wake, wait a short cooldown before continuing
                  await new Promise(r => setTimeout(r, 1200));
                  break;
                }
              } catch (e) {}
            }
          }
        } catch (recErr) {
          try { window && window.electronAPI && typeof window.electronAPI.rendererLog === 'function' && window.electronAPI.rendererLog('[wakeWord] VOSK record error ' + (recErr && recErr.message || recErr)); } catch (e) {}
        }
        // small pause between polls
        await new Promise(r => setTimeout(r, 300));
      }
    } finally {
      this._voskLoopRunning = false;
      this._usingVoskFallback = false;
    }
  }
}

export const wakeWordService = new WakeWordService();

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

// Simple Levenshtein distance implementation (small strings only)
function levenshtein(a, b) {
  if (!a) return b ? b.length : 0;
  if (!b) return a ? a.length : 0;
  a = String(a);
  b = String(b);
  const al = a.length;
  const bl = b.length;
  const row = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) row[j] = j;
  for (let i = 1; i <= al; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= bl; j++) {
      const tmp = row[j];
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[bl];
}

// lazy storage utils
let _storageUtils = null;
const getStorage = () => {
  try {
    if (!_storageUtils) _storageUtils = require('../utils/storage').storageUtils;
    return _storageUtils;
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
    // Read persisted wake config (if any)
    try {
      const s = getStorage();
      const cfg = s && typeof s.getWakeConfig === 'function' ? s.getWakeConfig() : null;
      if (cfg) {
        this._voskOnly = !!cfg.voskOnly;
        this._voskClipMs = Number(cfg.voskClipMs) || 1600;
        this._extraWakeWords = Array.isArray(cfg.extraWakeWords) ? cfg.extraWakeWords.slice() : [];
        // allow a slightly more tolerant default on embedded devices
        this._fuzzyTolerance = Number(cfg.fuzzyTolerance) || 2;
      } else {
    this._voskOnly = false;
    this._voskClipMs = 1600; // slightly larger clip to capture full wake words
    this._extraWakeWords = [];
    this._fuzzyTolerance = 2; // Levenshtein tolerance (more tolerant by default)
      }
      // merge extra wake words if present
      if (this._extraWakeWords && this._extraWakeWords.length) {
        this.wakeWords = Array.from(new Set([...this.wakeWords, ...this._extraWakeWords]));
      }
    } catch (e) {
  this._voskOnly = false;
  this._voskClipMs = 1600;
  this._extraWakeWords = [];
  this._fuzzyTolerance = 2;
    }
  }

  addWakeListener(cb) { this.wakeListeners.add(cb); }
  removeWakeListener(cb) { this.wakeListeners.delete(cb); }
  addStateListener(cb) { this.stateListeners.add(cb); }
  removeStateListener(cb) { this.stateListeners.delete(cb); }

  _emitWake(payload) {
    try {
      // Log emit and how many registered listeners we have
      try { console.debug('[wakeWord] emitWake payload=', payload, 'listenersCount=', this.wakeListeners ? this.wakeListeners.size : 0); } catch (e) {}
      if (window && window.electronAPI && typeof window.electronAPI.rendererLog === 'function') {
        try {
          window.electronAPI.rendererLog('[wakeWord] emitWake ' + JSON.stringify(payload));
        } catch (e) {
          // stringify may fail for circular objects
          window.electronAPI.rendererLog('[wakeWord] emitWake');
        }
      }
      // Also dispatch the global DOM event here as a fallback so components listening
      // directly on window will receive the wake even if no app-level listener is present.
      try {
        try { window.dispatchEvent(new CustomEvent('famsync:trigger-voice-search', { detail: payload })); } catch (e) { /* ignore */ }
        try { window.dispatchEvent(new Event('famsync:trigger-voice-search')); } catch (e) { /* ignore */ }
      } catch (e) { /* ignore */ }
    } catch (e) {}
    for (const cb of Array.from(this.wakeListeners || [])) {
      try {
        cb(payload);
      } catch (e) {
        try { console.warn('[wakeWord] wake listener threw', e && e.message ? e.message : e); } catch (ex) {}
      }
    }
  }
  _emitState() { for (const cb of Array.from(this.stateListeners)) try { cb(this.listening); } catch (e) {} }

  start({ lang = 'en-US', wakeWords } = {}) {
    if (this.listening || this._starting) return;
    this.lang = lang || this.lang;
    if (wakeWords && wakeWords.length) this.wakeWords = wakeWords;

    // Debug: log start invocation and current configuration
    try {
      const cfgMsg = JSON.stringify({ voskOnly: !!this._voskOnly, voskClipMs: this._voskClipMs, fuzzyTolerance: this._fuzzyTolerance, wakeWords: this.wakeWords.slice(0,10) });
      console.debug('[wakeWord] start called cfg=', cfgMsg);
      if (window && window.electronAPI && typeof window.electronAPI.rendererLog === 'function') window.electronAPI.rendererLog('[wakeWord] start ' + cfgMsg);
    } catch (e) {}

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[wakeWord] SpeechRecognition API not available');
      return;
    }

    try {
      this._starting = true;
      this._stoppedByUser = false;
      // If configured to use VOSK-only, skip SpeechRecognition and start the VOSK loop
      if (this._voskOnly) {
        this._starting = false;
        this._usingVoskFallback = true;
        this._startVoskFallbackLoop().catch(() => {});
        return;
      }

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
          try {
            // Tokenize using Unicode letters so boundaries work for Cyrillic and other scripts
            const tokens = (text.match(/\p{L}+/gu) || []).map(t => t.toLowerCase());
            for (const w of this.wakeWords) {
              try {
                const wLower = (w || '').toLowerCase();
                if (tokens.includes(wLower)) {
                  this._emitWake({ word: w, text });
                  break;
                }
              } catch (e) {}
            }
          } catch (e) {
            // fallback to previous word-boundary regex for environments without Unicode support
            for (const w of this.wakeWords) {
              try {
                const wLower = (w || '').toLowerCase();
                const esc = wLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const pattern = new RegExp('\\b' + esc + '\\b', 'i');
                if (pattern.test(text)) {
                  this._emitWake({ word: w, text });
                  break;
                }
              } catch (e) {}
            }
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
      // persist current voskOnly setting
      try {
        const s = getStorage();
        if (s && typeof s.saveWakeConfig === 'function') {
          s.saveWakeConfig({ voskOnly: !!this._voskOnly, voskClipMs: this._voskClipMs, extraWakeWords: this._extraWakeWords, fuzzyTolerance: this._fuzzyTolerance });
        }
      } catch (e) {}
    } catch (e) {}
    this.listening = false;
    this._emitState();
  }

  // Control API
  setVoskOnly(flag) {
    try { this._voskOnly = !!flag; } catch (e) {}
    try {
      const s = getStorage();
      if (s && typeof s.saveWakeConfig === 'function') {
        s.saveWakeConfig({ voskOnly: !!this._voskOnly, voskClipMs: this._voskClipMs, extraWakeWords: this._extraWakeWords, fuzzyTolerance: this._fuzzyTolerance });
      }
    } catch (e) {}
    // if currently running, restart to apply change
    try {
      this.stop();
      if (this._voskOnly) this._startVoskFallbackLoop().catch(() => {});
      else this.start({ lang: this.lang, wakeWords: this.wakeWords });
    } catch (e) {}
  }

  setVoskClipMs(ms) {
    try { this._voskClipMs = Number(ms) || this._voskClipMs; } catch (e) {}
  }

  addExtraWakeWords(words) {
    try {
      if (!Array.isArray(words)) words = [String(words)];
      this._extraWakeWords = Array.from(new Set([...(this._extraWakeWords || []), ...words.map(w => String(w).toLowerCase())]));
      this.wakeWords = Array.from(new Set([...this.wakeWords, ...this._extraWakeWords]));
      const s = getStorage();
      if (s && typeof s.saveWakeConfig === 'function') s.saveWakeConfig({ voskOnly: !!this._voskOnly, voskClipMs: this._voskClipMs, extraWakeWords: this._extraWakeWords, fuzzyTolerance: this._fuzzyTolerance });
    } catch (e) {}
  }

  setFuzzyTolerance(n) {
    try { this._fuzzyTolerance = Math.max(0, Math.floor(Number(n) || 0)); } catch (e) {}
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
      const msg = '[wakeWord] starting VOSK fallback loop voskClipMs=' + this._voskClipMs + ' wakeWords=' + JSON.stringify(this.wakeWords.slice(0,10));
      console.debug(msg);
      if (window && window.electronAPI && typeof window.electronAPI.rendererLog === 'function') window.electronAPI.rendererLog(msg);
    } catch (e) {}
    try {
      while (this._usingVoskFallback && !this._stoppedByUser) {
        try {
          // record a short clip (1.2s) to check for wake word
          const blob = await svc.recordAudio({ ms: this._voskClipMs });
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
            // Tokenize (Unicode-aware) and perform exact + fuzzy matching
            let matched = false;
            try {
              const tokens = (text.match(/\p{L}+/gu) || []).map(t => t.toLowerCase());
              for (const w of this.wakeWords) {
                try {
                  const wLower = (w || '').toLowerCase();
                  // exact token match
                  if (tokens.includes(wLower)) {
                    this._emitWake({ word: w, text });
                    matched = true;
                    break;
                  }
                  // fuzzy match: check tokens against wake word using Levenshtein distance
                  for (const tok of tokens) {
                    try {
                      const d = levenshtein(tok, wLower);
                      // tolerance: use configured fuzzy tolerance, but scale for short words
                      const tol = this._fuzzyTolerance || 1;
                      const maxAllowed = Math.max(tol, Math.floor(wLower.length * 0.25));
                      if (d <= maxAllowed) {
                        this._emitWake({ word: w, text });
                        matched = true;
                        break;
                      }
                    } catch (e) {}
                  }
                  if (matched) break;
                } catch (e) {}
              }
            } catch (e) {
              // fallback regex-based matching
              for (const w of this.wakeWords) {
                try {
                  const esc = (w || '').toLowerCase().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                  const pattern = new RegExp('\\b' + esc + '\\b', 'i');
                  if (pattern.test(text)) {
                    this._emitWake({ word: w, text });
                    matched = true;
                    break;
                  }
                } catch (e) {}
              }
            }
            if (matched) {
              // after a successful wake, wait a short cooldown before continuing
              try { if (window && window.electronAPI && typeof window.electronAPI.rendererLog === 'function') window.electronAPI.rendererLog('[wakeWord] matched word, text=' + text); } catch (e) {}
              await new Promise(r => setTimeout(r, 1200));
            }
          } else {
            try { if (window && window.electronAPI && typeof window.electronAPI.rendererLog === 'function') window.electronAPI.rendererLog('[wakeWord] VOSK onresult empty'); } catch (e) {}
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

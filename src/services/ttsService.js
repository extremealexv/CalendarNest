// ttsService: unified text-to-speech helper with robust fallbacks
// Tries browser SpeechSynthesis first, falls back to main-process speakText (Electron) and finally to a timed noop.
export async function speak(text, lang = 'en') {
  const safeText = (text || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  const estWords = Math.max(3, safeText.split(/\s+/).length);
  const estMs = Math.max(2000, (estWords / 2) * 1000);

  // Helper final fallback: wait estimated duration
  const waitFallback = () => new Promise((resolve) => setTimeout(resolve, estMs));

  // If browser SpeechSynthesis exists, try it first with a short start watchdog
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    return new Promise((resolve, reject) => {
      try {
        const utter = new SpeechSynthesisUtterance(safeText);
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length) {
          const langPrefix = (lang || 'en').slice(0, 2).toLowerCase();
          const match = voices.find(v => (v.lang || '').toLowerCase().startsWith(langPrefix));
          if (match) utter.voice = match;
          else utter.voice = voices[0];
        }

        let started = false;
        // If onstart doesn't fire within this timeout, assume browser TTS can't play audio and fallback
        // Increased timeout to better tolerate slower embedded engines on SBCs (Orange Pi)
        const startWatchMs = 1500;
        const startTimer = setTimeout(async () => {
          if (!started) {
            console.warn('[ttsService] browser SpeechSynthesis did not start within', startWatchMs, 'ms — falling back');
            // fallback to main-process TTS if available
            try {
              if (window.electronAPI && window.electronAPI.speakText) {
                console.warn('[ttsService] using main-process speakText fallback');
                await window.electronAPI.speakText(safeText, lang);
                return resolve();
              }
              // else final timed fallback
              console.warn('[ttsService] no main-process speakText available — using timed fallback');
              await waitFallback();
              return resolve();
            } catch (err) {
              return reject(err);
            }
          }
        }, startWatchMs);

        utter.onstart = () => { started = true; clearTimeout(startTimer); console.debug('[ttsService] SpeechSynthesis onstart fired'); };
        utter.onend = () => { clearTimeout(startTimer); resolve(); };
        utter.onerror = async (e) => {
          clearTimeout(startTimer);
          try {
            console.warn('[ttsService] SpeechSynthesis error, falling back to main-process', e);
            if (window.electronAPI && window.electronAPI.speakText) {
              await window.electronAPI.speakText(safeText, lang);
              return resolve();
            }
            console.warn('[ttsService] no main-process speakText available after error — using timed fallback');
            return resolve();
          } catch (ex) {
            return reject(ex);
          }
        };

        // Speak (may be silent if no voices/backend available)
        window.speechSynthesis.speak(utter);
      } catch (err) {
        // If constructing or speaking fails, fallback to main-process or timed wait
        (async () => {
          try {
            if (window.electronAPI && window.electronAPI.speakText) {
              await window.electronAPI.speakText(safeText, lang);
              return resolve();
            }
            await waitFallback();
            return resolve();
          } catch (e) {
            return reject(e);
          }
        })();
      }
    });
  }

  // No browser SpeechSynthesis: try main-process TTS
  if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.speakText) {
    try {
      await window.electronAPI.speakText(safeText, lang);
      return;
    } catch (err) {
      // fall through to timed fallback
    }
  }

  // Final fallback: wait estimated duration so UI can show 'speaking' state
  await waitFallback();
}

export default { speak };

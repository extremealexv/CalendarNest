// Lightweight helper to request showing/hiding the on-screen keyboard from any renderer component
export function showKeyboard() {
  try {
    window.dispatchEvent(new CustomEvent('famsync:keyboard', { detail: { visible: true } }));
  } catch (e) {
    console.debug('[keyboardHelper] showKeyboard failed', e);
  }
}

export function hideKeyboard() {
  try {
    window.dispatchEvent(new CustomEvent('famsync:keyboard', { detail: { visible: false } }));
  } catch (e) {
    console.debug('[keyboardHelper] hideKeyboard failed', e);
  }
}

export default { showKeyboard, hideKeyboard };

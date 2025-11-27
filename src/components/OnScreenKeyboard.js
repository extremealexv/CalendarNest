import React from 'react';
import './OnScreenKeyboard.css';

const KEYS = [
  ['1','2','3','4','5','6','7','8','9','0','-','=', 'Back'],
  ['q','w','e','r','t','y','u','i','o','p','[',']','\\'],
  ['a','s','d','f','g','h','j','k','l',';','\'','Enter'],
  ['Shift','z','x','c','v','b','n','m',',','.','/','Shift'],
  ['Space']
];

export default function OnScreenKeyboard({ visible, onClose }) {
  if (!visible) return null;

  const getTarget = () => {
    // prefer stored focused element from App.js, else document.activeElement
    return (window.__famsync_focusedElement && (window.__famsync_focusedElement.tagName)) ? window.__famsync_focusedElement : document.activeElement;
  };

  const sendKey = (key) => {
    const el = getTarget();
    if (!el) return;

    // For inputs and textareas
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (key === 'Back') {
        const start = el.selectionStart || 0;
        const end = el.selectionEnd || 0;
        if (start === end && start > 0) {
          const val = el.value;
          el.value = val.slice(0, start - 1) + val.slice(end);
          el.selectionStart = el.selectionEnd = start - 1;
        } else {
          // delete selection
          const val = el.value;
          el.value = val.slice(0, start) + val.slice(end);
          el.selectionStart = el.selectionEnd = start;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        try { el.focus(); } catch (e) {}
        return;
      }
      if (key === 'Enter') {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
        try { el.focus(); } catch (e) {}
        return;
      }
      if (key === 'Space') {
        const start = el.selectionStart || 0;
        const end = el.selectionEnd || 0;
        const val = el.value;
        el.value = val.slice(0, start) + ' ' + val.slice(end);
        el.selectionStart = el.selectionEnd = start + 1;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        try { el.focus(); } catch (e) {}
        return;
      }
  if (key === 'Shift') return; // noop for now

      // insert character
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const val = el.value;
      el.value = val.slice(0, start) + key + val.slice(end);
      el.selectionStart = el.selectionEnd = start + key.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      try { el.focus(); } catch (e) {}
      return;
    }

    // For contenteditable
    if (el.isContentEditable) {
      if (key === 'Back') {
        document.execCommand('delete');
        return;
      }
      if (key === 'Enter') { document.execCommand('insertHTML', false, '<br/>'); return; }
      if (key === 'Space') { document.execCommand('insertText', false, ' '); return; }
      document.execCommand('insertText', false, key);
      return;
    }
  };

  return (
    <div className="onscreen-kb" role="dialog" aria-label="On-screen keyboard">
      <div className="kb-header">
        <button className="kb-close" onClick={onClose}>✕</button>
      </div>
      <div className="kb-rows">
        {KEYS.map((row, i) => (
          <div className="kb-row" key={`row-${i}`}>
            {row.map((k) => (
              <button
                key={k}
                className={`kb-key kb-key-${k === 'Space' ? 'space' : 'std'}`}
                // prevent the button from taking focus when tapped
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => sendKey(k === 'Back' ? 'Back' : (k === 'Enter' ? 'Enter' : (k === 'Space' ? 'Space' : k)))}
                tabIndex={-1}
              >
                {k}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

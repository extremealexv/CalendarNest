import React, { useState } from 'react';
import './OnScreenKeyboard.css';

const LAYOUTS = {
  en: [
    ['1','2','3','4','5','6','7','8','9','0','-','=', 'Back'],
    ['q','w','e','r','t','y','u','i','o','p','[',']','\\'],
    ['a','s','d','f','g','h','j','k','l',';','\'', 'Enter'],
    ['Shift','z','x','c','v','b','n','m',',','.','/','Shift'],
    ['Space']
  ],
  ru: [
    ['1','2','3','4','5','6','7','8','9','0','-','=', 'Back'],
    ['й','ц','у','к','е','н','г','ш','щ','з','х','ъ','\\'],
    ['ф','ы','в','а','п','р','о','л','д','ж','э','Enter'],
    ['Shift','я','ч','с','м','и','т','ь','б','ю','.','Shift'],
    ['Space']
  ]
};

export default function OnScreenKeyboard({ visible, onClose }) {
  const [shiftActive, setShiftActive] = useState(false);
  const [layout, setLayout] = useState('en');

  if (!visible) return null;

  const getTarget = () => {
    return (window.__famsync_focusedElement && (window.__famsync_focusedElement.tagName)) ? window.__famsync_focusedElement : document.activeElement;
  };

  const applyCharToElement = (el, char) => {
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const val = el.value || '';
      el.value = val.slice(0, start) + char + val.slice(end);
      el.selectionStart = el.selectionEnd = start + char.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      try { el.focus(); } catch (e) {}
      return true;
    }
    if (el.isContentEditable) {
      document.execCommand('insertText', false, char);
      return true;
    }
    return false;
  };

  const sendKey = (rawKey) => {
    const el = getTarget();
    if (!el) return;

    // control keys
    if (rawKey === 'Back') {
      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        const start = el.selectionStart || 0;
        const end = el.selectionEnd || 0;
        const val = el.value || '';
        if (start === end && start > 0) {
          el.value = val.slice(0, start - 1) + val.slice(end);
          el.selectionStart = el.selectionEnd = start - 1;
        } else {
          el.value = val.slice(0, start) + val.slice(end);
          el.selectionStart = el.selectionEnd = start;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        try { el.focus(); } catch (e) {}
      } else if (el.isContentEditable) {
        document.execCommand('delete');
      }
      return;
    }

    if (rawKey === 'Enter') {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
      try { el.focus(); } catch (e) {}
      return;
    }

    if (rawKey === 'Space') {
      applyCharToElement(el, ' ');
      if (shiftActive) setShiftActive(false);
      return;
    }

    if (rawKey === 'Shift') {
      setShiftActive(prev => !prev);
      return;
    }

    // character insertion
    let char = rawKey;
    if (shiftActive && char.length === 1) char = char.toUpperCase();

    applyCharToElement(el, char);
    if (shiftActive) setShiftActive(false);
  };

  const switchLayout = () => {
    setLayout(prev => prev === 'en' ? 'ru' : 'en');
    setShiftActive(false);
  };

  const keys = LAYOUTS[layout] || LAYOUTS.en;

  return (
    <div className="onscreen-kb" role="dialog" aria-label="On-screen keyboard">
      <div className="kb-header">
        <div style={{display:'flex', gap:8}}>
          <button className={`kb-key small ${shiftActive ? 'active' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => setShiftActive(s => !s)} tabIndex={-1}>⇧</button>
          <button className="kb-key small" onMouseDown={(e) => e.preventDefault()} onClick={switchLayout} tabIndex={-1}>{layout === 'en' ? 'EN' : 'RU'}</button>
        </div>
        <button className="kb-close" onClick={onClose}>✕</button>
      </div>
      <div className="kb-rows">
        {keys.map((row, i) => (
          <div className="kb-row" key={`row-${i}`}>
            {row.map((k) => {
              const label = (k.length === 1 && shiftActive) ? k.toUpperCase() : k;
              const isSpace = k === 'Space';
              return (
                <button
                  key={k + i}
                  className={`kb-key kb-key-${isSpace ? 'space' : 'std'} ${k === 'Shift' ? 'kb-shift' : ''} ${shiftActive && k !== 'Shift' ? 'shift-active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => sendKey(k)}
                  tabIndex={-1}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
 

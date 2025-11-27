import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (visible) {
      console.debug('[OnScreenKeyboard] mounted visible=', visible, 'layout=', layout, 'shift=', shiftActive, 'focusedElement=', window.__famsync_focusedElement, 'document.activeElement=', document.activeElement);
      // ensure the focused element (if any) is visible when keyboard appears
      try {
        const target = window.__famsync_focusedElement || document.activeElement;
        if (target && typeof target.scrollIntoView === 'function') {
          setTimeout(() => {
            try {
              target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
              console.debug('[OnScreenKeyboard] scrolled focused element into view', target);
            } catch (e) { console.debug('[OnScreenKeyboard] scrollIntoView failed', e); }
          }, 60);
        }
      } catch (e) {
        console.debug('[OnScreenKeyboard] error while trying to scroll focused element', e);
      }
    } else {
      console.debug('[OnScreenKeyboard] not visible');
    }
  }, [visible]);

  if (!visible) return null;

  const getTarget = () => {
    const t = (window.__famsync_focusedElement && (window.__famsync_focusedElement.tagName)) ? window.__famsync_focusedElement : document.activeElement;
    // Debug: report resolved target
    try { console.debug('[OnScreenKeyboard] getTarget ->', t); } catch (e) {}
    return t;
  };

  const applyCharToElement = (el, char) => {
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      try {
        const start = (typeof el.selectionStart === 'number') ? el.selectionStart : 0;
        const end = (typeof el.selectionEnd === 'number') ? el.selectionEnd : start;
        const val = el.value || '';
        const newVal = val.slice(0, start) + char + val.slice(end);
        // Use native setter so React controlled inputs receive the value change
        try {
          if (el.tagName.toUpperCase() === 'INPUT') {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(el, newVal);
            else el.value = newVal;
          } else {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
            if (setter) setter.call(el, newVal);
            else el.value = newVal;
          }
        } catch (inner) {
          el.value = newVal;
        }
        try { el.setSelectionRange(start + char.length, start + char.length); } catch (e) {}
        const ev = new Event('input', { bubbles: true });
        el.dispatchEvent(ev);
        try { el.focus(); } catch (e) {}
        try { console.debug('[OnScreenKeyboard] applyCharToElement inserted:', JSON.stringify(char), 'into', el, 'newValueLength:', (el.value || '').length); } catch (ex) {}
      } catch (ex) {
        try { console.debug('[OnScreenKeyboard] applyCharToElement error', ex); } catch (e) {}
      }
      return true;
    }
    if (el.isContentEditable) {
      document.execCommand('insertText', false, char);
      try { console.debug('[OnScreenKeyboard] applyCharToElement contentEditable insert:', char); } catch (ex) {}
      return true;
    }
    try { console.debug('[OnScreenKeyboard] applyCharToElement failed — no compatible target', el); } catch (ex) {}
    return false;
  };

  const sendKey = (rawKey) => {
    const el = getTarget();
    console.debug('[OnScreenKeyboard] sendKey ->', rawKey, 'shiftActive=', shiftActive, 'layout=', layout, 'target=', el);
    if (!el) {
      console.debug('[OnScreenKeyboard] sendKey aborted: no target');
      return;
    }

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
      console.debug('[OnScreenKeyboard] Shift toggled ->', !shiftActive);
      return;
    }

    // character insertion
    let char = rawKey;
  if (shiftActive && char.length === 1) char = char.toUpperCase();

    applyCharToElement(el, char);
    if (shiftActive) setShiftActive(false);
  };

  const switchLayout = () => {
    setLayout(prev => {
      const next = prev === 'en' ? 'ru' : 'en';
      console.debug('[OnScreenKeyboard] switchLayout ->', next);
      return next;
    });
    setShiftActive(false);
  };

  const keys = LAYOUTS[layout] || LAYOUTS.en;

  return (
    <div className="onscreen-kb" role="dialog" aria-label="On-screen keyboard">
      <div className="kb-header">
        <div style={{display:'flex', gap:8}}>
          <button
            className={`kb-key small ${shiftActive ? 'active' : ''}`}
            onMouseDown={(e) => { console.debug('[OnScreenKeyboard] header Shift mouseDown'); e.preventDefault(); }}
            onTouchStart={(e) => { console.debug('[OnScreenKeyboard] header Shift touchStart'); e.preventDefault(); }}
            onClick={() => { setShiftActive(s => { console.debug('[OnScreenKeyboard] header Shift click ->', !s); return !s; }); }}
            tabIndex={-1}
          >⇧</button>
          <button
            className="kb-key small"
            onMouseDown={(e) => { console.debug('[OnScreenKeyboard] header Layout mouseDown'); e.preventDefault(); }}
            onTouchStart={(e) => { console.debug('[OnScreenKeyboard] header Layout touchStart'); e.preventDefault(); }}
            onClick={() => { switchLayout(); }}
            tabIndex={-1}
          >{layout === 'en' ? 'EN' : 'RU'}</button>
        </div>
        <button className="kb-close" onClick={() => { console.debug('[OnScreenKeyboard] close clicked'); onClose && onClose(); }}>✕</button>
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
                  onMouseDown={(e) => { try { console.debug('[OnScreenKeyboard] key mouseDown ->', k); } catch (ex) {} e.preventDefault(); }}
                  onTouchStart={(e) => { try { console.debug('[OnScreenKeyboard] key touchStart ->', k); } catch (ex) {} e.preventDefault(); }}
                  onClick={() => { try { console.debug('[OnScreenKeyboard] key click ->', k); } catch (ex) {} sendKey(k); }}
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
 

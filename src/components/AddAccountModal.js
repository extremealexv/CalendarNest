import React, { useState, useRef, useEffect } from 'react';
import AuthScreen from './AuthScreen';
import './AddAccountModal.css';
import { showKeyboard, hideKeyboard } from '../utils/keyboardHelper';

const AddAccountModal = ({ isOpen, onClose, onComplete }) => {
  const [stage, setStage] = useState('auth'); // auth -> nickname
  const [pendingAccount, setPendingAccount] = useState(null);
  const [nickname, setNickname] = useState('');
  const [aliasRu, setAliasRu] = useState('');
  const [aliasEn, setAliasEn] = useState('');
  const nicknameRef = useRef(null);

  const handleAuthenticated = (account) => {
    setPendingAccount(account);
    setStage('nickname');
  };

  const finish = () => {
    if (pendingAccount) {
      onComplete({ ...pendingAccount, nickname: nickname || pendingAccount.name, alias_ru: aliasRu || '', alias_en: aliasEn || '' });
    }
    setPendingAccount(null);
    setNickname('');
    setAliasRu('');
    setAliasEn('');
    setStage('auth');
  };

  useEffect(() => {
    if (stage === 'nickname' && nicknameRef.current) {
      try {
        nicknameRef.current.focus();
        window.__famsync_focusedElement = nicknameRef.current;
        showKeyboard();
      } catch (e) { console.debug('[AddAccountModal] focus nickname failed', e); }
    }
  }, [stage]);

  if (!isOpen) return null;

  return (
    <div className="add-account-modal">
      <div className="modal-content">
        {stage === 'auth' && (
          <div className="auth-wrapper">
            <AuthScreen onAuthenticate={handleAuthenticated} />
          </div>
        )}

        {stage === 'nickname' && (
          <div className="nickname-stage">
            <h2>Choose a nickname</h2>
            <p>Give this account a short name (e.g., "Mom", "Dad", "Kids") and optional aliases for voice input (Russian and English).</p>
            <input
              ref={nicknameRef}
              id="add-account-nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onFocus={() => showKeyboard()}
              onBlur={() => hideKeyboard()}
              placeholder={pendingAccount ? pendingAccount.name : 'Nickname'}
            />
            <input
              id="add-account-alias-ru"
              type="text"
              value={aliasRu}
              onChange={(e) => setAliasRu(e.target.value)}
              onFocus={() => showKeyboard()}
              onBlur={() => hideKeyboard()}
              placeholder="Alias (Russian) e.g. Саша"
              style={{ marginTop: 8 }}
            />
            <input
              id="add-account-alias-en"
              type="text"
              value={aliasEn}
              onChange={(e) => setAliasEn(e.target.value)}
              onFocus={() => showKeyboard()}
              onBlur={() => hideKeyboard()}
              placeholder="Alias (English) e.g. Sasha"
              style={{ marginTop: 8 }}
            />
            <div className="actions">
              <button className="btn" onClick={() => { setStage('auth'); setPendingAccount(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={finish}>Save</button>
            </div>
          </div>
        )}

        <button className="modal-close" onClick={onClose}>✕</button>
      </div>
    </div>
  );
};

export default AddAccountModal;

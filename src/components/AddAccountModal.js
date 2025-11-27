import React, { useState, useRef, useEffect } from 'react';
import AuthScreen from './AuthScreen';
import './AddAccountModal.css';
import { showKeyboard, hideKeyboard } from '../utils/keyboardHelper';

const AddAccountModal = ({ isOpen, onClose, onComplete }) => {
  const [stage, setStage] = useState('auth'); // auth -> nickname
  const [pendingAccount, setPendingAccount] = useState(null);
  const [nickname, setNickname] = useState('');
  const nicknameRef = useRef(null);

  const handleAuthenticated = (account) => {
    setPendingAccount(account);
    setStage('nickname');
  };

  const finish = () => {
    if (pendingAccount) {
      onComplete({ ...pendingAccount, nickname: nickname || pendingAccount.name });
    }
    setPendingAccount(null);
    setNickname('');
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
            <p>Give this account a short name (e.g., "Mom", "Dad", "Kids")</p>
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

import React, { useState } from 'react';
import AuthScreen from './AuthScreen';
import './AddAccountModal.css';

const AddAccountModal = ({ isOpen, onClose, onComplete }) => {
  const [stage, setStage] = useState('auth'); // auth -> nickname
  const [pendingAccount, setPendingAccount] = useState(null);
  const [nickname, setNickname] = useState('');

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
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
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

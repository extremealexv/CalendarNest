import React, { useState, useEffect } from 'react';
import './AccountsManagerModal.css';

const AccountsManagerModal = ({ isOpen, accounts = [], onClose, onSave, onRemove }) => {
  const [local, setLocal] = useState([]);

  useEffect(() => {
    setLocal((accounts || []).map(a => ({ id: a.id, name: a.name, nickname: a.nickname || '', alias_ru: a.alias_ru || '', alias_en: a.alias_en || '', email: a.email || '' })));
  }, [accounts, isOpen]);

  if (!isOpen) return null;

  const updateField = (id, field, value) => {
    setLocal(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  return (
    <div className="accounts-manager-modal">
      <div className="modal-content">
        <h2>Manage Accounts</h2>
        <div className="accounts-list">
          {local.map(acc => (
            <div key={acc.id} className="account-row">
              <div className="left">
                <div className="account-name">{acc.name} <span className="account-email">{acc.email}</span></div>
                <div className="fields">
                  <input type="text" value={acc.nickname} onChange={(e) => updateField(acc.id, 'nickname', e.target.value)} placeholder="Nickname" />
                  <input type="text" value={acc.alias_ru} onChange={(e) => updateField(acc.id, 'alias_ru', e.target.value)} placeholder="Alias (RU) e.g. Саша" />
                  <input type="text" value={acc.alias_en} onChange={(e) => updateField(acc.id, 'alias_en', e.target.value)} placeholder="Alias (EN) e.g. Sasha" />
                </div>
              </div>
              <div className="right">
                <button className="btn btn-small" onClick={() => onSave && onSave(acc.id, { nickname: acc.nickname, alias_ru: acc.alias_ru, alias_en: acc.alias_en })}>Save</button>
                <button className="btn btn-small btn-danger" onClick={() => onRemove && onRemove(acc.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <div className="actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default AccountsManagerModal;

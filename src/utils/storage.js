// Browser storage utilities
const ACCOUNTS_KEY = 'famsync_accounts';
const MIC_KEY = 'famsync_selected_mic';

export const storageUtils = {
  getAccounts() {
    try {
      return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
    } catch (error) {
      console.error('Failed to load accounts from storage:', error);
      return [];
    }
  },

  saveAccounts(accounts) {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
      return true;
    } catch (error) {
      console.error('Failed to save accounts to storage:', error);
      return false;
    }
  },

  updateAccount(accountId, accountData) {
    const accounts = this.getAccounts();
    const updatedAccounts = accounts.map(acc => 
      acc.id === accountId ? { ...acc, ...accountData } : acc
    );
    return this.saveAccounts(updatedAccounts);
  },

  removeAccount(accountId) {
    const accounts = this.getAccounts();
    const updatedAccounts = accounts.filter(acc => acc.id !== accountId);
    return this.saveAccounts(updatedAccounts);
  },

  // Persist selected microphone deviceId so it survives refreshes
  getSelectedMic() {
    try {
      return localStorage.getItem(MIC_KEY) || '';
    } catch (e) {
      console.error('Failed to read selected mic from storage', e);
      return '';
    }
  },

  saveSelectedMic(deviceId) {
    try {
      if (!deviceId) {
        localStorage.removeItem(MIC_KEY);
      } else {
        localStorage.setItem(MIC_KEY, String(deviceId));
      }
      return true;
    } catch (e) {
      console.error('Failed to save selected mic to storage', e);
      return false;
    }
  }
};
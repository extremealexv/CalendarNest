const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openAuthWindow: (args) => ipcRenderer.invoke('open-auth-window', args),
  saveTokens: (accountId, tokens) => ipcRenderer.invoke('save-tokens', { accountId, tokens }),
  getTokens: (accountId) => ipcRenderer.invoke('get-tokens', { accountId }),
  removeTokens: (accountId) => ipcRenderer.invoke('remove-tokens', { accountId }),
  listAccounts: () => ipcRenderer.invoke('list-accounts'),
  exchangeCode: (payload) => ipcRenderer.invoke('exchange-auth-code', payload)
});

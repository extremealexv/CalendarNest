const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openAuthWindow: (args) => ipcRenderer.invoke('open-auth-window', args),
  saveTokens: (accountId, tokens) => ipcRenderer.invoke('save-tokens', { accountId, tokens }),
  saveAccountMeta: (accountId, meta) => ipcRenderer.invoke('save-account-meta', { accountId, meta }),
  getTokens: (accountId) => ipcRenderer.invoke('get-tokens', { accountId }),
  removeTokens: (accountId) => ipcRenderer.invoke('remove-tokens', { accountId }),
  listAccounts: () => ipcRenderer.invoke('list-accounts'),
  exchangeCode: (payload) => ipcRenderer.invoke('exchange-auth-code', payload)
  ,
  // Loopback helpers
  createLoopbackServer: () => ipcRenderer.invoke('create-loopback-server'),
  waitForAuthCode: (serverId) => ipcRenderer.invoke('wait-auth-code', { serverId })
  ,
  refreshAuthToken: (payload) => ipcRenderer.invoke('refresh-auth-token', payload)
  ,
  // speakText accepts (text, lang) where lang is a BCP-47 like 'en' or 'ru'
  speakText: (text, lang = 'en') => ipcRenderer.invoke('speak-text', { text, lang })
});

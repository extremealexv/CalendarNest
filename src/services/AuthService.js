// Authentication Service for FamSync Kiosk
import { googleCalendarService } from './GoogleCalendarService';

class AuthService {
  constructor() {
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    try {
      await googleCalendarService.loadStoredAccounts();
      this.isInitialized = true;
    } catch (err) {
      console.error('Failed to initialize auth service', err);
    }
  }

  async checkExistingAuth() {
    await this.initialize();
    return googleCalendarService.getAccounts();
  }

  // Start PKCE-based auth flow, open auth window via preload API
  async startAuthentication(accountHint = '') {
    await this.initialize();
    try {
      // Use loopback server flow when running inside the Electron kiosk
      if (window.electronAPI && typeof window.electronAPI.createLoopbackServer === 'function') {
        const { authUrl, serverId, codeVerifier, redirectUri } = await googleCalendarService.createAuthWithLoopback(accountHint);

        // Start waiting for the loopback server to receive the auth code
        const waitPromise = (window.electronAPI && typeof window.electronAPI.waitForAuthCode === 'function')
          ? window.electronAPI.waitForAuthCode(serverId)
          : Promise.reject(new Error('No loopback API available'));

        if (window.electronAPI && typeof window.electronAPI.openAuthWindow === 'function') {
            try {
              // Request main process to open an auth popup. Log any errors back to renderer log.
              window.electronAPI.openAuthWindow({ authUrl, serverId }).catch((e) => {
                console.error('openAuthWindow failed', e);
                try { if (window.electronAPI && typeof window.electronAPI.rendererLog === 'function') window.electronAPI.rendererLog('[AuthService] openAuthWindow failed: ' + (e && e.message || String(e))); } catch (ex) {}
              });
            } catch (e) {
              console.error('openAuthWindow invoke thrown', e);
              try { if (window.electronAPI && typeof window.electronAPI.rendererLog === 'function') window.electronAPI.rendererLog('[AuthService] openAuthWindow invoke thrown: ' + (e && e.message || String(e))); } catch (ex) {}
            }
        } else {
          window.open(authUrl, 'google-auth', 'width=600,height=700');
        }

          // Wait for loopback server to receive the auth code, but instrument errors so hangs are visible
          let result;
          try {
            result = await waitPromise;
          } catch (e) {
            console.error('waitForAuthCode failed', e);
            try { if (window.electronAPI && typeof window.electronAPI.rendererLog === 'function') window.electronAPI.rendererLog('[AuthService] waitForAuthCode failed: ' + (e && e.message || String(e))); } catch (ex) {}
            // Hide any OS keyboard that may have been opened for auth
            try { if (window.electronAPI && typeof window.electronAPI.hideOsKeyboard === 'function') window.electronAPI.hideOsKeyboard(); } catch (ex) {}
            throw e;
          }
        if (!result || !result.code) throw new Error('Authentication failed or timed out');

        // Complete auth exchange
        const account = await googleCalendarService.authenticateWithCode(result.code, codeVerifier, redirectUri);
        return account;
      }

      // Fallback for web (mobile browser) - redirect to web auth URL
      const authUrl = await googleCalendarService.getAuthUrl(accountHint);
      // Browser will follow the redirect and eventually return to the configured redirect URI
      window.location.href = authUrl;
      return;
    } catch (err) {
      console.error('startAuthentication error', err);
      throw err;
    }
  }

  async logout(accountId) {
    try {
      googleCalendarService.removeAccount(accountId);
      return true;
    } catch (err) {
      console.error('Logout failed', err);
      throw err;
    }
  }

  async logoutAll() {
    try {
      const accounts = googleCalendarService.getAccounts();
      for (const acc of accounts) await this.logout(acc.id);
      return true;
    } catch (err) {
      console.error('logoutAll failed', err);
      throw err;
    }
  }

  getAuthenticatedAccounts() {
    return googleCalendarService.getAccounts();
  }

  isAuthenticated() {
    return this.getAuthenticatedAccounts().length > 0;
  }

  async refreshTokens(accountId) {
    try {
      return await googleCalendarService.refreshTokenIfNeeded(accountId);
    } catch (err) {
      console.error('refreshTokens failed', err);
      return false;
    }
  }
}

export const authService = new AuthService();
export { AuthService };
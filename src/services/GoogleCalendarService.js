// Google Calendar API Integration using browser-friendly PKCE flow and fetch
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256(buffer) {
  const msgUint8 = new TextEncoder().encode(buffer);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  return new Uint8Array(hashBuffer);
}

class GoogleCalendarService {
  constructor() {
    this.accounts = new Map();
  }

  // PKCE helpers
  async generatePKCECodes() {
    const codeVerifier = this.generateRandomString(128);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64UrlEncode(hashed);
    return { codeVerifier, codeChallenge };
  }

  generateRandomString(length) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, dec => ('0' + dec.toString(16)).slice(-2)).join('');
  }

  // Build auth URL for PKCE
  async getAuthUrl(accountHint = '') {
    // Deprecated: use createAuthWithLoopback for loopback flow
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    const redirectUri = process.env.REACT_APP_GOOGLE_REDIRECT_URI;
    if (!clientId || !redirectUri) throw new Error('Missing Google client configuration');

    const { codeVerifier, codeChallenge } = await this.generatePKCECodes();
    sessionStorage.setItem('famsync_pkce_verifier', codeVerifier);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events profile email',
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      login_hint: accountHint
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  // Create a loopback server and return auth URL + serverId
  async createAuthWithLoopback(accountHint = '') {
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('Missing Google client ID');

    const { serverId, redirectUri } = await window.electronAPI.createLoopbackServer();
    const { codeVerifier, codeChallenge } = await this.generatePKCECodes();
    sessionStorage.setItem('famsync_pkce_verifier', codeVerifier);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events profile email',
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      login_hint: accountHint
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return { authUrl, serverId, codeVerifier, redirectUri };
  }

  // Exchange code for tokens using PKCE
  async exchangeCodeForTokens(code, codeVerifier = null) {
    let verifier = codeVerifier || sessionStorage.getItem('famsync_pkce_verifier');
    if (!verifier) throw new Error('Missing PKCE code verifier');

    if (window.electronAPI && typeof window.electronAPI.exchangeCode === 'function') {
      // Pass the redirectUri that was used by the loopback server so the
      // token endpoint receives a matching redirect_uri parameter.
      const redirectUri = sessionStorage.getItem('famsync_pkce_redirect') || '';
      const result = await window.electronAPI.exchangeCode({ code, codeVerifier: verifier, redirectUri });
      if (!result || !result.success) throw new Error(result.error || 'exchange failed');
      return result.tokens;
    }

    // Fallback to renderer-side exchange (may hit CORS)
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    const redirectUri = process.env.REACT_APP_GOOGLE_REDIRECT_URI;
    const body = new URLSearchParams({
      client_id: clientId,
      code: code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier
    });

    const resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Token exchange failed: ${text}`);
    }

    const tokens = await resp.json();
    return tokens;
  }

  async fetchUserInfo(accessToken) {
    const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!resp.ok) throw new Error('Failed to fetch user info');
    return resp.json();
  }

  // Complete authentication using code (renderer-side PKCE exchange)
  async authenticateWithCode(code, codeVerifier = null) {
    const tokens = await this.exchangeCodeForTokens(code, codeVerifier);
    const userInfo = await this.fetchUserInfo(tokens.access_token);

    const accountData = {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      tokens: tokens,
      authenticatedAt: new Date().toISOString()
    };

    this.accounts.set(accountData.id, accountData);

    // Persist tokens via preload -> main (secure file storage)
    if (window.electronAPI && typeof window.electronAPI.saveTokens === 'function') {
      await window.electronAPI.saveTokens(accountData.id, tokens);
    } else {
      // Fallback to localStorage for web
      const existing = JSON.parse(localStorage.getItem('famsync_accounts') || '[]');
      const updated = existing.filter(a => a.id !== accountData.id);
      updated.push(accountData);
      localStorage.setItem('famsync_accounts', JSON.stringify(updated));
    }

    return accountData;
  }

  // Load stored accounts via preload or localStorage
  async loadStoredAccounts() {
    if (window.electronAPI && typeof window.electronAPI.listAccounts === 'function') {
      const accountIds = await window.electronAPI.listAccounts();
      const accounts = [];
      for (const id of accountIds) {
        const tokens = await window.electronAPI.getTokens(id);
        if (!tokens) continue;
        try {
          const userInfo = await this.fetchUserInfo(tokens.access_token);
          const accountData = {
            id: userInfo.id,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            tokens: tokens,
            authenticatedAt: new Date().toISOString()
          };
          this.accounts.set(id, accountData);
          accounts.push(accountData);
        } catch (err) {
          console.warn('Failed to validate stored token for', id, err);
        }
      }
      return accounts;
    }

    // Web fallback
    const stored = JSON.parse(localStorage.getItem('famsync_accounts') || '[]');
    stored.forEach(acc => this.accounts.set(acc.id, acc));
    return stored;
  }

  // Refresh token using refresh_token grant
  async refreshTokenIfNeeded(accountId) {
    const account = this.accounts.get(accountId);
    if (!account || !account.tokens || !account.tokens.refresh_token) return false;

    // Simple expiry check
    const expiry = account.tokens.expires_in && account.tokens.authenticatedAt
      ? new Date(account.tokens.authenticatedAt).getTime() + (account.tokens.expires_in * 1000)
      : (account.tokens.expiry_date || 0);

    if (expiry && Date.now() < expiry - 60000) return true; // still valid

    const body = new URLSearchParams({
      client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: account.tokens.refresh_token
    });

    const resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!resp.ok) {
      console.warn('Refresh token failed for', accountId);
      return false;
    }

    const newTokens = await resp.json();
    // Merge tokens
    account.tokens = { ...account.tokens, ...newTokens };
    this.accounts.set(accountId, account);

    // Persist updated tokens
    if (window.electronAPI && typeof window.electronAPI.saveTokens === 'function') {
      await window.electronAPI.saveTokens(accountId, account.tokens);
    } else {
      const stored = JSON.parse(localStorage.getItem('famsync_accounts') || '[]');
      const updated = stored.map(a => a.id === accountId ? account : a);
      localStorage.setItem('famsync_accounts', JSON.stringify(updated));
    }

    return true;
  }

  // Call Google Calendar REST API endpoints with access token
  async apiRequest(accountId, path, method = 'GET', body = null, params = {}) {
    await this.refreshTokenIfNeeded(accountId);
    const account = this.accounts.get(accountId);
    if (!account) throw new Error('Account not found');

    const url = new URL(`${CALENDAR_API_BASE}/${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

    const resp = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${account.tokens.access_token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : null
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`API request failed: ${text}`);
    }

    return resp.json();
  }

  async getCalendars(accountId) {
    const data = await this.apiRequest(accountId, 'users/me/calendarList');
    return data.items || [];
  }

  async getEvents(accountId, startDate, endDate) {
    const start = startDate || new Date();
    start.setDate(1);
    const end = endDate || new Date(start);
    end.setMonth(end.getMonth() + 1);

    const calendars = await this.getCalendars(accountId);
    const allEvents = [];

    for (const calendar of calendars) {
      try {
        const data = await this.apiRequest(accountId, `calendars/${encodeURIComponent(calendar.id)}/events`, 'GET', null, {
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '250'
        });

        const events = (data.items || []).map(event => ({
          ...event,
          accountId,
          accountEmail: accountId,
          calendarId: calendar.id,
          calendarName: calendar.summary,
          backgroundColor: calendar.backgroundColor || '#4285f4'
        }));

        allEvents.push(...events);
      } catch (err) {
        console.warn('Failed to fetch events for calendar', calendar.id, err);
      }
    }

    return allEvents;
  }

  async createEvent(eventData) {
    const { accountId, calendarId = 'primary', ...eventDetails } = eventData;
    const data = await this.apiRequest(accountId, `calendars/${encodeURIComponent(calendarId)}/events`, 'POST', eventDetails);
    return data;
  }

  removeAccount(accountId) {
    this.accounts.delete(accountId);
    if (window.electronAPI && typeof window.electronAPI.removeTokens === 'function') {
      window.electronAPI.removeTokens(accountId);
    } else {
      const stored = JSON.parse(localStorage.getItem('famsync_accounts') || '[]');
      const updated = stored.filter(a => a.id !== accountId);
      localStorage.setItem('famsync_accounts', JSON.stringify(updated));
    }
  }

  getAccounts() {
    return Array.from(this.accounts.values());
  }
}

export const googleCalendarService = new GoogleCalendarService();
export { GoogleCalendarService };
// Google Calendar API Integration using browser-friendly PKCE flow and fetch
import { parseISO } from 'date-fns';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256(buffer) {
  // Prefer Web Crypto API when available
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
      const msgUint8 = new TextEncoder().encode(buffer);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      return new Uint8Array(hashBuffer);
    }
  } catch (e) {
    // fall through to JS fallback
  }

  // Fallback: use js-sha256 (returns hex string)
  try {
    const mod = await import('js-sha256');
    const hex = mod.sha256(buffer);
    const bytes = new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h, 16)));
    return bytes;
  } catch (err) {
    throw new Error('No crypto available for PKCE generation');
  }
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
    // Prefer secure RNG when available
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return Array.from(array, dec => ('0' + dec.toString(16)).slice(-2)).join('');
      }
    } catch (e) {
      // fall back to Math.random
    }

    // Fallback (not cryptographically strong) for environments without crypto
    let result = '';
    for (let i = 0; i < length; i++) {
      result += ('0' + (Math.floor(Math.random() * 256)).toString(16)).slice(-2);
    }
    return result;
  }

  // Build auth URL for PKCE
  async getAuthUrl(accountHint = '') {
    // Deprecated: use createAuthWithLoopback for loopback flow
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    const redirectUri = process.env.REACT_APP_GOOGLE_REDIRECT_URI;
    if (!clientId || !redirectUri) throw new Error('Missing Google client configuration');

    const { codeVerifier, codeChallenge } = await this.generatePKCECodes();
    sessionStorage.setItem('famsync_pkce_verifier', codeVerifier);
  // Save the loopback redirect for fallback exchanges that may run in the renderer
  sessionStorage.setItem('famsync_pkce_redirect', redirectUri);

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

    // If running inside Electron with preload APIs, create a loopback server.
    if (window.electronAPI && typeof window.electronAPI.createLoopbackServer === 'function') {
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

    // Web/browser fallback: build an auth URL that uses configured redirect URI.
    const redirectUri = process.env.REACT_APP_GOOGLE_REDIRECT_URI || '';
    const { codeVerifier, codeChallenge } = await this.generatePKCECodes();
    sessionStorage.setItem('famsync_pkce_verifier', codeVerifier);
    // Also save redirect URI for web flow completion
    sessionStorage.setItem('famsync_pkce_redirect', redirectUri);

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
    return { authUrl, serverId: null, codeVerifier, redirectUri };
  }

  // Exchange code for tokens using PKCE
  async exchangeCodeForTokens(code, codeVerifier = null, redirectUri = null) {
    let verifier = codeVerifier || sessionStorage.getItem('famsync_pkce_verifier');
    if (!verifier) throw new Error('Missing PKCE code verifier');

    if (window.electronAPI && typeof window.electronAPI.exchangeCode === 'function') {
      // Pass the redirectUri that was used by the loopback server so the
      // token endpoint receives a matching redirect_uri parameter.
      const result = await window.electronAPI.exchangeCode({ code, codeVerifier: verifier, redirectUri: redirectUri || '' });
      if (!result || !result.success) throw new Error(result.error || 'exchange failed');
      return result.tokens;
    }

    // Fallback to renderer-side exchange (may hit CORS)
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    const finalRedirect = redirectUri || process.env.REACT_APP_GOOGLE_REDIRECT_URI || '';
    const body = new URLSearchParams({
      client_id: clientId,
      code: code,
      redirect_uri: finalRedirect,
      grant_type: 'authorization_code',
      code_verifier: verifier
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
  async authenticateWithCode(code, codeVerifier = null, redirectUri = null) {
    const tokens = await this.exchangeCodeForTokens(code, codeVerifier, redirectUri);
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
        let tokens = await window.electronAPI.getTokens(id);
        if (!tokens) continue;
        try {
          // Try to validate access token; if expired, attempt refresh using refresh_token
          try {
            const userInfo = await this.fetchUserInfo(tokens.access_token);
            const rawMeta = tokens.meta || {};
            const accountData = {
              id: userInfo.id,
              email: userInfo.email,
              name: userInfo.name,
              nickname: rawMeta.nickname || '',
              picture: userInfo.picture,
              tokens: tokens,
              authenticatedAt: new Date().toISOString()
            };
            this.accounts.set(id, accountData);
            accounts.push(accountData);
            continue;
          } catch (errFetch) {
            // If fetch failed due to expired access token, try to refresh
            console.debug('fetchUserInfo failed for stored token, attempting refresh for', id, errFetch && errFetch.message);
            if (tokens.refresh_token) {
              try {
                if (window.electronAPI && typeof window.electronAPI.refreshAuthToken === 'function') {
                  const refreshed = await window.electronAPI.refreshAuthToken({ refreshToken: tokens.refresh_token });
                  if (refreshed && refreshed.success && refreshed.tokens) {
                    tokens = { ...tokens, ...refreshed.tokens };
                    // persist updated tokens
                    try { await window.electronAPI.saveTokens(id, tokens); } catch (e) { console.debug('saveTokens after refresh failed', e); }
                    const userInfo = await this.fetchUserInfo(tokens.access_token);
                    const rawMeta = tokens.meta || {};
                    const accountData = {
                      id: userInfo.id,
                      email: userInfo.email,
                      name: userInfo.name,
                      nickname: rawMeta.nickname || '',
                      picture: userInfo.picture,
                      tokens: tokens,
                      authenticatedAt: new Date().toISOString()
                    };
                    this.accounts.set(id, accountData);
                    accounts.push(accountData);
                    continue;
                  }
                } else {
                  // No main-process refresh available; try client-side refresh flow
                  const body = new URLSearchParams({
                    client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
                    grant_type: 'refresh_token',
                    refresh_token: tokens.refresh_token
                  });
                  const resp = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
                  if (resp.ok) {
                    const newTokens = await resp.json();
                    tokens = { ...tokens, ...newTokens };
                    try { await window.electronAPI.saveTokens(id, tokens); } catch (e) { console.debug('saveTokens after client refresh failed', e); }
                    const userInfo = await this.fetchUserInfo(tokens.access_token);
                    const rawMeta = tokens.meta || {};
                    const accountData = {
                      id: userInfo.id,
                      email: userInfo.email,
                      name: userInfo.name,
                      nickname: rawMeta.nickname || '',
                      picture: userInfo.picture,
                      tokens: tokens,
                      authenticatedAt: new Date().toISOString()
                    };
                    this.accounts.set(id, accountData);
                    accounts.push(accountData);
                    continue;
                  }
                }
              } catch (refreshErr) {
                console.warn('Refresh for stored token failed for', id, refreshErr);
              }
            }
            // if refresh not possible or failed, fall through to skip this account
            console.warn('Failed to validate stored token for', id, errFetch && errFetch.message);
          }
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
    // We store authentication timestamp as account.authenticatedAt (top-level).
    // Some token payloads may include expiry_date; prefer explicit timestamps when available.
    const authTs = account.authenticatedAt || account.tokens.authenticatedAt || null;
    const expiry = (account.tokens.expires_in && authTs)
      ? new Date(authTs).getTime() + (account.tokens.expires_in * 1000)
      : (account.tokens.expiry_date || 0);

    if (expiry && Date.now() < expiry - 60000) return true; // still valid

    const body = new URLSearchParams({
      client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: account.tokens.refresh_token
    });

    // Prefer main-process refresh (handles client_secret and avoids CORS)
    if (window.electronAPI && typeof window.electronAPI.refreshAuthToken === 'function') {
      const result = await window.electronAPI.refreshAuthToken({ refreshToken: account.tokens.refresh_token });
      if (!result || !result.success) {
        console.warn('Refresh token failed for', accountId, 'via main process', result && result.error);
        return false;
      }
      var newTokens = result.tokens;
    } else {
      const resp = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '<no-body>');
        console.warn('Refresh token failed for', accountId, 'status=', resp.status, 'body=', txt);
        return false;
      }

      var newTokens = await resp.json();
    }
    // Merge tokens
    account.tokens = { ...account.tokens, ...newTokens };
    // Update authenticatedAt when we receive new tokens
    account.authenticatedAt = new Date().toISOString();
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
    // Do not mutate caller-provided Date objects — clone when present
    // If caller provided explicit startDate/endDate, use them as-is (local time).
    // Otherwise default to the month window containing today.
    let start;
    let end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else if (startDate && !endDate) {
      // Use provided startDate and default end to end of that day
      start = new Date(startDate);
      end = new Date(start);
      end.setHours(23, 59, 59, 999);
    } else {
      // No explicit range provided — default to the current month
      start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setHours(23, 59, 59, 999);
    }

    const calendars = await this.getCalendars(accountId);
    const allEvents = [];

    for (const calendar of calendars) {
      try {
        // Log which calendar and time range we're requesting for diagnostics
        try {
          if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.geminiLog === 'function') {
            window.electronAPI.geminiLog(JSON.stringify({ getEventsRequest: { accountId, calendarId: calendar.id, timeMin: start.toISOString(), timeMax: end.toISOString() } }, null, 2), 'getEventsRequest');
          }
        } catch (e) { /* ignore logging errors */ }

        const data = await this.apiRequest(accountId, `calendars/${encodeURIComponent(calendar.id)}/events`, 'GET', null, {
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '250'
        });

        // Log number of events returned for this calendar
        try {
          if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.geminiLog === 'function') {
            window.electronAPI.geminiLog(JSON.stringify({ getEventsResultCount: { accountId, calendarId: calendar.id, returned: (data.items || []).length } }, null, 2), 'getEventsResultCount');
          }
        } catch (e) { /* ignore logging */ }

        const acct = this.accounts.get(accountId) || {};
        const events = (data.items || []).map(event => {
          const e = { ...event };

          // Ensure start exists
          e.start = e.start || {};
          e.end = e.end || {};

          // If timed event (dateTime), ensure end.dateTime exists (default +1h)
          if (e.start.dateTime) {
            if (!e.end.dateTime) {
              try {
                const s = new Date(e.start.dateTime);
                const defaultEnd = new Date(s.getTime() + 60 * 60 * 1000);
                e.end.dateTime = defaultEnd.toISOString();
              } catch (err) {
                // fallback: leave as-is
              }
            }
          } else if (e.start.date) {
            // All-day event: ensure end.date exists (default to start)
            if (!e.end.date) {
              e.end.date = e.start.date;
            }
          }

          // Compute canonical parsed dates for renderer
          const parseDate = (v) => {
            if (!v) return null;
            if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
            if (typeof v === 'number') {
              const dn = new Date(v);
              return isNaN(dn.getTime()) ? null : dn;
            }
            if (typeof v === 'string') {
              // Prefer ISO parsing to avoid timezone surprises for date-only strings
              try {
                const iso = parseISO(v);
                if (!isNaN(iso.getTime())) return iso;
              } catch (e) {
                // fall through to Date fallback
              }
              try {
                const d = new Date(v);
                return isNaN(d.getTime()) ? null : d;
              } catch (err) {
                return null;
              }
            }
            return null;
          };

          const parsedStart = parseDate(e.start?.dateTime || e.start?.date);
          let parsedEnd = parseDate(e.end?.dateTime || e.end?.date);
          const allDay = !!(e.start && e.start.date && !e.start.dateTime);

          // Google Calendar's end.date for all-day events is exclusive.
          if (allDay && e.end && e.end.date) {
            try {
              const endDate = new Date(e.end.date);
              // Make inclusive by subtracting 1 millisecond (end of previous day)
              parsedEnd = new Date(endDate.getTime() - 1);
            } catch (err) {
              // fallback leave parsedEnd as-is
            }
          }

          // If timed event and no explicit end, default to +1h
          if (!allDay && parsedStart && !parsedEnd) {
            parsedEnd = new Date(parsedStart.getTime() + 60 * 60 * 1000);
          }

          // Add helpful metadata for renderer
          e.parsedStart = parsedStart;
          e.parsedEnd = parsedEnd || parsedStart;
          e.allDay = allDay;
          e.accountId = accountId;
          e.accountEmail = acct.email || accountId;
          e.calendarId = calendar.id;
          e.calendarName = calendar.summary;
          e.backgroundColor = calendar.backgroundColor || '#4285f4';

          return e;
        });

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

  // Save account metadata (e.g., nickname) into secure store via preload
  async saveAccountMeta(accountId, meta) {
    if (window.electronAPI && typeof window.electronAPI.saveAccountMeta === 'function') {
      const result = await window.electronAPI.saveAccountMeta(accountId, meta);
      if (!result || !result.success) throw new Error(result && result.error);
      // update in-memory copy
      const acc = this.accounts.get(accountId);
      if (acc) {
        acc.nickname = meta.nickname || acc.nickname || '';
        this.accounts.set(accountId, acc);
      }
      return true;
    }
    return false;
  }
}

export const googleCalendarService = new GoogleCalendarService();
export { GoogleCalendarService };
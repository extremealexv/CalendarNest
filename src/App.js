import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

// Import components
import Header from './components/Header';
import CalendarView from './components/CalendarView';
import AuthScreen from './components/AuthScreen';
import LoadingScreen from './components/LoadingScreen';
import AddAccountModal from './components/AddAccountModal';
import OnScreenKeyboard from './components/OnScreenKeyboard';

// Import services
import { googleCalendarService } from './services/GoogleCalendarService';
import { authService } from './services/AuthService';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('month'); // month, week, day
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]);

  useEffect(() => {
    initializeApp();
    // If running in a browser (not Electron) and redirected back with ?code=, complete auth
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && !(window.electronAPI && typeof window.electronAPI.createLoopbackServer === 'function')) {
      (async () => {
        try {
          // retrieve pkce verifier from sessionStorage
          const verifier = sessionStorage.getItem('famsync_pkce_verifier');
          const redirectUri = sessionStorage.getItem('famsync_pkce_redirect') || '';
          const account = await googleCalendarService.authenticateWithCode(code, verifier, redirectUri);
          handleAuthentication(account);
          // clean URL
          params.delete('code');
          const newUrl = window.location.pathname + '?' + params.toString();
          window.history.replaceState({}, '', newUrl);
        } catch (err) {
          console.error('Failed to complete web auth redirect:', err);
        }
      })();
    }
  }, []);

  const initializeApp = async () => {
    try {
      // Initializing FamSync app
      // Check for existing authentication
      const existingAuth = await authService.checkExistingAuth();
  // existing auth check complete
      if (existingAuth && existingAuth.length > 0) {
        setAccounts(existingAuth);
        setIsAuthenticated(true);
        await loadCalendarData(existingAuth);
      } else {
  // no existing authentication
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
    } finally {
  // finished initialization
      setLoading(false);
    }
  };

  const loadCalendarData = async (authenticatedAccounts) => {
    try {
      setLoading(true);
      const allEvents = [];
      
      for (const account of authenticatedAccounts) {
        const accountEvents = await googleCalendarService.getEvents(account.id, selectedDate);
        allEvents.push(...accountEvents);
      }
      
      setEvents(allEvents);
    } catch (error) {
      console.error('Failed to load calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthentication = async (newAccount) => {
    const updatedAccounts = [...accounts, newAccount];
    setAccounts(updatedAccounts);
    setIsAuthenticated(true);
    await loadCalendarData(updatedAccounts);
  };

  const handleLogout = async (accountId) => {
    try {
      await authService.logout(accountId);
      const updatedAccounts = accounts.filter(acc => acc.id !== accountId);
      setAccounts(updatedAccounts);
      
      if (updatedAccounts.length === 0) {
        setIsAuthenticated(false);
        setEvents([]);
      } else {
        await loadCalendarData(updatedAccounts);
      }
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  const handleViewChange = (view) => {
    setCurrentView(view);
  };

  const handleAddAccount = async () => {
    // Open modal which performs auth then asks for nickname
    setShowAddModal(true);
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const onFocusIn = (e) => {
      const t = e.target;
      if (!t) return;
      const tag = (t.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || t.isContentEditable) {
        console.debug('[App] focusin -> target:', t, 'tag:', tag);
        setKeyboardVisible(true);
        // remember last focused element for the on-screen keyboard
        try { window.__famsync_focusedElement = t; } catch (ex) {}
        // also log current activeElement for debugging
        try { console.debug('[App] document.activeElement after focusin:', document.activeElement); } catch (ex) {}
      }
    };
    const onFocusOut = (e) => {
      const t = e.target;
      if (!t) return;
      const tag = (t.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || t.isContentEditable) {
        // small delay to allow next focused element to be detected
        setTimeout(() => {
          // Debug: see what element becomes active after blur
          try { console.debug('[App] focusout -> previous target:', t, 'document.activeElement now:', document.activeElement); } catch (ex) {}
          try {
            const newActive = document.activeElement;
            // if focus moved into the on-screen keyboard, keep it open
            if (newActive && typeof newActive.closest === 'function' && newActive.closest('.onscreen-kb')) {
              console.debug('[App] focus moved into onscreen keyboard; keeping keyboard visible');
              return;
            }
            // if focus moved into another input, update the focused element and keep keyboard open
            const newTag = (newActive && newActive.tagName || '').toLowerCase();
            if (newActive && (newTag === 'input' || newTag === 'textarea' || newActive.isContentEditable)) {
              try { window.__famsync_focusedElement = newActive; } catch (ex) {}
              console.debug('[App] focus moved to another input; updated focusedElement and keeping keyboard');
              return;
            }
          } catch (ex) {
            console.debug('[App] focusout post-check error', ex);
          }
          setKeyboardVisible(false);
          try { window.__famsync_focusedElement = null; } catch (ex) {}
        }, 150);
      }
    };
    const onKeyboardRequest = (ev) => {
      try {
        const visible = !!(ev && ev.detail && ev.detail.visible);
        console.debug('[App] received famsync:keyboard event visible=', visible);
        setKeyboardVisible(visible);
        if (!visible) {
          try { window.__famsync_focusedElement = null; } catch (ex) {}
        }
      } catch (e) {}
    };
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', onFocusOut);
    window.addEventListener('famsync:keyboard', onKeyboardRequest);
    // Global error handlers - surface uncaught errors and promise rejections to main log
    const globalErr = (msg, url, lineNo, colNo, err) => {
      try {
        console.error('[GlobalError]', msg, url, lineNo, colNo, err && err.stack);
        if (window.electronAPI && typeof window.electronAPI.rendererLog === 'function') {
          window.electronAPI.rendererLog(`[GlobalError] ${msg} ${url}:${lineNo}:${colNo} ${err && err.stack ? err.stack : ''}`);
        }
      } catch (e) {}
    };
    const globalRej = (ev) => {
      try {
        console.error('[UnhandledRejection]', ev && ev.reason);
        if (window.electronAPI && typeof window.electronAPI.rendererLog === 'function') {
          window.electronAPI.rendererLog(`[UnhandledRejection] ${ev && ev.reason ? (ev.reason.stack || ev.reason) : String(ev)}`);
        }
      } catch (e) {}
    };
    window.addEventListener('error', (e) => globalErr(e.message, e.filename, e.lineno, e.colno, e.error));
    window.addEventListener('unhandledrejection', globalRej);
    return () => {
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('famsync:keyboard', onKeyboardRequest);
      window.removeEventListener('error', (e) => globalErr(e.message, e.filename, e.lineno, e.colno, e.error));
      window.removeEventListener('unhandledrejection', globalRej);
    };
  }, []);

  const handleAddModalComplete = async (accountWithNickname) => {
    try {
      setShowAddModal(false);
      setLoading(true);
      // accountWithNickname is returned from modal after auth and nickname
      // Persist nickname metadata
      if (accountWithNickname && accountWithNickname.id) {
        await googleCalendarService.saveAccountMeta(accountWithNickname.id, { nickname: accountWithNickname.nickname });
      }
      // Add to UI and reload calendars
      await handleAuthentication(accountWithNickname);
    } catch (err) {
      console.error('Failed to finalize added account', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNickname = async (accountId, nickname) => {
    try {
      setLoading(true);
      await googleCalendarService.saveAccountMeta(accountId, { nickname });
      // update local accounts state
      const updated = accounts.map(acc => acc.id === accountId ? { ...acc, nickname } : acc);
      setAccounts(updated);
    } catch (err) {
      console.error('Failed to save nickname', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (date) => {
    setSelectedDate(date);
    if (isAuthenticated && accounts.length > 0) {
      loadCalendarData(accounts);
    }
  };

  const handleEventCreate = async (eventData) => {
    try {
      const newEvent = await googleCalendarService.createEvent(eventData);
      setEvents([...events, newEvent]);
      return newEvent;
    } catch (error) {
      console.error('Failed to create event:', error);
      throw error;
    }
  };

  // Auto-refresh calendar data every minute while authenticated
  useEffect(() => {
    if (!isAuthenticated || !accounts || accounts.length === 0) return;
    console.debug('[App] starting calendar auto-refresh (60s)');
    const id = setInterval(() => {
      try {
        console.debug('[App] auto-refresh: loading calendar data');
        loadCalendarData(accounts);
      } catch (err) {
        console.error('[App] auto-refresh failed', err);
      }
    }, 60 * 1000);
    return () => {
      clearInterval(id);
      console.debug('[App] stopped calendar auto-refresh');
    };
  }, [isAuthenticated, accounts, selectedDate]);

  // App render

  if (loading) {
    console.log('Rendering LoadingScreen');
    return <LoadingScreen />;
  }
  if (!isAuthenticated) {
    return (
      <div className="app" style={{ minHeight: '100vh' }}>
        <AuthScreen onAuthenticate={handleAuthentication} />
      </div>
    );
  }

  return (
    <div className="app" style={{ minHeight: '100vh' }}>
      <Header
        accounts={accounts}
        onLogout={handleLogout}
        onViewChange={handleViewChange}
        onAddAccount={handleAddAccount}
        onSaveNickname={handleSaveNickname}
        currentView={currentView}
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
      />
      {showAddModal && (
        <AddAccountModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onComplete={handleAddModalComplete}
        />
      )}
      <div className="main-content" style={{ padding: '16px' }}>
        <CalendarView
          view={currentView}
          events={events}
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
          onEventCreate={handleEventCreate}
          accounts={accounts}
        />
      </div>
      <OnScreenKeyboard visible={keyboardVisible} onClose={() => setKeyboardVisible(false)} />
    </div>
  );
}

export default App;
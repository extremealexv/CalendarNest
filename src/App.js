import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

// Import components
import Header from './components/Header';
import CalendarView from './components/CalendarView';
import AuthScreen from './components/AuthScreen';
import LoadingScreen from './components/LoadingScreen';
import AddAccountModal from './components/AddAccountModal';

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
    </div>
  );
}

export default App;
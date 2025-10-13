import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

// Import components
import Header from './components/Header';
import CalendarView from './components/CalendarView';
import AuthScreen from './components/AuthScreen';
import LoadingScreen from './components/LoadingScreen';

// Import services
import { GoogleCalendarService } from './services/GoogleCalendarService';
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
      console.log('Initializing FamSync app...');
      // Check for existing authentication
      const existingAuth = await authService.checkExistingAuth();
      console.log('Existing auth check complete:', existingAuth);
      if (existingAuth && existingAuth.length > 0) {
        setAccounts(existingAuth);
        setIsAuthenticated(true);
        await loadCalendarData(existingAuth);
      } else {
        console.log('No existing authentication found');
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
    } finally {
      console.log('Setting loading to false');
      setLoading(false);
    }
  };

  const loadCalendarData = async (authenticatedAccounts) => {
    try {
      setLoading(true);
      const allEvents = [];
      
      for (const account of authenticatedAccounts) {
        const accountEvents = await GoogleCalendarService.getEvents(account.id, selectedDate);
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

  const handleDateChange = (date) => {
    setSelectedDate(date);
    if (isAuthenticated && accounts.length > 0) {
      loadCalendarData(accounts);
    }
  };

  const handleEventCreate = async (eventData) => {
    try {
      const newEvent = await GoogleCalendarService.createEvent(eventData);
      setEvents([...events, newEvent]);
      return newEvent;
    } catch (error) {
      console.error('Failed to create event:', error);
      throw error;
    }
  };

  console.log('App render - loading:', loading, 'isAuthenticated:', isAuthenticated, 'accounts:', accounts.length);

  if (loading) {
    console.log('Rendering LoadingScreen');
    return <LoadingScreen />;
  }

  return (
    <div className="app" style={{ backgroundColor: 'red', minHeight: '100vh' }}>
      <div style={{ position: 'absolute', top: '10px', left: '10px', color: 'white', backgroundColor: 'black', padding: '10px', zIndex: 9999 }}>
        Debug: Auth={isAuthenticated ? 'YES' : 'NO'}, Accounts={accounts.length}, Loading={loading ? 'YES' : 'NO'}
      </div>
      <Router>
        <Routes>
          <Route 
            path="/auth" 
            element={
              !isAuthenticated ? (
                <>
                  {console.log('Rendering AuthScreen')}
                  <AuthScreen onAuthenticate={handleAuthentication} />
                </>
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/" 
            element={
              isAuthenticated ? (
                <>
                  {console.log('Rendering Calendar View')}
                  <Header 
                    accounts={accounts}
                    currentView={currentView}
                    onViewChange={handleViewChange}
                    onLogout={handleLogout}
                    selectedDate={selectedDate}
                    onDateChange={handleDateChange}
                  />
                  <CalendarView
                    view={currentView}
                    events={events}
                    selectedDate={selectedDate}
                    onDateChange={handleDateChange}
                    onEventCreate={handleEventCreate}
                    accounts={accounts}
                  />
                </>
              ) : (
                <>
                  {console.log('Redirecting to /auth')}
                  <Navigate to="/auth" replace />
                </>
              )
            }
          />
        </Routes>
      </Router>
    </div>
  );
}

export default App;
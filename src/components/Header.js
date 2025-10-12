import React from 'react';
import { format } from 'date-fns';
import './Header.css';

const Header = ({ 
  accounts, 
  currentView, 
  onViewChange, 
  onLogout, 
  selectedDate, 
  onDateChange 
}) => {
  const handleDateNavigation = (direction) => {
    const newDate = new Date(selectedDate);
    
    switch (currentView) {
      case 'day':
        newDate.setDate(newDate.getDate() + direction);
        break;
      case 'week':
        newDate.setDate(newDate.getDate() + (direction * 7));
        break;
      case 'month':
        newDate.setMonth(newDate.getMonth() + direction);
        break;
      default:
        break;
    }
    
    onDateChange(newDate);
  };

  const goToToday = () => {
    onDateChange(new Date());
  };

  const formatHeaderDate = () => {
    switch (currentView) {
      case 'day':
        return format(selectedDate, 'EEEE, MMMM d, yyyy');
      case 'week':
        const weekStart = new Date(selectedDate);
        weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
      case 'month':
        return format(selectedDate, 'MMMM yyyy');
      default:
        return format(selectedDate, 'MMMM yyyy');
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="app-title">FamSync</h1>
        <div className="accounts-info">
          <span className="accounts-count">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} connected
          </span>
        </div>
      </div>

      <div className="header-center">
        <div className="date-navigation">
          <button 
            className="btn nav-btn" 
            onClick={() => handleDateNavigation(-1)}
            title={`Previous ${currentView}`}
          >
            ← 
          </button>
          
          <div className="current-date" onClick={goToToday}>
            <span className="date-text">{formatHeaderDate()}</span>
            <span className="today-hint">Click for today</span>
          </div>
          
          <button 
            className="btn nav-btn" 
            onClick={() => handleDateNavigation(1)}
            title={`Next ${currentView}`}
          >
            →
          </button>
        </div>
      </div>

      <div className="header-right">
        <div className="view-switcher">
          <button
            className={`btn view-btn ${currentView === 'day' ? 'active' : ''}`}
            onClick={() => onViewChange('day')}
          >
            Day
          </button>
          <button
            className={`btn view-btn ${currentView === 'week' ? 'active' : ''}`}
            onClick={() => onViewChange('week')}
          >
            Week
          </button>
          <button
            className={`btn view-btn ${currentView === 'month' ? 'active' : ''}`}
            onClick={() => onViewChange('month')}
          >
            Month
          </button>
        </div>

        <div className="account-actions">
          <div className="accounts-dropdown">
            <button className="btn account-btn">
              <span className="account-icon">👥</span>
              Accounts
            </button>
            <div className="dropdown-content">
              {accounts.map(account => (
                <div key={account.id} className="account-item">
                  <div className="account-info">
                    <img 
                      src={account.picture} 
                      alt={account.name}
                      className="account-avatar"
                    />
                    <div className="account-details">
                      <span className="account-name">{account.name}</span>
                      <span className="account-email">{account.email}</span>
                    </div>
                  </div>
                  <button 
                    className="btn btn-small btn-danger"
                    onClick={() => onLogout(account.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="dropdown-divider"></div>
              <button className="btn btn-secondary add-account-btn">
                + Add Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
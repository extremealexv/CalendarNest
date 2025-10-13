import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import './EventModal.css';

const EventModal = ({
  isOpen,
  onClose,
  onEventCreate,
  selectedTimeSlot,
  editingEvent,
  accounts
}) => {
  const [eventData, setEventData] = useState({
    title: '',
    description: '',
    location: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    isAllDay: false,
    accountId: '',
    participants: [],
    reminders: [15]
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (selectedTimeSlot && !editingEvent) {
      // New event from time slot click
      const dateStr = format(selectedTimeSlot.date, 'yyyy-MM-dd');
      setEventData({
        title: '',
        description: '',
        location: '',
        startDate: dateStr,
        startTime: selectedTimeSlot.time || '09:00',
        endDate: dateStr,
        endTime: selectedTimeSlot.time ? 
          format(new Date(`2000-01-01 ${selectedTimeSlot.time}`).getTime() + 60*60*1000, 'HH:mm') : 
          '10:00',
        isAllDay: false,
        accountId: accounts[0]?.id || '',
        participants: [],
        reminders: [15]
      });
    } else if (editingEvent) {
      // Editing existing event
      const startDate = new Date(editingEvent.start?.dateTime || editingEvent.start?.date);
      const endDate = new Date(editingEvent.end?.dateTime || editingEvent.end?.date);
      
      setEventData({
        title: editingEvent.summary || editingEvent.title || '',
        description: editingEvent.description || '',
        location: editingEvent.location || '',
        startDate: format(startDate, 'yyyy-MM-dd'),
        startTime: editingEvent.start?.dateTime ? format(startDate, 'HH:mm') : '',
        endDate: format(endDate, 'yyyy-MM-dd'),
        endTime: editingEvent.end?.dateTime ? format(endDate, 'HH:mm') : '',
        isAllDay: !editingEvent.start?.dateTime,
        accountId: editingEvent.accountId || accounts[0]?.id || '',
        participants: editingEvent.participants || [],
        reminders: editingEvent.reminders || [15]
      });
    }
  }, [selectedTimeSlot, editingEvent, accounts]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validate required fields
      if (!eventData.title.trim()) {
        throw new Error('Event title is required');
      }
      if (!eventData.accountId) {
        throw new Error('Please select an account');
      }

      // Prepare event data for Google Calendar API
      const googleEventData = {
        summary: eventData.title,
        description: eventData.description,
        location: eventData.location,
        accountId: eventData.accountId,
        calendarId: 'primary' // Default calendar
      };

      if (eventData.isAllDay) {
        googleEventData.start = { date: eventData.startDate };
        googleEventData.end = { date: eventData.endDate };
      } else {
        googleEventData.start = { 
          dateTime: `${eventData.startDate}T${eventData.startTime}:00`,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
        googleEventData.end = { 
          dateTime: `${eventData.endDate}T${eventData.endTime}:00`,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
      }

      // Add reminders
      if (eventData.reminders.length > 0) {
        googleEventData.reminders = {
          useDefault: false,
          overrides: eventData.reminders.map(minutes => ({
            method: 'popup',
            minutes: minutes
          }))
        };
      }

      await onEventCreate(googleEventData);
      
    } catch (error) {
      console.error('Event creation failed:', error);
      setError(error.message || 'Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setEventData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const toggleParticipant = (accountId) => {
    setEventData(prev => ({
      ...prev,
      participants: prev.participants.includes(accountId)
        ? prev.participants.filter(id => id !== accountId)
        : [...prev.participants, accountId]
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingEvent ? 'Edit Event' : 'Create New Event'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && (
          <div className="error-alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="event-form">
          <div className="form-group">
            <label>Event Title *</label>
            <input
              type="text"
              value={eventData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="Enter event title"
              required
            />
          </div>

          <div className="form-group">
            <label>Account *</label>
            <select
              value={eventData.accountId}
              onChange={(e) => handleInputChange('accountId', e.target.value)}
              required
            >
              <option value="">Select account</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.email})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={eventData.isAllDay}
                onChange={(e) => handleInputChange('isAllDay', e.target.checked)}
              />
              All day event
            </label>
          </div>

          <div className="date-time-row">
            <div className="form-group">
              <label>Start Date</label>
              <input
                type="date"
                value={eventData.startDate}
                onChange={(e) => handleInputChange('startDate', e.target.value)}
                required
              />
            </div>

            {!eventData.isAllDay && (
              <div className="form-group">
                <label>Start Time</label>
                <input
                  type="time"
                  value={eventData.startTime}
                  onChange={(e) => handleInputChange('startTime', e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          <div className="date-time-row">
            <div className="form-group">
              <label>End Date</label>
              <input
                type="date"
                value={eventData.endDate}
                onChange={(e) => handleInputChange('endDate', e.target.value)}
                required
              />
            </div>

            {!eventData.isAllDay && (
              <div className="form-group">
                <label>End Time</label>
                <input
                  type="time"
                  value={eventData.endTime}
                  onChange={(e) => handleInputChange('endTime', e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={eventData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Event description (optional)"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>Location</label>
            <input
              type="text"
              value={eventData.location}
              onChange={(e) => handleInputChange('location', e.target.value)}
              placeholder="Event location (optional)"
            />
          </div>

          {accounts.length > 1 && (
            <div className="form-group">
              <label>Notify Other Family Members</label>
              <div className="participant-selector">
                {accounts.filter(acc => acc.id !== eventData.accountId).map(account => (
                  <button
                    key={account.id}
                    type="button"
                    className={`participant-chip ${
                      eventData.participants.includes(account.id) ? 'selected' : ''
                    }`}
                    onClick={() => toggleParticipant(account.id)}
                  >
                    {account.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : (editingEvent ? 'Update Event' : 'Create Event')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EventModal;
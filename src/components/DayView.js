import React from 'react';
import { addHours, isSameDay, isToday } from 'date-fns';
import { safeFormat, safeParse } from '../utils/dateUtils';
import './DayView.css';

const DayView = ({ 
  events, 
  selectedDate, 
  onDateChange, 
  onTimeSlotClick, 
  onEventClick, 
  accounts 
}) => {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  const parsedSelected = safeParse(selectedDate) || new Date();

  const dayEvents = events.filter(event => {
    const eventStart = safeParse(event.start?.dateTime || event.start?.date);
    if (!eventStart) return false;
    return isSameDay(eventStart, parsedSelected);
  });

  const getAllDayEvents = () => {
    return dayEvents.filter(event => 
      event.start?.date && !event.start?.dateTime
    );
  };

  const getTimedEvents = () => {
    return dayEvents.filter(event => 
      event.start?.dateTime
    );
  };

  const getEventsForHour = (hour) => {
    return getTimedEvents().filter(event => {
      const eventStart = safeParse(event.start.dateTime);
      const eventEnd = safeParse(event.end.dateTime);
      if (!eventStart || !eventEnd) return false;
      return eventStart.getHours() <= hour && eventEnd.getHours() > hour;
    });
  };

  const renderHeader = () => {
    return (
      <div className="day-header">
        <div className="day-title">
          <h2 className="day-name">{safeFormat(parsedSelected, 'EEEE', '')}</h2>
          <h3 className="day-date">{safeFormat(parsedSelected, 'MMMM d, yyyy', '')}</h3>
          {isToday(parsedSelected) && <span className="today-badge">Today</span>}
        </div>
      </div>
    );
  };

  const renderAllDayEvents = () => {
    const allDayEvents = getAllDayEvents();
    
    if (allDayEvents.length === 0) return null;

    return (
      <div className="all-day-section">
        <div className="all-day-label">All Day</div>
        <div className="all-day-events">
          {allDayEvents.map((event, index) => {
            const accountIndex = accounts.findIndex(acc => acc.id === event.accountId);
            return (
              <div
                key={index}
                className={`all-day-event event-account-${(accountIndex % 6) + 1}`}
                onClick={() => onEventClick(event)}
                title={`${event.summary || event.title} - ${event.accountName || 'Unknown'}`}
              >
                <span className="all-day-event-title">
                  {event.summary || event.title || 'Untitled Event'}
                </span>
                <span className="all-day-event-account">
                  {event.accountName || event.accountEmail}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTimeSlots = () => {
    return hours.map(hour => {
    const timeLabel = safeFormat(addHours(new Date().setHours(hour, 0, 0, 0), 0), 'HH:mm', '');
      const hourEvents = getEventsForHour(hour);
      
      return (
        <div key={hour} className="day-time-slot">
          <div className="time-label">{timeLabel}</div>
          <div 
            className="time-content"
            onClick={() => onTimeSlotClick(selectedDate, timeLabel)}
          >
            {hourEvents.map((event, index) => {
              const accountIndex = accounts.findIndex(acc => acc.id === event.accountId);
              const startTime = safeParse(event.start.dateTime);
              const endTime = safeParse(event.end.dateTime);
              if (!startTime || !endTime) return null;
              const duration = (endTime - startTime) / (1000 * 60); // minutes
              
              return (
                <div
                  key={index}
                  className={`day-event event-account-${(accountIndex % 6) + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(event);
                  }}
                  title={`${event.summary || event.title} - ${event.accountName || 'Unknown'}`}
                  style={{
                    height: Math.max(30, (duration / 60) * 60) + 'px' // Minimum 30px height
                  }}
                >
                  <div className="day-event-time">
                    {safeFormat(startTime, 'HH:mm', '')} - {safeFormat(endTime, 'HH:mm', '')}
                  </div>
                  <div className="day-event-title">
                    {event.summary || event.title || 'Untitled Event'}
                  </div>
                  <div className="day-event-details">
                    {event.location && (
                      <span className="event-location">📍 {event.location}</span>
                    )}
                    <span className="event-account">
                      {event.accountName || event.accountEmail}
                    </span>
                  </div>
                </div>
              );
            })}
            {hourEvents.length === 0 && (
              <div className="empty-slot-hint">
                Click to add event at {timeLabel}
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="day-view">
      {renderHeader()}
      {renderAllDayEvents()}
      <div className="day-schedule">
        {renderTimeSlots()}
      </div>
    </div>
  );
};

export default DayView;
import React from 'react';
import { startOfWeek, addDays, addHours, isSameDay, isToday } from 'date-fns';
import { safeFormat, safeParse } from '../utils/dateUtils';
import './WeekView.css';

const WeekView = ({ 
  events, 
  selectedDate, 
  onDateChange, 
  onTimeSlotClick, 
  onEventClick, 
  accounts 
}) => {
  const weekStart = startOfWeek(selectedDate);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const renderHeader = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      days.push(
        <div 
          key={i} 
          className={`week-header-day ${isSameDay(day, selectedDate) ? 'selected' : ''} ${isToday(day) ? 'today' : ''}`}
          onClick={() => onDateChange(day)}
        >
          <div className="day-name">{safeFormat(day, 'EEE', '')}</div>
          <div className="day-date">{safeFormat(day, 'd', '')}</div>
        </div>
      );
    }

    return (
      <div className="week-header">
        <div className="time-column-header">Time</div>
        {days}
      </div>
    );
  };

  const getEventsForTimeSlot = (day, hour) => {
    return events.filter(event => {
      const eventStart = safeParse(event.start?.dateTime || event.start?.date);
      const eventEnd = safeParse(event.end?.dateTime || event.end?.date);

      if (!eventStart || !eventEnd) return false;

      if (event.start?.date && !event.start?.dateTime) {
        // All-day event
        return isSameDay(eventStart, day);
      }

      return isSameDay(eventStart, day) && 
             eventStart.getHours() <= hour && 
             eventEnd.getHours() > hour;
    });
  };

  const renderTimeSlots = () => {
    return hours.map(hour => {
    const timeLabel = safeFormat(addHours(new Date().setHours(hour, 0, 0, 0), 0), 'HH:mm', '');
      
      return (
        <div key={hour} className="week-time-row">
          <div className="time-label">{timeLabel}</div>
          {Array.from({ length: 7 }, (_, dayIndex) => {
            const day = addDays(weekStart, dayIndex);
            const slotEvents = getEventsForTimeSlot(day, hour);
            
            return (
              <div
                key={dayIndex}
                className={`time-slot ${isSameDay(day, selectedDate) ? 'selected-day' : ''}`}
                onClick={() => onTimeSlotClick(day, timeLabel)}
              >
                {slotEvents.map((event, eventIndex) => {
                  const accountIndex = accounts.findIndex(acc => acc.id === event.accountId);
                  return (
                    <div
                      key={eventIndex}
                      className={`week-event event-account-${(accountIndex % 6) + 1}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      title={`${event.summary || event.title} - ${event.accountName || 'Unknown'}`}
                    >
                      <div className="week-event-time">
                        {event.start?.dateTime ? safeFormat(event.start.dateTime, 'HH:mm', 'All day') : 'All day'}
                      </div>
                      <div className="week-event-title">
                        {event.summary || event.title || 'Untitled Event'}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      );
    });
  };

  return (
    <div className="week-view">
      <div className="week-container">
        {renderHeader()}
        <div className="week-body">
          {renderTimeSlots()}
        </div>
      </div>
    </div>
  );
};

export default WeekView;
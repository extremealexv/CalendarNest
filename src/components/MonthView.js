import React from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday } from 'date-fns';
import './MonthView.css';

const MonthView = ({ 
  events, 
  selectedDate, 
  onDateChange, 
  onTimeSlotClick, 
  onEventClick, 
  accounts 
}) => {
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const renderHeader = () => {
    const dateFormat = 'MMM yyyy';
    return (
      <div className="month-header">
        <h2 className="month-title">{format(selectedDate, dateFormat)}</h2>
      </div>
    );
  };

  const renderDays = () => {
    const dateFormat = 'EEE';
    const days = [];
    let startDate = startOfWeek(selectedDate);

    for (let i = 0; i < 7; i++) {
      days.push(
        <div className="day-header" key={i}>
          {format(addDays(startDate, i), dateFormat)}
        </div>
      );
    }

    return <div className="days-row">{days}</div>;
  };

  const renderCells = () => {
    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = '';

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, 'd');
        const cloneDay = day;
        const dayEvents = events.filter(event => {
          const eventDate = new Date(event.start?.dateTime || event.start?.date);
          return isSameDay(eventDate, day);
        });

        days.push(
          <div
            className={`calendar-day ${
              !isSameMonth(day, monthStart) ? 'other-month' : ''
            } ${isSameDay(day, selectedDate) ? 'selected' : ''} ${
              isToday(day) ? 'today' : ''
            }`}
            key={day}
            onClick={() => onDateChange(cloneDay)}
          >
            <span className="day-number">{formattedDate}</span>
            <div className="day-events">
              {dayEvents.slice(0, 3).map((event, idx) => {
                const accountIndex = accounts.findIndex(acc => acc.id === event.accountId);
                return (
                  <div
                    key={idx}
                    className={`event-item event-account-${(accountIndex % 6) + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                    title={event.summary || event.title}
                  >
                    {event.start?.dateTime && (
                      <span className="event-time">
                        {format(new Date(event.start.dateTime), 'HH:mm')}
                      </span>
                    )}
                    <span className="event-title">
                      {event.summary || event.title || 'Untitled Event'}
                    </span>
                  </div>
                );
              })}
              {dayEvents.length > 3 && (
                <div className="more-events">
                  +{dayEvents.length - 3} more
                </div>
              )}
            </div>
            {dayEvents.length === 0 && (
              <div 
                className="add-event-hint"
                onClick={(e) => {
                  e.stopPropagation();
                  onTimeSlotClick(cloneDay, '09:00');
                }}
              >
                +
              </div>
            )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="week-row" key={day}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="calendar-body">{rows}</div>;
  };

  return (
    <div className="month-view">
      {renderHeader()}
      {renderDays()}
      {renderCells()}
    </div>
  );
};

export default MonthView;
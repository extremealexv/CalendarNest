import React, { useState, useEffect, useRef } from 'react';
import { addHours, isSameDay, isToday } from 'date-fns';
import { safeFormat, safeParse } from '../utils/dateUtils';
import './DayView.css';
import { geminiService } from '../services/GeminiService';
import { speak } from '../services/ttsService';

const DayView = ({ 
  events, 
  selectedDate, 
  onDateChange, 
  onTimeSlotClick, 
  onEventClick, 
  accounts 
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [assistantText, setAssistantText] = useState('');
  const [assistantLang, setAssistantLang] = useState('en');
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  const parsedSelected = safeParse(selectedDate) || new Date();
  const scheduleRef = useRef(null);
  const touchState = useRef({ startY: 0, startScroll: 0, isDragging: false });

  // Use renderer-normalized parsedStart/parsedEnd/allDay fields that GoogleCalendarService provides
  const dayEvents = events.filter(event => {
    const eventStart = event.parsedStart || safeParse(event.start?.dateTime || event.start?.date);
    const eventEnd = event.parsedEnd || safeParse(event.end?.dateTime || event.end?.date);
    if (!eventStart) return false;
    // Include if event overlaps the selected day (inclusive)
    try {
      const dayStart = new Date(parsedSelected);
      dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(parsedSelected);
      dayEnd.setHours(23,59,59,999);
      if (eventEnd && (eventEnd < dayStart || eventStart > dayEnd)) return false;
      return true;
    } catch (e) {
      return isSameDay(eventStart, parsedSelected);
    }
  });

  const getAllDayEvents = () => {
    return dayEvents.filter(event => event.allDay === true);
  };

  const getTimedEvents = () => {
    return dayEvents.filter(event => !event.allDay);
  };

  const getEventsForHour = (hour) => {
    return getTimedEvents().filter(event => {
      const eventStart = event.parsedStart || safeParse(event.start?.dateTime);
      const eventEnd = event.parsedEnd || safeParse(event.end?.dateTime);
      if (!eventStart || !eventEnd) return false;
      // Hour interval [hour:00, hour+1:00)
      const slotStart = new Date(eventStart);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setHours(hour + 1, 0, 0, 0);
      // Overlaps if eventStart < slotEnd && eventEnd > slotStart
      return (eventStart < slotEnd) && (eventEnd > slotStart);
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
        <div className="day-actions">
          <div className="lang-select-wrapper">
            <label htmlFor="assistant-lang" className="lang-label">Assistant:</label>
            <select id="assistant-lang" value={assistantLang} onChange={(e) => setAssistantLang(e.target.value)}>
              <option value="en">English</option>
              <option value="ru">Русский</option>
            </select>
          </div>

          <button
            className="gemini-read-btn"
            onClick={async () => {
              if (isSpeaking) return;
              try {
                // mark speaking
                setIsSpeaking(true);
                setAssistantText('');

                // Ask Gemini to summarize today's events (pass language)
                const summary = await geminiService.generateAvailabilitySummary(
                  accounts || [],
                  dayEvents,
                  parsedSelected,
                  parsedSelected,
                  { lang: assistantLang }
                );

                const rawText = typeof summary === 'string' ? summary : String(summary);
                // Remove markdown-like asterisks and collapse whitespace so TTS doesn't read '*' characters
                const text = rawText.replace(/\*/g, '').replace(/\s+/g, ' ').trim();

                // Use unified TTS helper which handles browser and main-process fallbacks
                setAssistantText(text);
                try {
                  await speak(text, assistantLang);
                } catch (ttsErr) {
                  console.warn('[DayView] speak failed', ttsErr);
                } finally {
                  setIsSpeaking(false);
                }
              } catch (err) {
                console.warn('Gemini read failed', err);
                setAssistantText('Sorry — I could not summarize today.');
                setTimeout(() => setIsSpeaking(false), 3000);
              }
            }}
            aria-pressed={isSpeaking}
          >
            🔊 Read today's events
          </button>

          <span className={`speaking-indicator ${isSpeaking ? 'speaking' : ''}`} title={isSpeaking ? 'Gemini is speaking' : 'Idle'} />
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
        <div key={hour} id={`hour-slot-${hour}`} className="day-time-slot">
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

  // Auto-scroll to current hour when viewing today, or scroll to top otherwise
  useEffect(() => {
    const container = scheduleRef.current;
    if (!container) return;
    try {
      console.debug('[DayView] mount auto-scroll: container', container, 'clientHeight', container.clientHeight, 'scrollHeight', container.scrollHeight);
      // If the container exactly equals its content height, layout gave it full height and no scrolling is possible.
      // In that case we enable a conservative force-scroll fallback so users can scroll the schedule.
      if ((container.clientHeight || 0) === (container.scrollHeight || 0) && (container.scrollHeight || 0) > 800) {
        try {
          console.debug('[DayView] clientHeight === scrollHeight -> enabling force-scroll fallback');
          const headerEl = document.querySelector('.header');
          const headerBottom = headerEl ? headerEl.getBoundingClientRect().bottom : 0;
          const kb = document.querySelector('.onscreen-kb');
          const kbHeight = kb ? kb.getBoundingClientRect().height : 0;
          const padding = 40; // safety padding
          const available = Math.max(200, window.innerHeight - headerBottom - kbHeight - padding);
          container.classList.add('force-scroll');
          container.dataset.forcedMax = String(available);
          container.style.maxHeight = available + 'px';
          console.debug('[DayView] applied forced maxHeight:', available);
        } catch (e) {
          console.debug('[DayView] error applying force-scroll', e);
        }
      }
      // If container is too small (layout didn't assign height), compute available space
      if ((container.clientHeight || 0) < 120) {
        try {
          const headerEl = document.querySelector('.header');
          const headerBottom = headerEl ? headerEl.getBoundingClientRect().bottom : 0;
          // detect on-screen keyboard height if present
          const kb = document.querySelector('.onscreen-kb');
          const kbHeight = kb ? kb.getBoundingClientRect().height : 0;
          const padding = 40; // safety padding
          const available = Math.max(200, window.innerHeight - headerBottom - kbHeight - padding);
          console.debug('[DayView] computed available height', available, 'headerBottom', headerBottom, 'kbHeight', kbHeight);
          container.style.maxHeight = available + 'px';
        } catch (e) {
          // ignore measurement errors
        }
      }
      const today = isToday(parsedSelected);
      if (today) {
        const nowHour = new Date().getHours();
        const el = container.querySelector(`#hour-slot-${nowHour}`);
        if (el) {
          // center the hour in view for better visibility
          const offset = el.offsetTop - (container.clientHeight / 2) + (el.clientHeight / 2);
          console.debug('[DayView] auto-scroll to hour', nowHour, 'element offsetTop', el.offsetTop, 'container.clientHeight', container.clientHeight, 'calculated offset', offset);
          container.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
        }
      } else {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (e) {
      // silent
    }
  }, [parsedSelected, scheduleRef, events.length]);

  // touch drag to scroll support for kiosks that don't expose native scroll
  useEffect(() => {
    const container = scheduleRef.current;
    if (!container) return;
    const onTouchStart = (ev) => {
      const t = ev.touches && ev.touches[0];
      if (!t) return;
      console.debug('[DayView] touchstart y=', t.clientY, 'scrollTop=', container.scrollTop, 'target=', ev.target);
      touchState.current.startY = t.clientY;
      touchState.current.startScroll = container.scrollTop;
      touchState.current.isDragging = true;
    };
    const onTouchMove = (ev) => {
      if (!touchState.current.isDragging) return;
      const t = ev.touches && ev.touches[0];
      if (!t) return;
      const dy = t.clientY - touchState.current.startY;
      // Debug: show dy and computed scrollTop and container metrics
      try {
        const cs = window.getComputedStyle(container);
        console.debug('[DayView] touchmove dy=', dy, 'startY=', touchState.current.startY, 'startScroll=', touchState.current.startScroll, 'container.clientHeight=', container.clientHeight, 'container.scrollHeight=', container.scrollHeight, 'overflowY=', cs.overflowY, 'style.maxHeight=', container.style.maxHeight);
      } catch (e) {}
      // invert so dragging up scrolls down
      container.scrollTop = touchState.current.startScroll - dy;
      // read back effect
      try { console.debug('[DayView] touchmove applied scrollTop ->', container.scrollTop); } catch (e) {}
      // prevent parent handlers
      ev.preventDefault();
    };
    const onTouchEnd = () => {
      console.debug('[DayView] touchend final scrollTop=', container.scrollTop, 'clientHeight=', container.clientHeight, 'scrollHeight=', container.scrollHeight);
      touchState.current.isDragging = false;
    };
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    // Mouse drag support for non-touch kiosks
    const onMouseDown = (ev) => {
      console.debug('[DayView] mousedown y=', ev.clientY, 'scrollTop=', container.scrollTop, 'target=', ev.target);
      touchState.current.startY = ev.clientY;
      touchState.current.startScroll = container.scrollTop;
      touchState.current.isDragging = true;
      ev.preventDefault();
    };
    const onMouseMove = (ev) => {
      if (!touchState.current.isDragging) return;
      const dy = ev.clientY - touchState.current.startY;
      try {
        const cs = window.getComputedStyle(container);
        console.debug('[DayView] mousemove dy=', dy, 'startY=', touchState.current.startY, 'startScroll=', touchState.current.startScroll, 'container.clientHeight=', container.clientHeight, 'container.scrollHeight=', container.scrollHeight, 'overflowY=', cs.overflowY, 'style.maxHeight=', container.style.maxHeight);
      } catch (e) {}
      container.scrollTop = touchState.current.startScroll - dy;
      try { console.debug('[DayView] mousemove applied scrollTop ->', container.scrollTop); } catch (e) {}
    };
    const onMouseUp = () => {
      console.debug('[DayView] mouseup final scrollTop=', container.scrollTop, 'clientHeight=', container.clientHeight, 'scrollHeight=', container.scrollHeight);
      touchState.current.isDragging = false;
    };
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [scheduleRef]);

  // Additional runtime diagnostic: log scroll events so we can see interactions
  useEffect(() => {
    const container = scheduleRef.current;
    if (!container) return;
    const onScroll = () => {
      try { console.debug('[DayView] scrollTop=', container.scrollTop, 'clientHeight=', container.clientHeight, 'scrollHeight=', container.scrollHeight); } catch (e) {}
    };
    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, [scheduleRef]);

  return (
    <div className="day-view">
      {renderHeader()}
      {assistantText && (
        <div className={`assistant-bubble ${isSpeaking ? 'visible' : ''}`}>
          {assistantText}
        </div>
      )}
      {renderAllDayEvents()}
      <div className="day-schedule" ref={scheduleRef}>
        {renderTimeSlots()}
      </div>
    </div>
  );
};

export default DayView;
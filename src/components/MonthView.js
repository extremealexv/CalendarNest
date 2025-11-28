import React from 'react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday, startOfDay, endOfDay } from 'date-fns';
import { safeFormat } from '../utils/dateUtils';
import './MonthView.css';
import { voiceSearchService } from '../services/voiceSearchService';
import { geminiService } from '../services/GeminiService';
import { safeParse, safeFormat } from '../utils/dateUtils';

const MonthView = ({ 
  events, 
  selectedDate, 
  onDateChange, 
  onTimeSlotClick, 
  onEventClick, 
  accounts 
}) => {
  const [listening, setListening] = React.useState(false);
  const [inputLang, setInputLang] = React.useState('ru-RU');
  const [outputLang, setOutputLang] = React.useState('ru');
  const [lastTranscript, setLastTranscript] = React.useState('');
  const [lastAnswer, setLastAnswer] = React.useState('');

  const handleStartVoice = () => {
    setLastTranscript('');
    setLastAnswer('');
    // Try Web Speech API recognition
    const res = voiceSearchService.startRecognition({
      lang: inputLang,
      onResult: async (text) => {
        setLastTranscript(text);
        setListening(false);
        try {
          // determine range to query: use month of selectedDate
          const parsed = safeParse(selectedDate) || new Date();
          const start = new Date(parsed);
          start.setDate(1); start.setHours(0,0,0,0);
          const end = new Date(start); end.setMonth(end.getMonth()+1); end.setHours(23,59,59,999);
          const answer = await voiceSearchService.handleQueryText(text, { events, accounts, startDate: start, endDate: end, lang: outputLang, onAnswerText: (t) => setLastAnswer(t) });
          setLastAnswer(answer);
        } catch (err) {
          setLastAnswer('Error: ' + (err.message || String(err)));
        }
      },
      onEnd: () => { setListening(false); }
    });
    if (res && res.supported) {
      setListening(true);
    } else {
      // fallback: try MediaRecorder capture
      (async () => {
        try {
          setListening(true);
          const blob = await voiceSearchService.recordAudio({ ms: 7000 });
          setListening(false);
          // Try local VOSK server transcription
          try {
            const transcript = await voiceSearchService.transcribeWithServer(blob, 'http://localhost:5000/transcribe');
            setLastTranscript(transcript || '(no speech detected)');
            // determine month range
            const parsed = safeParse(selectedDate) || new Date();
            const start = new Date(parsed);
            start.setDate(1); start.setHours(0,0,0,0);
            const end = new Date(start); end.setMonth(end.getMonth()+1); end.setHours(23,59,59,999);
            const answer = await voiceSearchService.handleQueryText(transcript || '', { events, accounts, startDate: start, endDate: end, lang: outputLang, onAnswerText: (t) => setLastAnswer(t) });
            setLastAnswer(answer);
          } catch (transErr) {
            console.warn('VOSK transcription failed', transErr);
            setLastTranscript('Recorded audio available but transcription failed: ' + (transErr && transErr.message ? transErr.message : String(transErr)));
          }
        } catch (e) {
          setListening(false);
          setLastTranscript('Microphone capture failed: ' + (e.message || String(e)));
        }
      })();
    }
  };
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const renderHeader = () => {
    const dateFormat = 'MMM yyyy';
    return (
      <div className="month-header">
        <h2 className="month-title">{safeFormat(selectedDate, dateFormat, '')}</h2>
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
          {safeFormat(addDays(startDate, i), dateFormat, '')}
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
  formattedDate = safeFormat(day, 'd', '');
        const cloneDay = day;
        const dayEvents = events.filter(event => {
          const start = event.parsedStart || new Date(event.start?.dateTime || event.start?.date);
          const end = event.parsedEnd || new Date(event.end?.dateTime || event.end?.date || event.start?.dateTime || event.start?.date);
          if (!start) return false;
          // Include event if any part of it falls on this day
          return !(end < startOfDay(day) || start > endOfDay(day));
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
                    {!event.allDay && event.parsedStart && (
                      <span className="event-time">
                        {safeFormat(event.parsedStart, 'HH:mm', '')}
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
      <div className="month-voice-search">
        <label style={{ marginRight: 8 }}>Input:</label>
        <select value={inputLang} onChange={(e) => setInputLang(e.target.value)}>
          <option value="ru-RU">Русский</option>
          <option value="en-US">English</option>
        </select>
        <label style={{ margin: '0 8px' }}>Output:</label>
        <select value={outputLang} onChange={(e) => setOutputLang(e.target.value)}>
          <option value="ru">Russian</option>
          <option value="en">English</option>
        </select>
        <button className="btn" onClick={handleStartVoice} disabled={listening} style={{ marginLeft: 12 }}>
          {listening ? 'Listening…' : 'Voice Search'}
        </button>
        <div className="voice-results" style={{ marginTop: 8 }}>
          {lastTranscript ? (<div><strong>Heard:</strong> {lastTranscript}</div>) : null}
          {lastAnswer ? (<div><strong>Answer:</strong> {lastAnswer}</div>) : null}
        </div>
      </div>
      {renderDays()}
      {renderCells()}
    </div>
  );
};

export default MonthView;
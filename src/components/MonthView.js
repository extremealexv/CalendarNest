import React from 'react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday, startOfDay, endOfDay } from 'date-fns';
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
  const [devices, setDevices] = React.useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState('');
  const [testing, setTesting] = React.useState(false);
  const [rms, setRms] = React.useState(0);
  const analyserRef = React.useRef(null);
  const audioStreamRef = React.useRef(null);

  const handleStartVoice = () => {
    setLastTranscript('');
    setLastAnswer('');
    // Try Web Speech API recognition; if it fails or produces no transcript, fall back to recording+VOSK
    const waitingRef = { current: false };
    const res = voiceSearchService.startRecognition({
      lang: inputLang,
      onResult: async (text) => {
        waitingRef.current = false;
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
      onEnd: () => {
        // If recognition ended without producing a result, fallback to recording+VOSK
        if (waitingRef.current) {
          // perform fallback
          (async () => {
            try {
              setListening(true);
              const constraints = selectedDeviceId ? { audio: { deviceId: { exact: selectedDeviceId } } } : { audio: true };
              const blob = await voiceSearchService.recordAudio({ ms: 7000, constraints });
              setListening(false);
              try {
                const transcript = await voiceSearchService.transcribeWithServer(blob, 'http://localhost:5000/transcribe');
                setLastTranscript(transcript || '(no speech detected)');
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
        setListening(false);
      }
    });
    if (res && res.supported) {
      waitingRef.current = true;
      setListening(true);
      // safety: if no result after X ms, trigger fallback
      setTimeout(() => {
        if (waitingRef.current) {
          // stop recognition and fallback will run in onEnd
          try { voiceSearchService.stopRecognition(); } catch (e) { console.debug('stopRecognition failed', e); }
        }
      }, 8000);
    } else {
      // immediate fallback: MediaRecorder -> VOSK
      (async () => {
        try {
          setListening(true);
          const constraints = selectedDeviceId ? { audio: { deviceId: { exact: selectedDeviceId } } } : { audio: true };
          const blob = await voiceSearchService.recordAudio({ ms: 7000, constraints });
          setListening(false);
          try {
            const transcript = await voiceSearchService.transcribeWithServer(blob, 'http://localhost:5000/transcribe');
            setLastTranscript(transcript || '(no speech detected)');
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
        {/* Mic device selector & diagnostics */}
        <label style={{ margin: '0 8px' }}>Mic:</label>
        <select value={selectedDeviceId} onChange={(e) => setSelectedDeviceId(e.target.value)} style={{ minWidth: 220 }}>
          <option value="">(default)</option>
          {devices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>
          ))}
        </select>
        <button className="btn" style={{ marginLeft: 8 }} onClick={async () => {
          try {
            // ensure permission so labels appear
            await navigator.mediaDevices.getUserMedia({ audio: true }).catch(()=>{});
          } catch(e) {}
          const list = await navigator.mediaDevices.enumerateDevices();
          setDevices(list.filter(d => d.kind === 'audioinput'));
        }}>Refresh mics</button>
        <button className="btn" style={{ marginLeft: 8 }} disabled={testing} onClick={async () => {
          setTesting(true);
          setRms(0);
          try {
            const constraints = selectedDeviceId ? { audio: { deviceId: { exact: selectedDeviceId } } } : { audio: true };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            audioStreamRef.current = stream;
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const src = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            src.connect(analyser);
            analyserRef.current = { analyser, ctx };
            const data = new Uint8Array(analyser.fftSize);
            let running = true;
            const read = () => {
              if (!running) return;
              analyser.getByteTimeDomainData(data);
              let sum = 0;
              for (let i = 0; i < data.length; i++) {
                const v = (data[i] - 128) / 128;
                sum += v * v;
              }
              const curRms = Math.sqrt(sum / data.length);
              setRms(curRms);
              requestAnimationFrame(read);
            };
            read();
            setTimeout(() => {
              running = false;
              try { analyserRef.current.analyser.disconnect(); } catch (e) {}
              try { analyserRef.current.ctx.close(); } catch (e) {}
              if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach(t => t.stop());
              analyserRef.current = null;
              audioStreamRef.current = null;
              setTesting(false);
            }, 4000);
          } catch (e) {
            console.warn('mic test failed', e);
            setTesting(false);
          }
        }}>Test mic</button>
        <div style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 12, width: 120 }}>
          <div style={{ height: 10, width: '100%', background: '#222', borderRadius: 4 }}>
            <div style={{ height: 10, width: `${Math.min(1, rms) * 100}%`, background: rms > 0.05 ? '#4caf50' : '#f44336', borderRadius: 4 }} />
          </div>
        </div>
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
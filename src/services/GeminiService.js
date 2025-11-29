// Gemini AI Service for Natural Language Processing
import { GoogleGenerativeAI } from '@google/generative-ai';
import { format, parseISO, addDays, addWeeks, addMonths } from 'date-fns';
import { safeFormat, safeParse } from '../utils/dateUtils';

class GeminiService {
  constructor() {
    this.genAI = null;
    this.model = null;
    this.isInitialized = false;
  }

  // Interpret a natural language query and return a strict JSON describing
  // the desired date range and search keywords (both English and Russian).
  // Returned object shape:
  // {
  //   startDate: "YYYY-MM-DD" | null,
  //   endDate: "YYYY-MM-DD" | null,
  //   scope: "single_day" | "range" | "from_today" | "next_occurrence" | "unspecified",
  //   keywords_en: ["dentist","doctor"],
  //   keywords_ru: ["стоматолог","дантист"],
  //   notes: "optional notes"
  // }
  async interpretQuery(query, referenceDate = new Date(), options = {}) {
    if (!this.initialize()) {
      throw new Error('Gemini AI not available');
    }

    try {
      const lang = (options.lang || 'ru').toLowerCase();
      const languageInstruction = lang.startsWith('ru') ? 'Ответьте на русском.' : 'Respond in English.';
      const ref = safeFormat(referenceDate, 'yyyy-MM-dd', '');

      const prompt = `
${languageInstruction}
Reference date: ${ref}

You will be given a user's short question about their calendar. Your task is to return a strict JSON object (ONLY JSON, no commentary, no markdown) that tells us which date range the user meant and which keywords should be used to filter events. The JSON MUST include the fields: startDate, endDate, scope, keywords_en, keywords_ru, notes.

Field rules:
- startDate and endDate: use ISO date format YYYY-MM-DD for inclusive ranges. If no explicit date is requested, return null for these fields.
- scope: one of exactly: "single_day", "range", "from_today", "next_occurrence", or "unspecified".
- keywords_en: array of short lowercase keyword strings to match in event titles/descriptions in English. May be empty.
- keywords_ru: array of short lowercase keyword strings to match in event titles/descriptions in Russian. May be empty.
- notes: a short human-friendly note explaining your interpretation (optional, plain text).

Examples (JSON only):
{"startDate":"2025-11-30","endDate":"2025-11-30","scope":"single_day","keywords_en":[],"keywords_ru":[],"notes":"tomorrow"}
{"startDate":null,"endDate":null,"scope":"from_today","keywords_en":["dentist"],"keywords_ru":["стоматолог"],"notes":"search for next dentist appointment from today"}

Now parse this question and return only the JSON object.

Question: "${query}"
`;

      try {
        if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.geminiLog === 'function') {
          window.electronAPI.geminiLog(prompt, 'interpretQuery');
        }
      } catch (e) { /* ignore logging errors */ }

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text_response = response.text();

      const jsonMatch = text_response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('interpretQuery: Invalid JSON response from Gemini');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Normalize keys and ensure arrays exist
      parsed.startDate = parsed.startDate || null;
      parsed.endDate = parsed.endDate || null;
      parsed.scope = parsed.scope || 'unspecified';
      parsed.keywords_en = Array.isArray(parsed.keywords_en) ? parsed.keywords_en.map(k => String(k).toLowerCase()) : [];
      parsed.keywords_ru = Array.isArray(parsed.keywords_ru) ? parsed.keywords_ru.map(k => String(k).toLowerCase()) : [];
      parsed.notes = parsed.notes || '';

      // Log the interpreted JSON result for debugging/audit
      try {
        if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.geminiLog === 'function') {
          window.electronAPI.geminiLog(JSON.stringify({ interpretQueryResult: parsed }, null, 2), 'interpretQueryResult');
        }
      } catch (e) { /* ignore logging errors */ }

      return parsed;
    } catch (error) {
      console.error('interpretQuery failed:', error);
      throw error;
    }
  }
  // Initialize Gemini AI
  initialize() {
    if (this.isInitialized) return true;

    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('Gemini API key not found. Natural language features will be disabled.');
      return false;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ 
        model: process.env.REACT_APP_GEMINI_MODEL || 'gemini-2.5-flash' 
      });
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize Gemini AI:', error);
      return false;
    }
  }

  // Parse natural language into structured event data
  async parseEventFromText(text, accounts = [], currentDate = new Date(), options = {}) {
    if (!this.initialize()) {
      throw new Error('Gemini AI not available');
    }

    try {
      const accountsList = accounts.map(acc => `${acc.name} (${acc.email})`).join(', ');
  const currentDateStr = safeFormat(currentDate, 'yyyy-MM-dd EEEE', safeFormat(new Date(), 'yyyy-MM-dd EEEE', ''));

      const lang = (options.lang || 'en').toLowerCase();
      const languageInstruction = lang.startsWith('ru') ? 'Respond in Russian.' : 'Respond in English.';

      const prompt = `
${languageInstruction}
Parse the following text into a structured calendar event. Today is ${currentDateStr}.

Important: produce values that are safe for text-to-speech (TTS). For any text fields (title, description, location, participants) return plain, short sentences, avoid markdown, emojis, parentheses, or special characters. Expand common abbreviations (e.g., "Mon" -> "Monday", "Dr." -> "Doctor"), and express times in a human-friendly form (e.g., "1 PM" or "13:00") rather than shorthand. Do not include lists or bullet markers inside string fields. Return only the JSON object described below, with field values that are ready to be spoken by a TTS engine.

Available accounts: ${accountsList}

Text: "${text}"

Return a JSON object with the following structure:
{
  "title": "Event title",
  "description": "Event description (optional)",
  "startDate": "YYYY-MM-DD",
  "startTime": "HH:mm", 
  "endDate": "YYYY-MM-DD", 
  "endTime": "HH:mm",
  "location": "Event location (optional)",
  "participants": ["email1", "email2"], // Match against available accounts
  "isAllDay": false,
  "recurrence": "none", // none, daily, weekly, monthly
  "reminders": [15], // minutes before event
  "confidence": 0.95 // How confident you are in the parsing (0-1)
}

Important parsing rules:
- Default duration is 1 hour if not specified
- "Tomorrow" means the day after today
`;

      // Log the prompt for debugging/audit if main process logging is available
      try {
        if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.geminiLog === 'function') {
          window.electronAPI.geminiLog(prompt, 'parseEvent');
        }
      } catch (e) { /* ignore logging errors */ }

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text_response = response.text();
      
      // Clean the response to extract JSON
      const jsonMatch = text_response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid response format from Gemini');
      }

      const eventData = JSON.parse(jsonMatch[0]);
      
      // Validate and enhance the parsed data
      return this.validateAndEnhanceEventData(eventData, accounts);
      
    } catch (error) {
      console.error('Event parsing failed:', error);
      throw new Error('Failed to parse event from natural language');
    }
  }

  // Generate availability summary for multiple accounts
  async generateAvailabilitySummary(accounts, events, startDate, endDate, options = {}) {
    if (!this.initialize()) {
      throw new Error('Gemini AI not available');
    }

    try {
  const lang = (options.lang || 'en').toLowerCase();
  const languageInstruction = lang.startsWith('ru') ? 'Please write the summary in Russian.' : 'Please write the summary in English.';
  const dateRange = `${safeFormat(startDate, 'MMM d', '')} - ${safeFormat(endDate, 'MMM d, yyyy', '')}`;
  // Provide an explicit local reference date to avoid model-relative-date ambiguity
  const referenceDate = safeFormat(startDate || new Date(), 'yyyy-MM-dd', '');
      
      // Prepare events data for analysis — include isAllDay and description so the model can decide whether an event is informational
      const eventsData = events.map(event => ({
        title: event.summary || event.title,
        description: event.description || event.notes || '',
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        isAllDay: !!(event.start && event.start.date && !event.start.dateTime),
        account: event.accountName || event.accountEmail
      }));
  const prompt = `
${languageInstruction}
Reference date: ${referenceDate}
Analyze the following calendar data and provide a natural language summary of availability and conflicts for the family.

Important: format the summary to be read aloud by a TTS engine. Use short, clear sentences; avoid lists, bullet points, emojis, markdown, or excessive punctuation. Expand abbreviations and write times in a TTS-friendly way (e.g., "1 PM", "13:00"). Do not include links or code. Limit the output to plain text (no JSON) and keep it under 180 words. If producing names or locations, return them as spoken-friendly phrases.

Date Range: ${dateRange}
Accounts: ${accounts.map(acc => acc.name).join(', ')}

Events:
${JSON.stringify(eventsData, null, 2)}

Important: Treat all-day informational events (for example: public holidays, lunar phases like "full moon", day-of-year markers such as "100th day", observances, or calendar items whose title/description indicate they are informational) as non-blocking. These informational all-day entries do not prevent scheduling other events and should not be counted as "busy" time. Only treat explicit unavailability all-day events (words like "vacation", "out of office", "unavailable", "busy", "blocked") as blocking.

Provide a conversational summary including:
1. Who has the busiest schedule
2. Best times for family meetings
3. Any scheduling conflicts or overlaps
4. Free time slots suitable for group activities
5. Weekend availability

Keep the response friendly and family-focused, under 180 words.
`;

  const result = await this.model.generateContent(prompt);
  const response = await result.response;
  return response.text();
      
    } catch (error) {
      console.error('Availability summary generation failed:', error);
  // Fallback: produce a simple local summary when Gemini model/method isn't available
      try {
        // Helper to detect informational all-day events we should ignore for "busy" calculations
        const isInformationalAllDay = (ev) => {
          try {
            const isAllDay = !!(ev.start && ev.start.date && !ev.start.dateTime);
            if (!isAllDay) return false;
            const title = (ev.summary || ev.title || '').toLowerCase();
            const desc = (ev.description || ev.notes || '').toLowerCase();
            // Exclusion: if explicitly unavailable, treat as blocking
            const blocking = ['vacation', 'out of office', 'unavailable', 'busy', 'blocked', 'holiday - closed'];
            for (const b of blocking) if (title.includes(b) || desc.includes(b)) return false;
            const infoKeywords = ['holiday', 'full moon', 'moon', 'day of year', 'observance', 'eclipse', 'phase', 'anniversary'];
            for (const k of infoKeywords) if (title.includes(k) || desc.includes(k)) return true;
            return false;
          } catch (e) { return false; }
        };

        // Aggregate events per account, ignoring informational all-day events for "busy" calculations
        const counts = {};
        (events || []).forEach(ev => {
          if (isInformationalAllDay(ev)) return;
          const acct = ev.accountName || ev.accountEmail || 'Unknown';
          counts[acct] = (counts[acct] || 0) + 1;
        });

        let busiest = 'No events';
        if (Object.keys(counts).length) {
          busiest = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
        }

        // Find free hours between 9-17 with fewest events
        const hourCounts = Array.from({ length: 24 }, () => 0);
        (events || []).forEach(ev => {
          if (isInformationalAllDay(ev)) return;
          const start = ev.start?.dateTime || ev.start?.date;
          const end = ev.end?.dateTime || ev.end?.date;
          let s = start ? new Date(start) : null;
          let e = end ? new Date(end) : null;
          if (!s || !e) return;
          const sh = s.getHours();
          const eh = e.getHours();
          for (let h = Math.max(0, sh); h <= Math.min(23, eh); h++) hourCounts[h]++;
        });

        const candidateHours = [];
        for (let h = 9; h <= 17; h++) candidateHours.push({ h, c: hourCounts[h] });
        candidateHours.sort((a, b) => a.c - b.c);
        const best = candidateHours.slice(0, 3).map(x => `${x.h}:00`);

        // Weekend availability
        const weekendEvents = (events || []).filter(ev => {
          if (isInformationalAllDay(ev)) return false;
          const s = ev.start?.dateTime || ev.start?.date;
          if (!s) return false;
          const d = new Date(s);
          return d.getDay() === 0 || d.getDay() === 6;
        });

        const summaryParts = [];
        if (lang && lang.startsWith('ru')) {
          summaryParts.push(`Самая занятая запись: ${busiest}`);
          if (best.length) summaryParts.push(`Подходящее время для встреч: ${best.join(', ')}`);
          summaryParts.push(`Всего событий: ${(events || []).filter(e=>!isInformationalAllDay(e)).length}`);
          summaryParts.push(weekendEvents.length ? `Есть ${weekendEvents.length} событий в выходные.` : 'Выходные в основном свободны.');
        } else {
          summaryParts.push(`Busiest calendar: ${busiest}`);
          if (best.length) summaryParts.push(`Good meeting times: ${best.join(', ')}`);
          summaryParts.push(`${(events || []).filter(e=>!isInformationalAllDay(e)).length} events in the selected range.`);
          summaryParts.push(weekendEvents.length ? `There are ${weekendEvents.length} weekend events.` : 'Weekend looks mostly free.');
        }

        return summaryParts.join(' ');
      } catch (fallbackErr) {
        console.error('Fallback summary failed:', fallbackErr);
        throw new Error('Failed to generate availability summary');
      }
    }
  }

  // Suggest optimal meeting times
  async suggestMeetingTimes(query, accounts, events, preferences = {}) {
    if (!this.initialize()) {
      throw new Error('Gemini AI not available');
    }

    try {
      // Include isAllDay and description so Gemini can decide whether an event is informational
      const eventsContext = events.map(e => ({
        title: e.summary || e.title,
        description: e.description || '',
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        isAllDay: !!(e.start && e.start.date && !e.start.dateTime),
        account: e.accountName
      }));

      const prompt = `
Based on the query "${query}" and the following calendar information, suggest 3 optimal meeting times.

Accounts: ${accounts.map(acc => acc.name).join(', ')}
Current Events: ${JSON.stringify(eventsContext, null, 2)}

Important: When determining availability, ignore informational all-day events (examples: public holidays, lunar phases like "full moon", day-of-year markers, or calendar items titled like "Holiday: ..."). These informational all-day entries should NOT be treated as busy time. Only treat explicit unavailability all-day events (containing words like "vacation", "out of office", "unavailable", "busy", "blocked") as blocking.

Preferences:
- Preferred duration: ${preferences.duration || '1 hour'}
- Preferred time of day: ${preferences.timeOfDay || 'business hours'}
- Avoid weekends: ${preferences.avoidWeekends || false}

    "date": "YYYY-MM-DD",
    "startTime": "HH:mm",
    "endTime": "HH:mm", 
    "reason": "Why this time is good",
    "conflicts": ["Any minor conflicts"]
  }
]

Only return the JSON array, no other text.
`;

      // Log the prompt for diagnostics
      try {
        if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.geminiLog === 'function') {
          window.electronAPI.geminiLog(prompt, 'suggestMeetingTimes');
        }
      } catch (e) { /* ignore */ }

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text_response = response.text();
      
      const jsonMatch = text_response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('Invalid response format from Gemini');
      }

      return JSON.parse(jsonMatch[0]);
      
    } catch (error) {
      console.error('Meeting suggestion failed:', error);
      throw new Error('Failed to generate meeting suggestions');
    }
  }

  // Validate and enhance parsed event data
  validateAndEnhanceEventData(eventData, accounts) {
    // Set defaults for missing fields
    const enhanced = {
      title: eventData.title || 'New Event',
      description: eventData.description || '',
      location: eventData.location || '',
      isAllDay: eventData.isAllDay || false,
      recurrence: eventData.recurrence || 'none',
      reminders: eventData.reminders || [15],
      confidence: eventData.confidence || 0.5,
      ...eventData
    };

    // Validate dates
    if (!enhanced.startDate) {
      enhanced.startDate = safeFormat(new Date(), 'yyyy-MM-dd', '');
    }
    
    if (!enhanced.endDate) {
      enhanced.endDate = enhanced.startDate;
    }

    // Validate times for non-all-day events
    if (!enhanced.isAllDay) {
      if (!enhanced.startTime) {
        enhanced.startTime = '09:00';
      }
      
      if (!enhanced.endTime) {
        // Default to 1 hour duration
        const startHour = parseInt(enhanced.startTime.split(':')[0]);
        const startMinute = parseInt(enhanced.startTime.split(':')[1]);
        const endHour = startMinute === 0 ? startHour + 1 : startHour;
        const endMinute = startMinute === 0 ? 0 : startMinute;
        enhanced.endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
      }
    }

    // Match participant emails to account IDs
    if (enhanced.participants && Array.isArray(enhanced.participants)) {
      enhanced.participantAccounts = enhanced.participants
        .map(email => accounts.find(acc => acc.email.toLowerCase() === email.toLowerCase()))
        .filter(Boolean)
        .map(acc => acc.id);
    }

    return enhanced;
  }

  // Check if Gemini AI is available
  isAvailable() {
    return this.isInitialized || this.initialize();
  }

  // Get conversation context for follow-up questions
  async getConversationContext(previousQuery, events, accounts) {
    if (!this.initialize()) return null;

    try {
      const prompt = `
Based on the previous query "${previousQuery}" and current calendar context, what follow-up questions might the user ask?

Provide 3-4 suggested questions as a JSON array of strings.
Examples: ["What about next week?", "Can we make it 2 hours?", "Add Sarah to the meeting"]

Only return the JSON array.
`;

      // Log the prompt for diagnostics
      try {
        if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.geminiLog === 'function') {
          window.electronAPI.geminiLog(prompt, 'getConversationContext');
        }
      } catch (e) { /* ignore */ }

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text_response = response.text();
      
      const jsonMatch = text_response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to generate conversation context:', error);
      return null;
    }
  }

  // Answer a free-form query about the calendar using events as context
  async answerQuery(query, events, accounts, startDate, endDate, options = {}) {
    if (!this.initialize()) {
      throw new Error('Gemini AI not available');
    }

    try {
      const lang = (options.lang || 'ru').toLowerCase();
      const languageInstruction = lang.startsWith('ru') ? 'Please answer in Russian.' : 'Please answer in English.';
      const dateRange = startDate && endDate ? `${safeFormat(startDate, 'MMM d', '')} - ${safeFormat(endDate, 'MMM d, yyyy', '')}` : 'current date range';

  // Provide a reference date for answer queries to avoid model-relative-date ambiguity
  const referenceDate = safeFormat(startDate || new Date(), 'yyyy-MM-dd', '');

  const eventsData = (events || []).map(event => ({
        title: event.summary || event.title,
        description: event.description || '',
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        isAllDay: !!(event.start && event.start.date && !event.start.dateTime),
        account: event.accountName || event.accountEmail
      }));

      const prompt = `
${languageInstruction}
You are given a user's calendar data and a question. Answer the question concisely and in a way suitable for TTS (short clear sentences).

Reference date: ${referenceDate}

Date Range: ${dateRange}
Accounts: ${accounts.map(acc => acc.name).join(', ')}

Events:
${JSON.stringify(eventsData, null, 2)}

Question: "${query}"

Respond with plain text only, suitable for speech synthesis. Keep the answer under 200 words.
`;
      // Log the prompt for diagnostics/audit if available
      try {
        if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.geminiLog === 'function') {
          window.electronAPI.geminiLog(prompt, 'answerQuery');
        }
      } catch (e) { /* ignore */ }

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Answer query failed:', error);
      throw new Error('Failed to answer query');
    }
  }
}

export const geminiService = new GeminiService();
export { GeminiService };
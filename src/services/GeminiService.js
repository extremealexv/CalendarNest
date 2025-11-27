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
- "Next week" means 7 days from today
- Relative days like "Monday" refer to the next occurrence
- Business hours default: 9 AM - 5 PM
- Extract participant names and match to available accounts
- Be conservative with confidence scores
- If ambiguous, ask for clarification in the title field

Only return the JSON object, no other text.
`;

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
      
      // Prepare events data for analysis
      const eventsData = events.map(event => ({
        title: event.summary || event.title,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        account: event.accountName || event.accountEmail
      }));

  const prompt = `
${languageInstruction}
Analyze the following calendar data and provide a natural language summary of availability and conflicts for the family.

Important: format the summary to be read aloud by a TTS engine. Use short, clear sentences; avoid lists, bullet points, emojis, markdown, or excessive punctuation. Expand abbreviations and write times in a TTS-friendly way (e.g., "1 PM", "13:00"). Do not include links or code. Limit the output to plain text (no JSON) and keep it under 180 words. If producing names or locations, return them as spoken-friendly phrases.

Date Range: ${dateRange}
Accounts: ${accounts.map(acc => acc.name).join(', ')}

Events:
${JSON.stringify(eventsData, null, 2)}

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
        // Aggregate events per account
        const counts = {};
        (events || []).forEach(ev => {
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
          const s = ev.start?.dateTime || ev.start?.date;
          if (!s) return false;
          const d = new Date(s);
          return d.getDay() === 0 || d.getDay() === 6;
        });

        const summaryParts = [];
        if (lang && lang.startsWith('ru')) {
          summaryParts.push(`Самая занятая запись: ${busiest}`);
          if (best.length) summaryParts.push(`Подходящее время для встреч: ${best.join(', ')}`);
          summaryParts.push(`Всего событий: ${(events || []).length}`);
          summaryParts.push(weekendEvents.length ? `Есть ${weekendEvents.length} событий в выходные.` : 'Выходные в основном свободны.');
        } else {
          summaryParts.push(`Busiest calendar: ${busiest}`);
          if (best.length) summaryParts.push(`Good meeting times: ${best.join(', ')}`);
          summaryParts.push(`${(events || []).length} events in the selected range.`);
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
      const eventsContext = events.map(e => ({
        title: e.summary || e.title,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        account: e.accountName
      }));

      const prompt = `
Based on the query "${query}" and the following calendar information, suggest 3 optimal meeting times.

Accounts: ${accounts.map(acc => acc.name).join(', ')}
Current Events: ${JSON.stringify(eventsContext, null, 2)}

Preferences:
- Preferred duration: ${preferences.duration || '1 hour'}
- Preferred time of day: ${preferences.timeOfDay || 'business hours'}
- Avoid weekends: ${preferences.avoidWeekends || false}

Respond with a JSON array of suggestions:
[
  {
    "date": "YYYY-MM-DD",
    "startTime": "HH:mm",
    "endTime": "HH:mm", 
    "reason": "Why this time is good",
    "conflicts": ["Any minor conflicts"]
  }
]

Only return the JSON array, no other text.
`;

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
}

export const geminiService = new GeminiService();
export { GeminiService };
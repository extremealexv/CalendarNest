import { format as dfFormat, isValid, parseISO } from 'date-fns';

function tryParseDate(d) {
  if (!d) return null;
  if (d instanceof Date) return isValid(d) ? d : null;
  if (typeof d === 'number') {
    const dt = new Date(d);
    return isValid(dt) ? dt : null;
  }
  if (typeof d === 'string') {
    // Prefer ISO parse
    const iso = parseISO(d);
    if (isValid(iso)) return iso;
    const fallback = new Date(d);
    return isValid(fallback) ? fallback : null;
  }
  return null;
}

export function safeFormat(d, fmt, fallback = '') {
  const dt = tryParseDate(d);
  if (!dt) return fallback;
  try {
    return dfFormat(dt, fmt);
  } catch (err) {
    return fallback;
  }
}

export function safeParse(d) {
  return tryParseDate(d);
}

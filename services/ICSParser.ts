import type { Todo } from '../types';
import { CalendarTodoService } from './CalendarTodoService';

interface RecurrenceRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval?: number;
  count?: number;
  until?: Date;
  byday?: string[]; // MO, TU, WE, TH, FR, SA, SU
  bymonthday?: number[];
}

interface ICSEvent {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  uid: string;
  rrule?: RecurrenceRule;
}

/**
 * Service to parse ICS (iCalendar) files and convert events to calendar-only todos
 */
export class ICSParser {
  /**
   * Parse an ICS file content and extract events
   */
  static parseICS(icsContent: string): ICSEvent[] {
    const events: ICSEvent[] = [];
    const lines = icsContent.split(/\r?\n/);

    let currentEvent: Partial<ICSEvent> | null = null;
    let currentField = '';

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      // Handle line continuations (lines starting with space or tab)
      while (i + 1 < lines.length && /^[ \t]/.test(lines[i + 1])) {
        i++;
        line += lines[i].trim();
      }

      if (line === 'BEGIN:VEVENT') {
        currentEvent = {};
      } else if (line === 'END:VEVENT' && currentEvent) {
        // Validate and add event
        if (currentEvent.summary && currentEvent.start && currentEvent.end && currentEvent.uid) {
          events.push(currentEvent as ICSEvent);
        }
        currentEvent = null;
      } else if (currentEvent) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const fieldPart = line.substring(0, colonIndex);
        const value = line.substring(colonIndex + 1);

        // Extract field name (before any semicolon for parameters)
        const field = fieldPart.split(';')[0];

        switch (field) {
          case 'SUMMARY':
            currentEvent.summary = this.unescapeText(value);
            break;
          case 'DESCRIPTION':
            currentEvent.description = this.unescapeText(value);
            break;
          case 'DTSTART':
            currentEvent.start = this.parseDateTime(value, fieldPart);
            break;
          case 'DTEND':
            currentEvent.end = this.parseDateTime(value, fieldPart);
            break;
          case 'UID':
            currentEvent.uid = value;
            break;
          case 'RRULE':
            currentEvent.rrule = this.parseRRule(value);
            break;
        }
      }
    }

    return events;
  }

  /**
   * Parse ICS date-time format
   * Supports: YYYYMMDDTHHmmss, YYYYMMDDTHHmmssZ, and VALUE=DATE:YYYYMMDD
   */
  private static parseDateTime(value: string, fieldPart: string): Date {
    // Check if it's a date-only field (VALUE=DATE)
    const isDateOnly = fieldPart.includes('VALUE=DATE');

    // Remove timezone suffix if present
    const cleanValue = value.replace(/Z$/, '');

    if (isDateOnly || cleanValue.length === 8) {
      // Date only: YYYYMMDD
      const year = parseInt(cleanValue.substring(0, 4));
      const month = parseInt(cleanValue.substring(4, 6)) - 1;
      const day = parseInt(cleanValue.substring(6, 8));
      return new Date(year, month, day);
    } else {
      // Date-time: YYYYMMDDTHHmmss
      const year = parseInt(cleanValue.substring(0, 4));
      const month = parseInt(cleanValue.substring(4, 6)) - 1;
      const day = parseInt(cleanValue.substring(6, 8));
      const hour = parseInt(cleanValue.substring(9, 11));
      const minute = parseInt(cleanValue.substring(11, 13));
      const second = parseInt(cleanValue.substring(13, 15)) || 0;

      return new Date(year, month, day, hour, minute, second);
    }
  }

  /**
   * Parse RRULE (Recurrence Rule)
   * Example: FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10
   */
  private static parseRRule(value: string): RecurrenceRule | undefined {
    const parts = value.split(';');
    const rule: Partial<RecurrenceRule> = {};

    for (const part of parts) {
      const [key, val] = part.split('=');

      switch (key) {
        case 'FREQ':
          if (val === 'DAILY' || val === 'WEEKLY' || val === 'MONTHLY' || val === 'YEARLY') {
            rule.freq = val;
          }
          break;
        case 'INTERVAL':
          rule.interval = parseInt(val);
          break;
        case 'COUNT':
          rule.count = parseInt(val);
          break;
        case 'UNTIL':
          // UNTIL peut être au format date ou datetime
          rule.until = this.parseDateTime(val, 'UNTIL');
          break;
        case 'BYDAY':
          rule.byday = val.split(',');
          break;
        case 'BYMONTHDAY':
          rule.bymonthday = val.split(',').map(d => parseInt(d));
          break;
      }
    }

    return rule.freq ? rule as RecurrenceRule : undefined;
  }

  /**
   * Unescape ICS text (remove escaping for special characters)
   */
  private static unescapeText(text: string): string {
    return text
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  /**
   * Generate recurring event occurrences based on RRULE
   * Returns an array of event instances with their start/end dates
   */
  private static generateRecurrences(event: ICSEvent): ICSEvent[] {
    if (!event.rrule) {
      return [event];
    }

    const occurrences: ICSEvent[] = [];
    const rule = event.rrule;
    const interval = rule.interval || 1;
    const duration = event.end.getTime() - event.start.getTime();

    // Mapping des jours de la semaine
    const dayMap: Record<string, number> = {
      SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6
    };

    let currentDate = new Date(event.start);
    let occurrenceCount = 0;
    const maxCount = rule.count || 365; // Limite par défaut pour éviter les boucles infinies
    const maxDate = rule.until || new Date(event.start.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 an par défaut

    while (occurrenceCount < maxCount && currentDate <= maxDate) {
      let includeOccurrence = false;

      // Vérifier si cette occurrence correspond aux critères
      switch (rule.freq) {
        case 'DAILY':
          includeOccurrence = true;
          break;

        case 'WEEKLY':
          if (rule.byday && rule.byday.length > 0) {
            const currentDay = currentDate.getDay();
            includeOccurrence = rule.byday.some(day => dayMap[day] === currentDay);
          } else {
            includeOccurrence = true;
          }
          break;

        case 'MONTHLY':
          if (rule.bymonthday && rule.bymonthday.length > 0) {
            const currentDayOfMonth = currentDate.getDate();
            includeOccurrence = rule.bymonthday.includes(currentDayOfMonth);
          } else {
            // Si pas de BYMONTHDAY, utiliser le jour du mois de la date de début
            includeOccurrence = currentDate.getDate() === event.start.getDate();
          }
          break;

        case 'YEARLY':
          includeOccurrence = currentDate.getMonth() === event.start.getMonth() &&
                             currentDate.getDate() === event.start.getDate();
          break;
      }

      if (includeOccurrence) {
        const occurrenceStart = new Date(currentDate);
        const occurrenceEnd = new Date(currentDate.getTime() + duration);

        occurrences.push({
          ...event,
          start: occurrenceStart,
          end: occurrenceEnd,
          uid: `${event.uid}-${occurrenceCount}`, // UID unique pour chaque occurrence
        });

        occurrenceCount++;
      }

      // Avancer à la prochaine date potentielle
      switch (rule.freq) {
        case 'DAILY':
          currentDate.setDate(currentDate.getDate() + interval);
          break;
        case 'WEEKLY':
          if (rule.byday && rule.byday.length > 0) {
            // Avancer au prochain jour de la semaine spécifié
            currentDate.setDate(currentDate.getDate() + 1);
          } else {
            currentDate.setDate(currentDate.getDate() + (7 * interval));
          }
          break;
        case 'MONTHLY':
          if (rule.bymonthday && rule.bymonthday.length > 0) {
            // Avancer au prochain jour du mois
            currentDate.setDate(currentDate.getDate() + 1);
          } else {
            currentDate.setMonth(currentDate.getMonth() + interval);
          }
          break;
        case 'YEARLY':
          currentDate.setFullYear(currentDate.getFullYear() + interval);
          break;
      }

      // Protection contre les boucles infinies
      if (occurrenceCount > 1000) {
        break;
      }
    }

    return occurrences;
  }

  /**
   * Convert ICS events to calendar-only todos
   * Handles recurring events by generating all occurrences
   */
  static convertToTodos(icsEvents: ICSEvent[]): Todo[] {
    const allTodos: Todo[] = [];

    for (const event of icsEvents) {
      // Generate all occurrences (for recurring events) or single event
      const occurrences = this.generateRecurrences(event);

      // Convert each occurrence to a Todo
      for (const occurrence of occurrences) {
        const date = this.formatDate(occurrence.start);
        const duration = Math.round((occurrence.end.getTime() - occurrence.start.getTime()) / (1000 * 60));

        // Check if this is an all-day event (no time component)
        const isAllDay = occurrence.start.getHours() === 0 &&
                         occurrence.start.getMinutes() === 0 &&
                         occurrence.start.getSeconds() === 0 &&
                         duration >= 1440; // 24 hours or more

        const todo: Todo = {
          id: `ics-${occurrence.uid}`,
          text: occurrence.summary,
          date,
          time: isAllDay ? undefined : this.formatTime(occurrence.start),
          duration: isAllDay ? undefined : duration,
          tags: event.rrule ? ['recurring'] : [], // Tag recurring events
          status: 'todo',
          isCalendarOnly: true,
          icsUid: occurrence.uid, // Store unique UID for each occurrence
        };

        allTodos.push(todo);
      }
    }

    return allTodos;
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private static formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Format time as HH:mm
   */
  private static formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Check if a todo with the same ICS UID already exists
   */
  static isDuplicate(todo: Todo, existingTodos: Todo[]): boolean {
    if (!todo.icsUid) return false;

    return existingTodos.some(existing =>
      existing.icsUid === todo.icsUid
    );
  }

  /**
   * Filter out duplicate todos based on ICS UID
   */
  static filterDuplicates(newTodos: Todo[], existingTodos: Todo[]): Todo[] {
    return newTodos.filter(todo => !this.isDuplicate(todo, existingTodos));
  }

  /**
   * Split todos into duplicates and unique ones
   * Returns { duplicates: Todo[], unique: Todo[] }
   */
  static separateDuplicates(newTodos: Todo[], existingTodos: Todo[]): { duplicates: Todo[], unique: Todo[] } {
    const duplicates: Todo[] = [];
    const unique: Todo[] = [];

    for (const todo of newTodos) {
      if (this.isDuplicate(todo, existingTodos)) {
        duplicates.push(todo);
      } else {
        unique.push(todo);
      }
    }

    return { duplicates, unique };
  }

  /**
   * Get all existing todos that match the ICS UIDs from the base event
   * This helps identify all occurrences of a recurring event
   */
  static getExistingEventsByBaseUid(newTodos: Todo[], existingTodos: Todo[]): Todo[] {
    const baseUids = new Set<string>();

    // Extract base UIDs from new todos (remove occurrence suffix)
    for (const todo of newTodos) {
      if (todo.icsUid) {
        const baseUid = todo.icsUid.split('-')[0];
        baseUids.add(baseUid);
      }
    }

    // Find all existing todos with matching base UIDs
    return existingTodos.filter(existing => {
      if (!existing.icsUid) return false;
      const baseUid = existing.icsUid.split('-')[0];
      return baseUids.has(baseUid);
    });
  }
}

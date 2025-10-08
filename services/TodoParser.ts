import { TFile, Vault } from 'obsidian';
import type { Todo, Priority, Status, TodoColor } from '../types';

/**
 * TodoParser - Parse les fichiers markdown pour extraire les todos
 *
 * Format supporté :
 * - [ ] Task text #tag1 #tag2 @2025-10-06 14:30 !high ⏱60min
 * - [x] Completed task
 * - [>] In progress task
 * - [-] Cancelled task
 */
export class TodoParser {
  constructor() {
  }


  /**
   * Parse une ligne de tâche markdown avec métadonnées inline
   * Format: - [x] Task text #tag @date time !priority ⏱duration
   */
  parseTaskLine(line: string, filePath: string, lineNumber: number): Todo | null {
    // Regex pour détecter une tâche markdown
    const taskRegex = /^[\s-]*\[([ x>\-])\]\s+(.+)$/i;
    const match = line.match(taskRegex);

    if (!match) {
      return null;
    }

    const statusChar = match[1];
    let text = match[2].trim();

    // Extraire les métadonnées
    const tags = this.extractTags(text);
    const { date, time } = this.extractDateTime(text);
    const priority = this.extractPriority(text);
    const duration = this.extractDuration(text);
    const status = this.extractStatus(statusChar);

    // Nettoyer le texte en retirant les métadonnées
    text = this.cleanText(text);

    // Générer un ID unique basé sur le fichier et la ligne
    const id = `${filePath}:${lineNumber}`;

    return {
      id,
      text,
      date,
      time,
      duration,
      tags,
      priority,
      status,
      filePath,
      lineNumber,
    };
  }

  /**
   * Extrait les tags d'une ligne (#tag)
   */
  extractTags(line: string): string[] {
    const tagRegex = /#([a-zA-Z0-9_-]+)/g;
    const tags: string[] = [];
    let match;

    while ((match = tagRegex.exec(line)) !== null) {
      tags.push(match[1]);
    }

    return tags;
  }

  /**
   * Extrait la date et l'heure
   * Nouveau format Tasks: ⏳ YYYY-MM-DD et ⏰ HH:MM
   * Ancien format (rétrocompatibilité): @YYYY-MM-DD HH:MM
   */
  extractDateTime(line: string): { date?: string; time?: string } {
    // Nouveau format Tasks : ⏳2025-10-06 et ⏰14:30
    const scheduledDateRegex = /⏳(\d{4}-\d{2}-\d{2})/;
    const timeRegex = /⏰(\d{2}:\d{2})/;

    const dateMatch = line.match(scheduledDateRegex);
    const timeMatch = line.match(timeRegex);

    if (dateMatch) {
      return {
        date: dateMatch[1],
        time: timeMatch ? timeMatch[1] : undefined,
      };
    }

    // Fallback ancien format: @2025-10-06 14:30 ou @2025-10-06
    const oldDateTimeRegex = /@(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/;
    const oldMatch = line.match(oldDateTimeRegex);

    if (oldMatch) {
      return {
        date: oldMatch[1],
        time: oldMatch[2] || undefined,
      };
    }

    return {};
  }

  /**
   * Extrait la priorité (!low|medium|high|critical)
   */
  extractPriority(line: string): Priority | undefined {
    const priorityRegex = /!(low|medium|high|critical)/i;
    const match = line.match(priorityRegex);

    if (match) {
      return match[1].toLowerCase() as Priority;
    }

    return undefined;
  }

  /**
   * Extrait la durée (⏱XXmin ou ⏱XXh ou ⏱XXhYYmin ou ⏱XXhYY)
   */
  extractDuration(line: string): number | undefined {
    // Format: ⏱60min, ⏱2h, ⏱2h30min, ⏱2h30
    const durationRegex = /⏱(\d+)h(?:(\d+)(?:min)?)?|⏱(\d+)min/;
    const match = line.match(durationRegex);

    if (match) {
      // Format ⏱XXhYY or ⏱XXhYYmin
      if (match[1]) {
        const hours = parseInt(match[1], 10);
        const minutes = match[2] ? parseInt(match[2], 10) : 0;
        return hours * 60 + minutes;
      }
      // Format ⏱XXmin
      if (match[3]) {
        return parseInt(match[3], 10);
      }
    }

    return undefined;
  }

  /**
   * Détermine le status depuis le checkbox ([ ], [x], [>], [-])
   */
  extractStatus(char: string): Status {
    switch (char.toLowerCase()) {
      case 'x':
        return 'done';
      case '>':
        return 'in-progress';
      case '-':
        return 'cancelled';
      default:
        return 'todo';
    }
  }

  /**
   * Nettoie le texte en retirant les métadonnées inline
   */
  private cleanText(text: string): string {
    return text
      // Retirer les tags
      .replace(/#[a-zA-Z0-9_-]+/g, '')
      // Retirer la date scheduled (nouveau format)
      .replace(/⏳\d{4}-\d{2}-\d{2}/g, '')
      // Retirer l'heure (nouveau format)
      .replace(/⏰\d{2}:\d{2}/g, '')
      // Retirer la date/heure (ancien format)
      .replace(/@\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?/g, '')
      // Retirer la priorité
      .replace(/!(low|medium|high|critical)/gi, '')
      // Retirer la durée (formats: ⏱XXmin, ⏱XXh, ⏱XXhYY, ⏱XXhYYmin)
      .replace(/⏱\d+h\d+(?:min)?/g, '')
      .replace(/⏱\d+(?:min|h)/g, '')
      // Nettoyer les espaces multiples
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Construit une ligne de tâche à partir d'un Todo
   * Nouveau format Tasks: ⏳ date, ⏰ time
   */
  buildTaskLine(todo: Todo): string {
    const checkbox = {
      'todo': '[ ]',
      'in-progress': '[>]',
      'done': '[x]',
      'cancelled': '[-]',
    }[todo.status];

    const tags = todo.tags.map(t => `#${t}`).join(' ');
    const priority = todo.priority ? `!${todo.priority}` : '';

    // Grouper les métadonnées temporelles ensemble (date + time + duration)
    const temporalParts = [
      todo.date ? `⏳${todo.date}` : '',
      todo.time ? `⏰${todo.time}` : '',
      todo.duration
        ? (todo.duration >= 60
            ? (() => {
                const hours = Math.floor(todo.duration / 60);
                const minutes = todo.duration % 60;
                return minutes > 0 ? `⏱${hours}h${minutes}` : `⏱${hours}h`;
              })()
            : `⏱${todo.duration}min`)
        : ''
    ].filter(p => p).join(' ');

    const parts = [
      `- ${checkbox}`,
      todo.text,
      temporalParts,
      tags,
      priority,
    ].filter(p => p);

    return parts.join(' ');
  }
}
